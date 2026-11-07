export interface TenantTelemetryIdentity {
  readonly tenantId: string;
  readonly correlationId: string;
}

export interface TenantPseudonymizer {
  pseudonymize(tenantId: string): string;
}

export interface SafeMetricDimensions {
  readonly operation: string;
  readonly outcome: "success" | "error" | "denied";
  readonly component: string;
}

/**
 * Separates high-cardinality tenant identity from metric dimensions.
 * Logs may carry a keyed pseudonym; raw tenant IDs never become metric labels.
 */
export class TenantTelemetryContext {
  constructor(private readonly pseudonymizer: TenantPseudonymizer) {}

  logAttributes(identity: TenantTelemetryIdentity): Readonly<Record<string, string>> {
    return Object.freeze({
      tenant_ref: this.pseudonymizer.pseudonymize(identity.tenantId),
      correlation_id: identity.correlationId,
    });
  }

  metricDimensions(dimensions: SafeMetricDimensions): Readonly<SafeMetricDimensions> {
    assertBoundedIdentifier(dimensions.operation, "operation");
    assertBoundedIdentifier(dimensions.component, "component");
    if (!["success", "error", "denied"].includes(dimensions.outcome)) {
      throw new Error("Unsupported telemetry outcome.");
    }
    return Object.freeze({ ...dimensions });
  }
}

function assertBoundedIdentifier(value: string, field: string): void {
  if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(value)) {
    throw new Error(`Telemetry ${field} must be a bounded low-cardinality identifier.`);
  }
}
