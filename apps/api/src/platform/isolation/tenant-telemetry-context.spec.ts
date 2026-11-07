import assert from "node:assert/strict";
import test from "node:test";
import { TenantTelemetryContext } from "./tenant-telemetry-context.js";

const telemetry = new TenantTelemetryContext({
  pseudonymize: (tenantId) => `tenant-${tenantId.slice(0, 8)}`,
});

test("tenant identity is pseudonymized in logs and excluded from metrics", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const logs = telemetry.logAttributes({
    tenantId,
    correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  const metrics = telemetry.metricDimensions({
    operation: "inbox.consume",
    outcome: "success",
    component: "worker",
  });
  assert.equal(logs.tenant_ref, "tenant-11111111");
  assert.equal("tenantId" in metrics, false);
  assert.equal(JSON.stringify(metrics).includes(tenantId), false);
});

test("metric labels reject unbounded and arbitrary dimensions", () => {
  assert.throws(() => telemetry.metricDimensions({
    operation: "customer.email@example.com",
    outcome: "success",
    component: "worker",
  }));
});
