import { readHeader, type HeaderCollection } from "./contracts.js";

export type UsageScopeKind = "app" | "page" | "ad-account" | "business-use-case";
export type UsageMetrics = Readonly<Record<string, number>>;

export interface MetaBusinessUseCaseUsage {
  readonly businessId: string;
  readonly type: string;
  readonly samples: readonly UsageMetrics[];
}
export interface MetaUsageSnapshot {
  readonly app?: UsageMetrics;
  readonly page?: UsageMetrics;
  readonly adAccount?: UsageMetrics;
  readonly businessUseCases: readonly MetaBusinessUseCaseUsage[];
  readonly warnings: readonly string[];
}
export interface ScopedUsageSample {
  readonly scope: UsageScopeKind;
  readonly key: string;
  readonly metrics: UsageMetrics;
  readonly estimatedCooldownMs: number;
}

const FIELDS = new Set([
  "call_count", "call_volume", "total_cputime", "total_cpu_time", "cpu_time",
  "total_time", "estimated_time_to_regain_access", "acc_id_util_pct", "reset_time_duration",
]);
const APP = "x-app-usage";
const PAGE = "x-page-usage";
const BUC = "x-business-use-case-usage";
const AD = "x-ad-account-usage";

/** Parses all supported Meta quota headers defensively, retaining BUC type dimensions. */
export class MetaUsageHeaders {
  parse(headers: HeaderCollection): MetaUsageSnapshot {
    const warnings: string[] = [];
    const app = parseMetrics(readHeader(headers, APP), APP, warnings);
    const page = parseMetrics(readHeader(headers, PAGE), PAGE, warnings);
    const adAccount = parseMetrics(readHeader(headers, AD), AD, warnings);
    const businessUseCases = parseBusinessUseCases(readHeader(headers, BUC), warnings);
    return Object.freeze({
      ...(app ? { app } : {}),
      ...(page ? { page } : {}),
      ...(adAccount ? { adAccount } : {}),
      businessUseCases,
      warnings: Object.freeze(warnings),
    });
  }

  toScopedSamples(snapshot: MetaUsageSnapshot, scope: { appId: string; assetId?: string }): readonly ScopedUsageSample[] {
    const result: ScopedUsageSample[] = [];
    if (snapshot.app) result.push(sample("app", scope.appId, snapshot.app));
    if (snapshot.page && scope.assetId) result.push(sample("page", scope.assetId, snapshot.page));
    if (snapshot.adAccount && scope.assetId) result.push(sample("ad-account", scope.assetId, snapshot.adAccount));
    for (const business of snapshot.businessUseCases) {
      for (const metrics of business.samples) {
        result.push(sample("business-use-case", `${business.businessId}:${business.type}`, metrics));
      }
    }
    return Object.freeze(result);
  }
}

function sample(scope: UsageScopeKind, key: string, metrics: UsageMetrics): ScopedUsageSample {
  const minutes = metrics.estimated_time_to_regain_access ?? 0;
  const seconds = metrics.reset_time_duration ?? 0;
  return Object.freeze({
    scope, key, metrics,
    estimatedCooldownMs: Math.ceil(Math.max(minutes * 60_000, seconds * 1_000)),
  });
}

function parseMetrics(raw: string | undefined, name: string, warnings: string[]): UsageMetrics | undefined {
  if (!raw) return undefined;
  const value = parseJson(raw, name, warnings);
  if (!isRecord(value)) {
    if (value !== undefined) warnings.push(`${name} must contain a JSON object.`);
    return undefined;
  }
  const metrics: Record<string, number> = {};
  for (const [field, metric] of Object.entries(value)) {
    if (FIELDS.has(field) && typeof metric === "number" && Number.isFinite(metric)) {
      metrics[field] = Math.max(0, metric);
    }
  }
  return Object.freeze(metrics);
}

function parseBusinessUseCases(raw: string | undefined, warnings: string[]): readonly MetaBusinessUseCaseUsage[] {
  if (!raw) return Object.freeze([]);
  const value = parseJson(raw, BUC, warnings);
  if (!isRecord(value)) {
    if (value !== undefined) warnings.push(`${BUC} must contain a JSON object.`);
    return Object.freeze([]);
  }
  const groups = new Map<string, Map<string, UsageMetrics[]>>();
  for (const [businessId, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) { warnings.push(`${BUC} entry for ${businessId} is not an array.`); continue; }
    for (const item of entries) {
      if (!isRecord(item)) continue;
      const type = typeof item.type === "string" && item.type.trim() ? item.type : "unknown";
      const metrics: Record<string, number> = {};
      for (const [field, metric] of Object.entries(item)) {
        if (field !== "type" && field !== "business-id" && FIELDS.has(field)
          && typeof metric === "number" && Number.isFinite(metric)) metrics[field] = Math.max(0, metric);
      }
      if (Object.keys(metrics).length === 0) continue;
      const byType = groups.get(businessId) ?? new Map<string, UsageMetrics[]>();
      const samples = byType.get(type) ?? [];
      samples.push(Object.freeze(metrics));
      byType.set(type, samples);
      groups.set(businessId, byType);
    }
  }
  return Object.freeze([...groups].flatMap(([businessId, byType]) =>
    [...byType].map(([type, samples]) => Object.freeze({ businessId, type, samples: Object.freeze(samples) }))));
}

function parseJson(raw: string, name: string, warnings: string[]): unknown {
  try { return JSON.parse(raw); }
  catch { warnings.push(`${name} is not valid JSON.`); return undefined; }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
