import assert from "node:assert/strict";
import test from "node:test";
import { HmacTenantPseudonymizer } from "./tenant-hmac-pseudonymizer.js";
import { TenantTelemetryContext } from "./tenant-telemetry-context.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";

test("telemetry never exposes the tenant identifier as a log dimension", () => {
  const telemetry = new TenantTelemetryContext(new HmacTenantPseudonymizer(new Uint8Array(32).fill(9)));
  const attributes = telemetry.logAttributes({ tenantId, correlationId });
  assert.equal(attributes.correlation_id, correlationId);
  assert.match(attributes.tenant_ref ?? "", /^hmacv1_[a-f0-9]{64}$/);
  assert.notEqual(attributes.tenant_ref, tenantId);
  assert.equal(Object.isFrozen(attributes), true);
});

test("telemetry rejects unbounded metric dimensions", () => {
  const telemetry = new TenantTelemetryContext(new HmacTenantPseudonymizer(new Uint8Array(32).fill(9)));
  assert.throws(() => telemetry.metricDimensions({
    operation: "send-message-to-+593999999999",
    component: "api",
    outcome: "success"
  }));
  assert.throws(() => telemetry.metricDimensions({
    operation: "api.request",
    component: "tenant-11111111-1111-4111-8111-111111111111",
    outcome: "success"
  }));
});
