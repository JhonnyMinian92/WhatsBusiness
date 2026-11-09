export type ApplicationErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "EXTERNAL_PROVIDER_ERROR"
  | "DEPENDENCY_UNAVAILABLE"
  | "INTERNAL_ERROR";

const HTTP_STATUS: Record<ApplicationErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EXTERNAL_PROVIDER_ERROR: 502,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500
};

export class ApplicationError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ApplicationError";
    this.statusCode = HTTP_STATUS[code];
  }
}

export function toPublicError(error: unknown): {
  code: ApplicationErrorCode;
  message: string;
  statusCode: number;
} {
  if (error instanceof ApplicationError) {
    return { code: error.code, message: error.message, statusCode: error.statusCode };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Unexpected internal error.",
    statusCode: 500
  };
}
