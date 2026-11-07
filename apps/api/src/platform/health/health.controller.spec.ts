import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { HealthController } from "./health.controller.js";
import { ReadinessService } from "./readiness.service.js";

class ResponseDouble {
  statusCode = 200;
  contentType = "";
  body: unknown;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  type(value: string): this {
    this.contentType = value;
    return this;
  }

  json(value: unknown): this {
    this.body = value;
    return this;
  }
}

test("health live responds without depending on downstream services", () => {
  const controller = new HealthController(new ReadinessService());
  const result = controller.live();

  assert.equal(result.status, "ok");
  assert.ok(Number.isFinite(Date.parse(result.timestamp)));
});

test("health ready returns RFC 9457-style problem while dependencies are unconfigured", () => {
  const controller = new HealthController(new ReadinessService());
  const response = new ResponseDouble();
  controller.ready(response as unknown as Response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.contentType, "application/problem+json");
  assert.equal((response.body as { status: number }).status, 503);
  assert.equal((response.body as { code: string }).code, "READINESS_DEPENDENCIES_NOT_CONFIGURED");
  assert.match((response.body as { correlationId: string }).correlationId, /^[0-9a-f-]{36}$/i);
});
