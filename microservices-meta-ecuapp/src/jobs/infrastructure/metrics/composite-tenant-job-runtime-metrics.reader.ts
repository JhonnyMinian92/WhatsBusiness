import type {
  TenantJobRuntimeMetricsReader,
  TenantJobRuntimeMetricsSnapshotPatch,
} from "../../application/tenant-job-runtime-metrics.js";

/** Combines independently sampled metrics sources without inventing missing zeroes. */
export class CompositeTenantJobRuntimeMetricsReader implements TenantJobRuntimeMetricsReader {
  constructor(private readonly readers: readonly TenantJobRuntimeMetricsReader[]) {
    if (readers.length === 0) throw new Error("At least one tenant job metrics reader must be registered.");
  }

  async readSnapshot(): Promise<TenantJobRuntimeMetricsSnapshotPatch> {
    const snapshots = await Promise.all(this.readers.map((reader) => reader.readSnapshot()));
    const merged: Record<string, number> = {};
    for (const snapshot of snapshots) {
      for (const [key, value] of Object.entries(snapshot)) {
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
