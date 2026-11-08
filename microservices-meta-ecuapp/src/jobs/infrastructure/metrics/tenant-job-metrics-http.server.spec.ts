import assert from "node:assert/strict";
import test from "node:test";
import { TenantJobMetricsHttpServer } from "./tenant-job-metrics-http.server.js";

const metrics = {
  renderPrometheus: () => "# HELP tenant_job_execution_total Example counter.\n# TYPE tenant_job_execution_total counter\ntenant_job_execution_total{outcome=\"processed\"} 3\n",
};

test("serves Prometheus exposition only through GET /metrics", async () => {
  const server = new TenantJobMetricsHttpServer(metrics, { host: "127.0.0.1", port: 0 });
  try {
    const address = await server.listen();
    const baseUrl = "http://127.0.0.1:" + address.port;
    const response = await fetch(baseUrl + "/metrics");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/plain; version=0\.0\.4/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(await response.text(), /tenant_job_execution_total\{outcome="processed"\} 3/);

    const unknown = await fetch(baseUrl + "/health");
    assert.equal(unknown.status, 404);
    assert.equal(await unknown.text(), "Not found\n");

    const queryString = await fetch(baseUrl + "/metrics?tenant=private");
    assert.equal(queryString.status, 404);
  } finally {
    await server.close();
    await server.close();
  }
});

test("requires a bearer token when configured and never leaks renderer errors", async () => {
  const token = "0123456789abcdef0123456789abcdef";
  const protectedServer = new TenantJobMetricsHttpServer(metrics, {
    host: "127.0.0.1",
    port: 0,
    bearerToken: token,
  });
  try {
    const address = await protectedServer.listen();
    const url = "http://127.0.0.1:" + address.port + "/metrics";

    const missing = await fetch(url);
    assert.equal(missing.status, 401);
    assert.equal(missing.headers.get("www-authenticate"), "Bearer");

    const invalid = await fetch(url, { headers: { authorization: "Bearer incorrect" } });
    assert.equal(invalid.status, 401);

    const authorized = await fetch(url, { headers: { authorization: "Bearer " + token } });
    assert.equal(authorized.status, 200);
  } finally {
    await protectedServer.close();
  }

  const failingServer = new TenantJobMetricsHttpServer({
    renderPrometheus: () => { throw new Error("sensitive-internal-detail"); },
  }, { host: "127.0.0.1", port: 0 });
  try {
    const address = await failingServer.listen();
    const response = await fetch("http://127.0.0.1:" + address.port + "/metrics");
    assert.equal(response.status, 500);
    assert.equal(await response.text(), "Metrics unavailable\n");
  } finally {
    await failingServer.close();
  }
});

test("requires a strong token for non-loopback binding and validates listener settings", () => {
  assert.throws(
    () => new TenantJobMetricsHttpServer(metrics, { host: "0.0.0.0", port: 9464 }),
    /bearer token is required/,
  );
  assert.throws(
    () => new TenantJobMetricsHttpServer(metrics, {
      host: "0.0.0.0",
      port: 9464,
      bearerToken: "too-short",
    }),
    /at least 32 bytes/,
  );
  assert.throws(
    () => new TenantJobMetricsHttpServer(metrics, { host: "127.0.0.1", port: 65_536 }),
    /listener configuration is invalid/,
  );
});

test("allows only GET and prevents concurrent listener startup", async () => {
  const server = new TenantJobMetricsHttpServer(metrics, { host: "127.0.0.1", port: 0 });
  try {
    const address = await server.listen();
    await assert.rejects(server.listen(), /already started/);

    const response = await fetch("http://127.0.0.1:" + address.port + "/metrics", {
      method: "POST",
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET");
    assert.equal(await response.text(), "Method not allowed\n");
  } finally {
    await server.close();
  }
});
