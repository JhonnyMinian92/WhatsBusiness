import assert from "node:assert/strict";
import test from "node:test";
import { TenantContext } from "./tenant-context.js";

test("tenant context is isolated across asynchronous operations", async () => {
  const context = new TenantContext();
  const tenantA = "11111111-1111-4111-8111-111111111111";
  const tenantB = "22222222-2222-4222-8222-222222222222";
  const results = await Promise.all([
    context.run({ tenantId: tenantA, userId: "user-a" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return context.current().tenantId;
    }),
    context.run({ tenantId: tenantB, userId: "user-b" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return context.current().tenantId;
    })
  ]);
  assert.deepEqual(results, [tenantA, tenantB]);
});

test("tenant context fails closed without authenticated tenant scope", () => {
  const context = new TenantContext();
  assert.throws(() => context.current());
});

test("tenant context rejects malformed tenant identifiers", () => {
  const context = new TenantContext();
  assert.throws(() => context.run({ tenantId: "tenant-A", userId: "user-a" }, () => null));
});
