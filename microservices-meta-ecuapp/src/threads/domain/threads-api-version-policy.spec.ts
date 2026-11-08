import assert from "node:assert/strict";
import test from "node:test";
import {
  ThreadsApiVersionPolicy,
  ThreadsApiVersionPolicyError,
} from "./threads-api-version-policy.js";

const now = new Date("2026-11-08T18:00:00.000Z");
const registration = {
  apiVersion: "v1.0",
  apiBaseUrl: "https://graph.threads.net",
  supportedVersions: ["v1.0"],
  checkedAt: "2026-11-08T17:00:00.000Z",
  sourceUrl: "https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api",
};

test("pins Threads version independently and keeps the official collection host unversioned", () => {
  const policy = new ThreadsApiVersionPolicy(registration, now);
  const url = policy.buildUrl("/me/threads", { fields: "id,username", limit: "25" });
  assert.equal(policy.apiVersion, "v1.0");
  assert.equal(url.origin, "https://graph.threads.net");
  assert.equal(url.pathname, "/me/threads");
  assert.equal(url.searchParams.get("limit"), "25");
});

test("accepts an explicitly versioned base path only when it matches the pinned Threads version", () => {
  const policy = new ThreadsApiVersionPolicy({
    ...registration,
    apiBaseUrl: "https://graph.threads.net/v1.0",
  }, now);
  assert.equal(policy.buildUrl("/me").pathname, "/v1.0/me");
});

test("rejects versions absent from the verified allowlist and retired versions", () => {
  assert.throws(
    () => new ThreadsApiVersionPolicy({ ...registration, apiVersion: "v2.0" }, now),
    { code: "THREADS_API_VERSION_NOT_SUPPORTED" },
  );
  assert.throws(
    () => new ThreadsApiVersionPolicy({ ...registration, retiredVersions: ["v1.0"] }, now),
    { code: "THREADS_API_VERSION_RETIRED" },
  );
});

test("rejects unrelated hosts, unsafe URLs and untrusted version sources", () => {
  assert.throws(
    () => new ThreadsApiVersionPolicy({ ...registration, apiBaseUrl: "https://graph.facebook.com" }, now),
    { code: "THREADS_API_HOST_NOT_ALLOWED" },
  );
  assert.throws(
    () => new ThreadsApiVersionPolicy({ ...registration, sourceUrl: "https://example.com/version" }, now),
    { code: "THREADS_API_VERSION_SOURCE_NOT_TRUSTED" },
  );
  assert.throws(
    () => new ThreadsApiVersionPolicy({ ...registration, apiBaseUrl: "https://user:pass@graph.threads.net" }, now),
    { code: "THREADS_API_HOST_NOT_ALLOWED" },
  );
});

test("rejects stale or future version evidence and invalid path traversal", () => {
  assert.throws(
    () => new ThreadsApiVersionPolicy({ ...registration, checkedAt: "2026-11-08T19:00:00.000Z" }, now),
    { code: "THREADS_API_VERSION_EVIDENCE_INVALID" },
  );
  assert.throws(
    () => new ThreadsApiVersionPolicy({ ...registration, validUntil: "2026-11-08T17:59:59.000Z" }, now),
    { code: "THREADS_API_VERSION_EVIDENCE_EXPIRED" },
  );
  const policy = new ThreadsApiVersionPolicy(registration, now);
  assert.throws(() => policy.buildUrl("/../../admin"), ThreadsApiVersionPolicyError);
});
