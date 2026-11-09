import type { RateLimitReservation, RateLimitStateStore } from "./adaptive-rate-limiter.js";
import type { CacheEntry, MetadataCacheStore } from "./metadata-cache.js";

export interface RedisEvalClient {
  eval(script: string, keys: readonly string[], arguments_: readonly string[]): Promise<unknown>;
}

const RESERVE = `
local time=redis.call('TIME')
local now=tonumber(time[1])*1000+math.floor(tonumber(time[2])/1000)
local count=tonumber(ARGV[1])
local slot=now
for i=1,count do
  local nextAt=tonumber(redis.call('HGET',KEYS[i],'nextSlotAt') or '0')
  local cooldown=tonumber(redis.call('HGET',KEYS[i],'cooldownUntil') or '0')
  if nextAt>slot then slot=nextAt end
  if cooldown>slot then slot=cooldown end
end
for i=1,count do
  local interval=tonumber(ARGV[1+i])
  redis.call('HSET',KEYS[i],'nextSlotAt',tostring(slot+interval))
  local cooldown=tonumber(redis.call('HGET',KEYS[i],'cooldownUntil') or '0')
  redis.call('PEXPIRE',KEYS[i],math.max(86400000,cooldown-now+60000,slot-now+interval+60000))
end
return math.max(0,slot-now)
`;
const OBSERVE = `
local time=redis.call('TIME')
local now=tonumber(time[1])*1000+math.floor(tonumber(time[2])/1000)
local untilAt=now+tonumber(ARGV[2])
local previous=tonumber(redis.call('HGET',KEYS[1],'cooldownUntil') or '0')
if untilAt<previous then untilAt=previous end
redis.call('HSET',KEYS[1],'utilization',ARGV[1],'cooldownUntil',tostring(untilAt),'lastObservedAt',tostring(now))
redis.call('PEXPIRE',KEYS[1],math.max(86400000,untilAt-now+60000))
return 1
`;
const READ_USAGE = `
local time=redis.call('TIME')
local now=tonumber(time[1])*1000+math.floor(tonumber(time[2])/1000)
local observed=tonumber(redis.call('HGET',KEYS[1],'lastObservedAt') or '0')
if observed==0 or now-observed>tonumber(ARGV[1]) then return 0 end
return tonumber(redis.call('HGET',KEYS[1],'utilization') or '0')
`;
const READ_COOLDOWN = `return tonumber(redis.call('HGET',KEYS[1],'cooldownUntil') or '0')`;

/** One atomic Lua reservation across app, tenant, connection, and asset scopes. */
export class RedisRateLimitStateStore implements RateLimitStateStore {
  constructor(private readonly redis: RedisEvalClient, private readonly prefix = "whatsbusiness:meta:rate:") {}
  async reserve(reservations: readonly RateLimitReservation[]): Promise<number> {
    if (!reservations.length) return 0;
    const appId = reservations.find(r => r.key.startsWith("app:"))?.key.slice(4);
    if (!appId) throw new Error("Every Redis reservation must include an app scope.");
    const keys = reservations.map(r => this.key(r.key, appId));
    const args = [String(reservations.length), ...reservations.map(r => String(r.intervalMs))];
    return numeric(await this.redis.eval(RESERVE, keys, args));
  }
  async observe(key: string, utilization: number, cooldownUntil: number, now: number): Promise<void> {
    await this.redis.eval(OBSERVE, [this.key(key, appFromKey(key))],
      [String(Math.max(0, Math.min(100, utilization))), String(Math.max(0, cooldownUntil - now))]);
  }
  async getCooldownUntil(key: string): Promise<number> {
    return numeric(await this.redis.eval(READ_COOLDOWN, [this.key(key, appFromKey(key))], []));
  }
  async getUtilization(key: string, _now: number, staleAfterMs: number): Promise<number> {
    return numeric(await this.redis.eval(READ_USAGE, [this.key(key, appFromKey(key))], [String(staleAfterMs)]));
  }
  private key(value: string, appId: string): string {
    // Redis Cluster hash tag keeps all app scopes in one slot for atomic cross-scope reservations.
    return `${this.prefix}{${encodeURIComponent(appId)}}:${encodeURIComponent(value)}`;
  }
}

export interface RedisScanResult { readonly cursor: string; readonly keys: readonly string[]; }
export interface RedisMetadataClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { readonly PX: number }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  scan(cursor: string, options: { readonly MATCH: string; readonly COUNT: number }): Promise<RedisScanResult>;
}

/** Shared metadata cache; prefix invalidation uses SCAN rather than blocking KEYS. */
export class RedisMetadataCacheStore implements MetadataCacheStore {
  constructor(private readonly redis: RedisMetadataClient, private readonly now = Date.now) {}
  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const raw = await this.redis.get(key);
    if (raw === null) return undefined;
    try {
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (typeof entry.expiresAt !== "number" || entry.expiresAt <= this.now()) {
        await this.redis.del(key); return undefined;
      }
      return entry;
    } catch {
      await this.redis.del(key); return undefined;
    }
  }
  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const ttl = Math.floor(entry.expiresAt - this.now());
    if (ttl <= 0) { await this.redis.del(key); return; }
    await this.redis.set(key, JSON.stringify(entry), { PX: ttl });
  }
  async delete(key: string): Promise<void> { await this.redis.del(key); }
  async deleteByPrefix(prefix: string): Promise<number> {
    let cursor = "0"; let deleted = 0;
    do {
      const page = await this.redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 250 });
      cursor = page.cursor;
      if (page.keys.length) deleted += await this.redis.del(...page.keys);
    } while (cursor !== "0");
    return deleted;
  }
}
function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Redis returned a non-numeric result.");
  return parsed;
}
function appFromKey(value: string): string {
  const app = value.split(":")[1];
  if (!app) throw new Error("Meta app ID missing from rate-limit scope.");
  return app;
}
