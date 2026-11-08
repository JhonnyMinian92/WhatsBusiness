import assert from "node:assert/strict";
import { get, request as httpRequest } from "node:http";
import test from "node:test";
import { PrometheusTenantJobRuntimeMetrics } from "./prometheus-tenant-job-runtime-metrics.js";
import { TenantJobMetricsHttpServer } from "./tenant-job-metrics-http-server.js";

interface HttpResult {
  readonly statusCode: number;
  readonly body: string;
  readonly contentType: string | undefined;
}

function getRequest(
  port: number,
  path: string,
  authorization?: string,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const request = get({
      host: "127.0.0.1",
      port,
      path,
      ...(authorization ? { headers: { authorization } } : {}),
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({
        statusCode: response.statusCode ?? 0,
        body,
        contentType: response.headers["content-type"],
      }));
    });
    request.on("error", reject);
  });
}

function postRequest(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: "127.0.0.1",
      port,
      path: "/metrics",
      method: "POST",
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    request.on("error", reject);
    request.end();
  });
}

test("metrics HTTP server exposes Prometheus and health routes on loopback", async () => {
  const metrics = new PrometheusTenantJobRuntimeMetrics();
  metrics.recordDispatch("published");
  const server = new TenantJobMetricsHttpServer(metrics, {
    host: "127.0.0.1",
    port: 0,
  });
  try {
    await server.start();
    const address = server.address();
    assert.ok(address);
    const prometheus = await getRequest(address.port, "/metrics");
    assert.equal(prometheus.statusCode, 200);
    assert.match(prometheus.contentType ?? "", /text\/plain; version=0\.0\.4/);
    assert.ok(prometheus.body.includes('tenant_job_dispatch_total{outcome="published"} 1'));
    const health = await getRequest(address.port, "/healthz");
    assert.deepEqual({ statusCode: health.statusCode, body: health.body }, { statusCode: 200, body: "ok\n" });
    const notFound = await getRequest(address.port, "/internal");
    assert.equal(notFound.statusCode, 404);
    assert.equal(await postRequest(address.port), 405);
  } finally {
    await server.close();
  }
});

test("metrics HTTP server requires constant-time bearer authentication when configured", async () => {
  const token = "metrics-test-token-with-at-least-32-bytes";
  const server = new TenantJobMetricsHttpServer(new PrometheusTenantJobRuntimeMetrics(), {
    host: "127.0.0.1",
    port: 0,
    bearerToken: token,
  });
  try {
    await server.start();
    const address = server.address();
    assert.ok(address);
    assert.equal((await getRequest(address.port, "/metrics")).statusCode, 401);
    assert.equal((await getRequest(address.port, "/metrics", "Bearer wrong-token")).statusCode, 401);
    assert.equal((await getRequest(address.port, "/metrics", "Bearer " + token)).statusCode, 200);
  } finally {
    await server.close();
  }
});

test("metrics HTTP server refuses non-loopback bindings without a strong bearer token", () => {
  assert.throws(
    () => new TenantJobMetricsHttpServer(new PrometheusTenantJobRuntimeMetrics(), {
      host: "0.0.0.0",
      port: 9464,
    }),
    /bearer token is required/,
  );
  assert.throws(
    () => new TenantJobMetricsHttpServer(new PrometheusTenantJobRuntimeMetrics(), {
      host: "0.0.0.0",
      port: 9464,
      bearerToken: "too-short",
    }),
    /at least 32 bytes/,
  );
});

test("metrics HTTP server supports idempotent concurrent close", async () => {
  const server = new TenantJobMetricsHttpServer(new PrometheusTenantJobRuntimeMetrics(), {
    host: "127.0.0.1",
    port: 0,
  });
  await server.start();
  await Promise.all([server.close(), server.close(), server.close()]);
  assert.equal(server.address(), null);
});
