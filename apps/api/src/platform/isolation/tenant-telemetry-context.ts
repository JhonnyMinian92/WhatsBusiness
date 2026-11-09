import type { TenantPseudonymizer } from "./tenant-pseudonymizer.js";

export interface TenantTelemetryIdentity {
  readonly tenantId: string;
  readonly correlationId: string;
}

export interface SafeMetricDimensions {
  readonly operation: string;
  readonly outcome: "success" | "error" | "denied";
  readonly component: string;
}

const ALLOWED_OPERATIONS = new Set([
  "api.request",
  "worker.execute",
  "cache.get",
  "cache.set",
  "cache.delete",
  "storage.get",
  "storage.put",
  "storage.delete",
  "webhook.process",
  "outbox.publish",
  "meta.request",
]);
const ALLOWED_COMPONENTS = new Set([
  "api",
  "worker",
  "cache",
  "storage",
  "webhook",
  "outbox",
  "meta",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Separates tenant identity from telemetry labels; raw tenant IDs never become metric labels. */
export class TenantTelemetryContext {
  constructor(private readonly pseudonymizer: TenantPseudonymizer) {}

  logAttributes(identity: TenantTelemetryIdentity): Readonly<Record<string, string>> {
    if (!UUID_PATTERN.test(identity.tenantId) || !UUID_PATTERN.test(identity.correlationId)) {
      throw new Error("Valid tenant and correlation UUIDs are required for telemetry.");
    }
    const tenantRef = this.pseudonymizer.pseudonymize(identity.tenantId);
    if (tenantRef === identity.tenantId || !/^hmacv1_[0-9a-f]{64}$/.test(tenantRef)) {
      throw new Error("Tenant telemetry must use a versioned HMAC pseudonym.");
    }
    return Object.freeze({ tenant_ref: tenantRef, correlation_id: identity.correlationId });
  }

  metricDimensions(dimensions: SafeMetricDimensions): Readonly<SafeMetricDimensions> {
    if (!ALLOWED_OPERATIONS.has(dimensions.operation)
      || !ALLOWED_COMPONENTS.has(dimensions.component)
      || !["success", "error", "denied"].includes(dimensions.outcome)) {
      throw new Error("Telemetry metric dimensions must use the bounded platform vocabulary.");
    }
    return Object.freeze({ ...dimensions });
  }
}
