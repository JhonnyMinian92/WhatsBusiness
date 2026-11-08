import type { ThreadsCapabilityKey } from "../domain/threads-contracts.js";

export type ThreadsApiMethod = "GET" | "POST";
export type ThreadsRequestOutcome = "rejected" | "unknown" | "not_applicable";

export interface ThreadsApiRequest {
  readonly method: ThreadsApiMethod;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly accessToken: string;
  readonly apiVersion: string;
}

export interface ThreadsApiTransport {
  request(input: ThreadsApiRequest): Promise<unknown>;
}

export interface ThreadsAccessToken {
  readonly value: string;
  readonly expiresAt?: string | null;
}

export interface ThreadsAccessTokenProvider {
  resolve(input: {
    readonly tenantId: string;
    readonly profileId: string;
  }): Promise<ThreadsAccessToken | null>;
}

export interface ThreadsCapabilityDecision {
  readonly state: "available" | "unavailable" | "unknown";
  readonly apiVersion: string;
  readonly reasonCodes: readonly string[];
}

export interface ThreadsCapabilityAuthorizer {
  authorize(input: {
    readonly tenantId: string;
    readonly profileId: string;
    readonly capability: ThreadsCapabilityKey;
  }): Promise<ThreadsCapabilityDecision>;
}

export class ThreadsApiError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly outcome: ThreadsRequestOutcome,
    readonly httpStatus?: number,
  ) {
    super(code);
    this.name = "ThreadsApiError";
  }
}

export class ThreadsCapabilityDeniedError extends Error {
  readonly code: string;

  constructor(
    readonly capability: ThreadsCapabilityKey,
    readonly state: "unavailable" | "unknown",
    readonly reasonCodes: readonly string[],
  ) {
    const code = "THREADS_CAPABILITY_" + state.toUpperCase();
    super(code);
    this.code = code;
    this.name = "ThreadsCapabilityDeniedError";
  }
}

export class ThreadsPublicationError extends Error {
  readonly code: string;
  readonly reasonCode: string;

  constructor(
    readonly stage: "container" | "publish",
    readonly containerId: string | null,
    readonly outcome: "rejected" | "unknown",
    reasonCode: string,
  ) {
    const code = "THREADS_PUBLICATION_" + stage.toUpperCase() + "_" + outcome.toUpperCase();
    super(code);
    this.code = code;
    this.reasonCode = reasonCode;
    this.name = "ThreadsPublicationError";
  }
}
