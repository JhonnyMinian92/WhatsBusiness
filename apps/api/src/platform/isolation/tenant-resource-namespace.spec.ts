import assert from "node:assert/strict";
import test from "node:test";
import { TenantResourceNamespace } from "./tenant-resource-namespace.js";

const namespace = new TenantResourceNamespace();
const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

test("cache and object namespaces are isolated by tenant", () => {
  assert.notEqual(
    namespace.cacheKey(tenantA, "conversation", "42"),
    namespace.cacheKey(tenantB, "conversation", "42"),
  );
  assert.equal(
    namespace.objectKey(tenantA, "media", "2026/11/file.png"),
    `tenants/${tenantA}/media/2026/11/file.png`,
  );
});

test("logical cache keys are encoded and cannot escape the namespace", () => {
  assert.match(namespace.cacheKey(tenantA, "profile", "a:b/c"), /a%3Ab%2Fc$/);
  assert.throws(() => namespace.cacheKey("not-a-uuid", "profile", "1"));
  assert.throws(() => namespace.cacheKey(tenantA, "../profile", "1"));
  assert.throws(() => namespace.objectKey(tenantA, "media", "../secret"));
  assert.throws(() => namespace.objectKey(tenantA, "media", "/absolute/path"));
});
