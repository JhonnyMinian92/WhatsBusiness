import type {
  TenantJobRuntimeMetricsReader,
  TenantJobRuntimeMetricsSnapshotPatch,
} from "../../application/tenant-job-runtime-metrics.js";

export type TenantJobMetricsSourceName = "postgres" | "rabbitmq";

export interface NamedTenantJobRuntimeMetricsReader {
  readonly source: TenantJobMetricsSourceName;
  readonly reader: TenantJobRuntimeMetricsReader;
}

/**
 * Combines independently sampled aggregate sources.
 * A failed source does not prevent a healthy source from refreshing its gauges.
 */
export class CompositeTenantJobRuntimeMetricsReader implements TenantJobRuntimeMetricsReader {
  constructor(
    private readonly sources: readonly NamedTenantJobRuntimeMetricsReader[],
    private readonly onReadFailure: (source: TenantJobMetricsSourceName) => void = () => undefined,
  ) {
    if (sources.length === 0) throw new Error("At least one tenant job metrics reader must be registered.");
    const names = new Set<TenantJobMetricsSourceName>();
    for (const source of sources) {
      if (names.has(source.source)) throw new Error("Tenant job metrics source names must be unique.");
      names.add(source.source);
    }
  }

  async readSnapshot(): Promise<TenantJobRuntimeMetricsSnapshotPatch> {
    const results = await Promise.allSettled(
      this.sources.map(({ reader }) => reader.readSnapshot()),
    );
    const merged: Record<string, number> = {};

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index]!;
      if (result.status === "rejected") {
        try {
          this.onReadFailure(this.sources[index]!.source);
        } catch {
          // Metrics error reporting must never stop the durable job runtime.
        }
        continue;
      }

      for (const [key, value] of Object.entries(result.value)) {
        if (Object.prototype.hasOwnProperty.call(merged, key)) {
          throw new Error("Multiple tenant job metrics readers own the same snapshot field: " + key + ".");
        }
        if (!Number.isFinite(value) || value < 0) {
          throw new Error("Tenant job metrics reader returned an invalid snapshot value: " + key + ".");
        }
        merged[key] = value;
      }
    }

    return Object.freeze(merged) as TenantJobRuntimeMetricsSnapshotPatch;
  }
}
