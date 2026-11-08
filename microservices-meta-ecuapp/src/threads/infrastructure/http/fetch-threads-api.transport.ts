import { ThreadsApiVersionPolicy } from "../../domain/threads-api-version-policy.js";
import {
  ThreadsApiError,
  type ThreadsApiRequest,
  type ThreadsApiTransport,
} from "../../application/threads-api.ports.js";

export type ThreadsFetch = (input: URL, init: RequestInit) => Promise<Response>;

/**
 * Production HTTP boundary for the Threads Graph host. Tokens are sent in the
 * Authorization header and are never placed in URLs or provider error text.
 */
export class FetchThreadsApiTransport implements ThreadsApiTransport {
  constructor(
    private readonly versionPolicy: ThreadsApiVersionPolicy,
    private readonly fetcher: ThreadsFetch = (input, init) => fetch(input, init),
    private readonly timeoutMs = 15_000,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
      throw new Error("THREADS_HTTP_TIMEOUT_INVALID");
    }
  }

  async request(input: ThreadsApiRequest): Promise<unknown> {
    if (input.apiVersion !== this.versionPolicy.apiVersion) {
      throw new ThreadsApiError("THREADS_API_VERSION_MISMATCH", false, "rejected");
    }
    if (typeof input.accessToken !== "string" || input.accessToken.length < 1 || input.accessToken.length > 8_192) {
      throw new ThreadsApiError("THREADS_CREDENTIAL_INVALID", false, "rejected");
    }

    const url = this.versionPolicy.buildUrl(input.path, input.query);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: input.method,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + input.accessToken,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ThreadsApiError(
        input.method === "POST" ? "THREADS_REQUEST_OUTCOME_UNKNOWN" : "THREADS_REQUEST_FAILED",
        input.method === "GET",
        input.method === "POST" ? "unknown" : "not_applicable",
      );
    }

    let body: unknown;
    try {
      body = await response.json() as unknown;
    } catch {
      throw new ThreadsApiError(
        "THREADS_RESPONSE_INVALID",
        false,
        input.method === "POST" ? "unknown" : "not_applicable",
        response.status,
      );
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new ThreadsApiError(
        "THREADS_PROVIDER_REJECTED",
        retryable,
        input.method === "POST" && response.status >= 500 ? "unknown"
          : input.method === "POST" ? "rejected" : "not_applicable",
        response.status,
      );
    }
    return body;
  }
}
