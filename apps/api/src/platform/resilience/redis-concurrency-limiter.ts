import { randomUUID } from "node:crypto";
import { abortableSleep, throwIfAborted } from "./contracts.js";
import type { ConcurrencyLimiter } from "./keyed-concurrency-limiter.js";
import type { RedisEvalClient } from "./redis-state-stores.js";

const ACQUIRE = `
local time=redis.call('TIME')
local now=tonumber(time[1])*1000+math.floor(tonumber(time[2])/1000)
local capacity=tonumber(ARGV[1])
local maxQueue=tonumber(ARGV[2])
local lease=tonumber(ARGV[3])
local token=ARGV[4]
local maxWait=tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now)
redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',(now-maxWait)*1000)
local waiting=redis.call('ZRANGE',KEYS[2],0,-1)
local queued=false
for _,v in ipairs(waiting) do if v==token then queued=true break end end
if queued then
  local first=redis.call('ZRANGE',KEYS[2],0,0)[1]
  if redis.call('ZCARD',KEYS[1])<capacity and first==token then
    redis.call('ZREM',KEYS[2],token)
    redis.call('ZADD',KEYS[1],now+lease,token)
    redis.call('PEXPIRE',KEYS[1],lease+60000)
    return 1
  end
  return 0
end
local count=redis.call('ZCARD',KEYS[2])
if count==0 and redis.call('ZCARD',KEYS[1])<capacity then
  redis.call('ZADD',KEYS[1],now+lease,token)
  redis.call('PEXPIRE',KEYS[1],lease+60000)
  return 1
end
if count>=maxQueue then return -1 end
local seq=redis.call('INCR',KEYS[3])
redis.call('PEXPIRE',KEYS[3],86400000)
redis.call('ZADD',KEYS[2],now*1000+(seq%1000),token)
redis.call('PEXPIRE',KEYS[2],maxWait+60000)
return 0
`;
const RELEASE = `redis.call('ZREM',KEYS[1],ARGV[1]); return 1`;
const CANCEL = `redis.call('ZREM',KEYS[1],ARGV[1]); return 1`;

export class DistributedBulkheadRejectedError extends Error {
  constructor(readonly key: string) { super(`Distributed bulkhead queue is full for ${key}.`); this.name = "DistributedBulkheadRejectedError"; }
}
export interface RedisConcurrencyLimiterOptions {
  readonly maxConcurrency: number; readonly maxQueue: number; readonly leaseMs?: number;
  readonly maxWaitMs?: number; readonly pollIntervalMs?: number; readonly prefix?: string;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly tokenFactory?: () => string;
}

/** Distributed FIFO bulkhead. Expired waiters are pruned; lease must exceed the HTTP hard timeout. */
export class RedisConcurrencyLimiter implements ConcurrencyLimiter {
  private readonly leaseMs: number; private readonly maxWaitMs: number; private readonly pollMs: number;
  private readonly prefix: string; private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly tokenFactory: () => string;
  constructor(private readonly redis: RedisEvalClient, private readonly options: RedisConcurrencyLimiterOptions) {
    positive(options.maxConcurrency, "maxConcurrency"); nonNegative(options.maxQueue, "maxQueue");
    this.leaseMs = positive(options.leaseMs ?? 120_000, "leaseMs");
    this.maxWaitMs = positive(options.maxWaitMs ?? 15_000, "maxWaitMs");
    this.pollMs = positive(options.pollIntervalMs ?? 50, "pollIntervalMs");
    this.prefix = options.prefix ?? "whatsbusiness:meta:bulkhead:";
    this.sleep = options.sleep ?? abortableSleep; this.tokenFactory = options.tokenFactory ?? randomUUID;
  }
  async acquire(key: string, signal?: AbortSignal): Promise<() => void> {
    if (!key.trim()) throw new Error("Bulkhead key is required.");
    throwIfAborted(signal);
    const token = this.tokenFactory();
    const tag = `{${encodeURIComponent(key)}}`;
    const keys = [`${this.prefix}${tag}:active`, `${this.prefix}${tag}:waiting`, `${this.prefix}${tag}:sequence`];
    const started = Date.now();
    while (Date.now() - started < this.maxWaitMs) {
      throwIfAborted(signal);
      const value = Number(await this.redis.eval(ACQUIRE, keys, [
        String(this.options.maxConcurrency), String(this.options.maxQueue), String(this.leaseMs), token, String(this.maxWaitMs),
      ]));
      if (value === 1) {
        if (signal?.aborted) { await this.redis.eval(RELEASE, [keys[0]], [token]); throwIfAborted(signal); }
        let released = false;
        return () => { if (released) return; released = true; void this.redis.eval(RELEASE, [keys[0]], [token]).catch(() => undefined); };
      }
      if (value === -1) throw new DistributedBulkheadRejectedError(key);
      try { await this.sleep(this.pollMs, signal); }
      catch (error) { await this.redis.eval(CANCEL, [keys[1]], [token]); throw error; }
    }
    await this.redis.eval(CANCEL, [keys[1]], [token]);
    throw new DistributedBulkheadRejectedError(key);
  }
}
function positive(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be positive.`); return value;
}
function nonNegative(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be non-negative.`); return value;
}
