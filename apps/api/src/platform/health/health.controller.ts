import { Controller, Get, Res } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { ReadinessService } from "./readiness.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get("live")
  live(): { status: "ok"; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  ready(@Res() response: Response): Response {
    const snapshot = this.readiness.snapshot();
    if (!snapshot.ready) {
      return response.status(503).type("application/problem+json").json({
        type: "about:blank",
        title: "Service Unavailable",
        status: 503,
        code: "READINESS_DEPENDENCIES_NOT_CONFIGURED",
        detail: "El proceso está activo, pero las dependencias obligatorias aún no están configuradas y verificadas.",
        correlationId: randomUUID(),
      });
    }

    return response.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      checks: snapshot.checks,
    });
  }
}
