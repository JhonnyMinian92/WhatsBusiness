import type { MetaRequestObserver, MetaRequestObservation } from "./resilient-meta-executor.js";
import type { TenantTelemetryContext } from "../isolation/tenant-telemetry-context.js";

export interface SafeTelemetrySink {
  emit(event: Readonly<Record<string, string | number>>): void | Promise<void>;
}

/** Emits bounded dimensions and pseudonymous tenant identity; never receives tokens or payloads. */
export class SafeMetaRequestTelemetry implements MetaRequestObserver {
  constructor(
    private readonly context: TenantTelemetryContext,
    private readonly sink: SafeTelemetrySink,
  ) {}

  async record(observation: MetaRequestObservation): Promise<void> {
    const dimensions = this.context.metricDimensions({
      operation: "meta.request",
      outcome: observation.outcome,
      component: "meta",
    });
    const identity = this.context.logAttributes({
      tenantId: observation.context.tenantId,
      correlationId: observation.context.correlationId,
    });
    await this.sink.emit(Object.freeze({
      ...identity,
      ...dimensions,
      product: observation.context.product,
      attempt: observation.attempt,
      duration_ms: observation.durationMs,
      ...(observation.status === undefined ? {} : { status_code: observation.status }),
      ...(observation.requestId ? { request_id: observation.requestId } : {}),
      ...(observation.fbtraceId ? { fbtrace_id: observation.fbtraceId } : {}),
      ...(observation.errorCode === undefined ? {} : { meta_error_code: observation.errorCode }),
    }));
  }
}
