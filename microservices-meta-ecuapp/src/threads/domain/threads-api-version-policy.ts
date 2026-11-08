export interface ThreadsApiVersionRegistration {
  readonly apiVersion: string;
  readonly apiBaseUrl: string;
  readonly supportedVersions: readonly string[];
  readonly retiredVersions?: readonly string[];
  readonly checkedAt: string;
  readonly sourceUrl: string;
  readonly validUntil?: string | null;
}

const API_VERSION_PATTERN = /^v[1-9][0-9]*\.[0-9]+$/;
const THREADS_API_HOST = "graph.threads.net";
const TRUSTED_SOURCE_HOSTS = ["developers.facebook.com", "www.postman.com", "postman.com"] as const;

export class ThreadsApiVersionPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ThreadsApiVersionPolicyError";
  }
}

/**
 * Keeps the Threads API lifecycle independent from Graph API versions used by
 * other Meta products. The configured base URL is authoritative: the policy
 * does not silently insert or remove a version path segment.
 */
export class ThreadsApiVersionPolicy {
  readonly apiVersion: string;
  readonly apiBaseUrl: string;
  readonly checkedAt: string;

  constructor(
    registration: ThreadsApiVersionRegistration,
    now: Date = new Date(),
  ) {
    if (!API_VERSION_PATTERN.test(registration.apiVersion)) {
      throw new ThreadsApiVersionPolicyError("THREADS_API_VERSION_INVALID");
    }
    if (
      registration.supportedVersions.length === 0
      || new Set(registration.supportedVersions).size !== registration.supportedVersions.length
      || registration.supportedVersions.some((version) => !API_VERSION_PATTERN.test(version))
      || !registration.supportedVersions.includes(registration.apiVersion)
    ) {
      throw new ThreadsApiVersionPolicyError("THREADS_API_VERSION_NOT_SUPPORTED");
    }
    if (registration.retiredVersions?.includes(registration.apiVersion)) {
      throw new ThreadsApiVersionPolicyError("THREADS_API_VERSION_RETIRED");
    }
    if (
      typeof registration.checkedAt !== "string"
      || !Number.isFinite(Date.parse(registration.checkedAt))
      || Date.parse(registration.checkedAt) > now.getTime()
    ) {
      throw new ThreadsApiVersionPolicyError("THREADS_API_VERSION_EVIDENCE_INVALID");
    }
    if (
      registration.validUntil !== undefined
      && registration.validUntil !== null
      && (!Number.isFinite(Date.parse(registration.validUntil))
        || Date.parse(registration.validUntil) <= now.getTime())
    ) {
      throw new ThreadsApiVersionPolicyError("THREADS_API_VERSION_EVIDENCE_EXPIRED");
    }

    let apiUrl: URL;
    let sourceUrl: URL;
    try {
      apiUrl = new URL(registration.apiBaseUrl);
      sourceUrl = new URL(registration.sourceUrl);
    } catch {
      throw new ThreadsApiVersionPolicyError("THREADS_API_URL_INVALID");
    }
    if (
      apiUrl.protocol !== "https:"
      || apiUrl.hostname !== THREADS_API_HOST
      || apiUrl.username.length > 0
      || apiUrl.password.length > 0
      || apiUrl.search.length > 0
      || apiUrl.hash.length > 0
      || (apiUrl.pathname !== "" && apiUrl.pathname !== "/" && apiUrl.pathname !== "/" + registration.apiVersion)
    ) {
      throw new ThreadsApiVersionPolicyError("THREADS_API_HOST_NOT_ALLOWED");
    }
    if (
      sourceUrl.protocol !== "https:"
      || !TRUSTED_SOURCE_HOSTS.includes(sourceUrl.hostname as typeof TRUSTED_SOURCE_HOSTS[number])
    ) {
      throw new ThreadsApiVersionPolicyError("THREADS_API_VERSION_SOURCE_NOT_TRUSTED");
    }

    this.apiVersion = registration.apiVersion;
    this.apiBaseUrl = apiUrl.toString().replace(/\/$/, "");
    this.checkedAt = new Date(registration.checkedAt).toISOString();
    Object.freeze(this);
  }

  buildUrl(
    path: string,
    query: Readonly<Record<string, string>> = {},
  ): URL {
    if (
      typeof path !== "string"
      || !path.startsWith("/")
      || path.startsWith("//")
      || path.includes("..")
      || !/^\/[a-zA-Z0-9_./-]*$/.test(path)
    ) {
      throw new ThreadsApiVersionPolicyError("THREADS_API_PATH_INVALID");
    }
    const url = new URL(this.apiBaseUrl + path);
    for (const [key, value] of Object.entries(query)) {
      if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key) || typeof value !== "string" || value.length > 4_096) {
        throw new ThreadsApiVersionPolicyError("THREADS_API_QUERY_INVALID");
      }
      url.searchParams.set(key, value);
    }
    return url;
  }
}

export const THREADS_API_VERSION_SOURCE =
  "https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api";
