import assert from "node:assert/strict";
import test from "node:test";
import { ReadinessService } from "./readiness.service.js";

test("readiness fails closed until all mandatory adapters are configured", () => {
  const service = new ReadinessService();
  const snapshot = service.snapshot();

  assert.equal(snapshot.ready, false);
  assert.deepEqual(snapshot.checks.map((check) => check.name), [
    "postgresql",
    "rabbitmq",
    "valkey",
    "oidc",
  ]);
  assert.ok(snapshot.checks.every((check) => check.status === "degraded"));
});
