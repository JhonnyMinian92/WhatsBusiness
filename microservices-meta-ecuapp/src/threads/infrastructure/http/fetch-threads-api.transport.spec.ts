import assert from "node:assert/strict";
import test from "node:test";
import { ThreadsApiVersionPolicy } from "../../domain/threads-api-version-policy.js";
import { ThreadsApiError, type ThreadsApiRequest } from "../../application/threads-api.ports.js";
import { FetchThreadsApiTransport, type ThreadsFetch } from "./fetch-threads-api.transport.js";

const policy = new ThreadsApiVersionPolicy({
  apiVersion: "v1.0",
  apiBaseUrl: "https://graph.threads.net",
  supportedVersions: ["v1.0"],
  checkedAt: "2026-11-08T17:00:00.000Z",
  sourceUrl: "https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api",
}, new Date("2026-11-08T18:00:00.000Z"));

const request: ThreadsApiRequest = {
  method: "GET",
  path: "/me",
  query: { fields: "id,username" },
  accessToken: "synthetic-secret",
  apiVersion: "v1.0",
};

test("sends Bearer credentials in the header and never in the URL", async () => {
  let capturedUrl: URL | undefined;
  let capturedInit: RequestInit | undefined;
  const fetcher: ThreadsFetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ id: "1" }), { status: 200 });
  };
  const transport = new FetchThreadsApiTransport(policy, fetcher);
  await transport.request(request);
  assert.equal(capturedUrl?.origin, "https://graph.threads.net");
  assert.equal(capturedUrl?.searchParams.has("access_token"), false);
  assert.equal((capturedInit?.headers as Record<string, string>)["Authorization"], "Bearer synthetic-secret");
});

test("converts provider rejection into a sanitized typed error", async () => {
  const fetcher: ThreadsFetch = async () => new Response(JSON.stringify({
    error: { message: "secret detail must not escape", code: 10 },
  }), { status: 403 });
  const transport = new FetchThreadsApiTransport(policy, fetcher);
  await assert.rejects(transport.request(request), (error: unknown) => {
    assert.ok(error instanceof ThreadsApiError);
    assert.equal(error.code, "THREADS_PROVIDER_REJECTED");
    assert.equal(error.httpStatus, 403);
    assert.equal(error.outcome, "not_applicable");
    assert.equal(error.message.includes("secret detail"), false);
    return true;
  });
});

test("marks an ambiguous POST 5xx as unknown and does not implement hidden retries", async () => {
  let calls = 0;
  const fetcher: ThreadsFetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { code: 1 } }), { status: 500 });
  };
  const transport = new FetchThreadsApiTransport(policy, fetcher);
  await assert.rejects(transport.request({ ...request, method: "POST" }), (error: unknown) => {
    assert.ok(error instanceof ThreadsApiError);
    assert.equal(error.outcome, "unknown");
    assert.equal(error.retryable, true);
    return true;
  });
  assert.equal(calls, 1);
});
