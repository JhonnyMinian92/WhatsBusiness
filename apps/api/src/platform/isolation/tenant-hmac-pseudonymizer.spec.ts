import assert from "node:assert/strict";
import test from "node:test";
import { HmacTenantPseudonymizer } from "./tenant-hmac-pseudonymizer.js";

test("tenant pseudonyms are stable for one secret and unlinkable across secrets", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const first = new HmacTenantPseudonymizer(new Uint8Array(32).fill(1));
  const second = new HmacTenantPseudonymizer(new Uint8Array(32).fill(2));
  assert.equal(first.pseudonymize(tenantId), first.pseudonymize(tenantId));
  assert.notEqual(first.pseudonymize(tenantId), second.pseudonymize(tenantId));
  assert.match(first.pseudonymize(tenantId), /^hmacv1_[0-9a-f]{64}$/);
});

test("HMAC pseudonymizer rejects weak keys", () => {
  assert.throws(() => new HmacTenantPseudonymizer(new Uint8Array(16)));
});
