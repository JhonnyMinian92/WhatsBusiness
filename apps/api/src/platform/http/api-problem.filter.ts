import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

interface CorrelatedRequest extends Request {
  correlationId?: string;
}

interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly correlationId: string;
}
const titles: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "Bad Request",
  [HttpStatus.UNAUTHORIZED]: "Unauthorized",
  [HttpStatus.FORBIDDEN]: "Forbidden",
  [HttpStatus.NOT_FOUND]: "Not Found",
  [HttpStatus.CONFLICT]: "Conflict",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "Unprocessable Entity",
  [HttpStatus.TOO_MANY_REQUESTS]: "Too Many Requests",
  [HttpStatus.SERVICE_UNAVAILABLE]: "Service Unavailable",
};
const codes: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "INVALID_REQUEST",
  [HttpStatus.UNAUTHORIZED]: "AUTHENTICATION_REQUIRED",
  [HttpStatus.FORBIDDEN]: "ACCESS_DENIED",
  [HttpStatus.NOT_FOUND]: "RESOURCE_NOT_FOUND",
  [HttpStatus.CONFLICT]: "RESOURCE_CONFLICT",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "VALIDATION_FAILED",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
  [HttpStatus.SERVICE_UNAVAILABLE]: "DEPENDENCY_UNAVAILABLE",
};

@Catch()
export class ApiProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<CorrelatedRequest>();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const message = typeof raw === "string"
      ? raw
      : typeof body["message"] === "string"
        ? body["message"]
        : Array.isArray(body["message"])
          ? body["message"].filter((value): value is string => typeof value === "string").join("; ")
          : undefined;
    const suppliedId = request.header("x-correlation-id");
    const correlationId = request.correlationId
      ?? (suppliedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId)
        ? suppliedId
        : randomUUID());

    const problem: ProblemBody = {
      type: "about:blank",
      title: titles[status] ?? (status >= 500 ? "Internal Server Error" : "Request Failed"),
      status,
      code: typeof body["code"] === "string" ? body["code"] : codes[status] ?? "INTERNAL_ERROR",
      detail: typeof body["detail"] === "string"
        ? body["detail"]
        : status >= 500 ? "La solicitud no pudo completarse." : message ?? "La solicitud no es válida.",
      correlationId,
    };
    response.setHeader("X-Correlation-ID", correlationId);
    response.status(status).type("application/problem+json").json(problem);
  }
}
