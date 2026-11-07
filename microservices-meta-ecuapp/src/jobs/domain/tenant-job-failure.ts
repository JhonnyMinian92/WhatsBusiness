import type { TenantJobFailure } from "./tenant-job-retry-policy.js";

const TRANSIENT_DATABASE_CODES = new Set([
  "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
  "40001", "40P01", "53300", "53400", "57P01", "57P02", "57P03",
]);
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH",
]);

export class TenantJobFailureError extends Error {
  readonly failure: TenantJobFailure;

  constructor(failure: TenantJobFailure, cause?: unknown) {
    super(failure.code, { cause });
    this.name = "TenantJobFailureError";
    this.failure = Object.freeze({ ...failure });
  }
}

/** Unclassified exceptions are permanent by default; retries require explicit evidence. */
export function classifyTenantJobFailure(error: unknown): TenantJobFailure {
  if (error instanceof TenantJobFailureError) return error.failure;

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_DATABASE_CODES.has(code)) {
      return { code: mapDatabaseFailure(code), retryable: true };
    }
    if (typeof code === "string" && TRANSIENT_NETWORK_CODES.has(code)) {
      return { code: "TRANSIENT_NETWORK_FAILURE", retryable: true };
    }
  }

  return { code: "UNCLASSIFIED_JOB_FAILURE", retryable: false };
}

function mapDatabaseFailure(code: string): string {
  if (code === "40001" || code === "40P01") return "DATABASE_TRANSACTION_RETRY";
  if (code.startsWith("08")) return "DATABASE_CONNECTION_FAILURE";
  if (code === "53300") return "DATABASE_CAPACITY_EXHAUSTED";
  return "DATABASE_TEMPORARILY_UNAVAILABLE";
}
