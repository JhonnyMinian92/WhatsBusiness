import assert from "node:assert/strict";
import test from "node:test";
import { HmacTenantPseudonymizer } from "./tenant-hmac-pseudonymizer.js";
import { TenantTelemetryContext } from "./tenant-telemetry-context.js";

const pseudonymizer = new HmacTenantPseudonymizer(new Uint8Array(32).fill(7));
const telemetry = new TenantTelemetryContext(pseudonymizer);

test("tenant identity is HMAC-pseudonymized in logs and excluded from metrics", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const logs = telemetry.logAttributes({
    tenantId,
    correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  const metrics = telemetry.metricDimensions({
    operation: "worker.execute",
    outcome: "success",
    component: "worker",
  });
  assert.equal(logs.tenant_ref, pseudonymizer.pseudonymize(tenantId));
  assert.equal("tenantId" in metrics, false);
  assert.equal(JSON.stringify(metrics).includes(tenantId), false);
});

test("metric labels reject unbounded and arbitrary dimensions", () => {
  assert.throws(() => telemetry.metricDimensions({
    operation: "customer.email@example.com",
    outcome: "success",
    component: "worker",
  }));
  assert.throws(() => telemetry.logAttributes({
    tenantId: "not-a-uuid",
    correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  }));
});
