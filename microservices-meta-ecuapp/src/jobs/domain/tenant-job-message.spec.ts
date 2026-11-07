import assert from "node:assert/strict";
import test from "node:test";
import { createTenantJobMessage, parseTenantJobMessage } from "./tenant-job-message.js";

const jobId = "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15";

test("creates and parses the minimal broker locator envelope", () => {
  const expected = { version: 1, jobId };
  assert.deepEqual(createTenantJobMessage(jobId), expected);
  assert.deepEqual(parseTenantJobMessage(Buffer.from(JSON.stringify(expected))), expected);
});

test("rejects tenant or payload metadata in the broker envelope", () => {
  const unsafe = { version: 1, jobId, tenantId: "another-tenant", payload: { secret: "no" } };
  assert.throws(() => parseTenantJobMessage(Buffer.from(JSON.stringify(unsafe))));
});

test("rejects malformed UUIDs, invalid JSON, oversized and invalid UTF-8 bodies", () => {
  assert.throws(() => createTenantJobMessage("not-a-uuid"));
  assert.throws(() => parseTenantJobMessage(Buffer.from("{broken")));
  assert.throws(() => parseTenantJobMessage(Buffer.alloc(1_025, 0x20)));
  assert.throws(() => parseTenantJobMessage(Buffer.from([0xc3, 0x28])));
});
