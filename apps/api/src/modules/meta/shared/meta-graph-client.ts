import { createHmac } from "node:crypto";
import { ApplicationError } from "../../../platform/errors/application-error.js";

export interface MetaGraphClientOptions {
  readonly baseUrl: string;
  readonly apiVersion: string;
  readonly appSecret: string;
  readonly timeoutMs?: number;
}
export interface MetaGraphPage<T> {
  readonly data: readonly T[];
  readonly paging?: { readonly next?: string; readonly cursors?: { readonly before?: string; readonly after?: string } };
}

export class MetaGraphClient {
  private readonly rootUrl: URL;
  private readonly timeoutMs: number;

  constructor(private readonly options: MetaGraphClientOptions) {
    this.rootUrl = new URL(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? 12_000;
    if (this.rootUrl.protocol !== "https:") throw new Error("Meta Graph API must use HTTPS.");
    if (!/^v\d+\.\d+$/.test(options.apiVersion)) throw new Error("A supported, explicit Meta Graph API version is required.");
  }

  async get<T>(path: string, accessToken: string, query: Readonly<Record<string, string | number | boolean>> = {}): Promise<T> {
    const url = this.buildUrl(path);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    url.searchParams.set("appsecret_proof", this.appSecretProof(accessToken));
    return this.request<T>(url, {
      method: "GET",
      headers: { accept: "application/json", authorization: "Bearer " + accessToken }
    });
  }

  async post<T>(
    path: string,
    accessToken: string,
    body: Readonly<Record<string, string | number | boolean>>
  ): Promise<T> {
    const url = this.buildUrl(path);
    url.searchParams.set("appsecret_proof", this.appSecretProof(accessToken));
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) form.set(key, String(value));
    return this.request<T>(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: "Bearer " + accessToken,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form
    });
  }

  async getAllPages<T>(
    path: string,
    accessToken: string,
    query: Readonly<Record<string, string | number | boolean>> = {},
    maximumItems = 2_000
  ): Promise<readonly T[]> {
    const firstUrl = this.buildUrl(path);
    for (const [key, value] of Object.entries(query)) firstUrl.searchParams.set(key, String(value));
    firstUrl.searchParams.set("appsecret_proof", this.appSecretProof(accessToken));
    const results: T[] = [];
    let nextUrl: URL | undefined = firstUrl;
    while (nextUrl && results.length < maximumItems) {
      const page = await this.request<MetaGraphPage<T>>(nextUrl, {
        method: "GET",
        headers: { accept: "application/json", authorization: "Bearer " + accessToken }
      });
      if (!Array.isArray(page.data)) throw new ApplicationError("EXTERNAL_PROVIDER_ERROR", "Meta returned a malformed paginated response.");
      results.push(...page.data.slice(0, maximumItems - results.length));
      nextUrl = page.paging?.next ? this.validateNextPage(page.paging.next) : undefined;
    }
    return results;
  }

  private buildUrl(path: string): URL {
    const normalized = path.replace(/^\/+/, "");
    if (!normalized || normalized.includes("..") || normalized.includes("?")) {
      throw new ApplicationError("VALIDATION_ERROR", "Invalid Meta Graph API path.");
    }
    return new URL(this.options.apiVersion + "/" + normalized, this.rootUrl.toString().replace(/\/?$/, "/"));
  }

  private validateNextPage(value: string): URL {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== this.rootUrl.hostname) {
      throw new ApplicationError("EXTERNAL_PROVIDER_ERROR", "Meta returned an untrusted pagination URL.");
    }
    return url;
  }

  private appSecretProof(accessToken: string): string {
    return createHmac("sha256", this.options.appSecret).update(accessToken).digest("hex");
  }

  private async request<T>(url: URL, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const providerMessage = this.getProviderErrorMessage(payload);
        throw new ApplicationError(
          response.status === 429 ? "DEPENDENCY_UNAVAILABLE" : "EXTERNAL_PROVIDER_ERROR",
          "Meta Graph API request failed: " + providerMessage
        );
      }
      if (payload === null || typeof payload !== "object") {
        throw new ApplicationError("EXTERNAL_PROVIDER_ERROR", "Meta returned a non-object response.");
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError("DEPENDENCY_UNAVAILABLE", "Meta Graph API is temporarily unavailable.", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  private getProviderErrorMessage(payload: unknown): string {
    if (payload && typeof payload === "object" && "error" in payload) {
      const error = (payload as { error?: { message?: unknown; code?: unknown } }).error;
      if (error && typeof error.message === "string") {
        return error.message.slice(0, 500) + (typeof error.code === "number" ? " (code " + error.code + ")" : "");
      }
    }
    return "HTTP request rejected.";
  }
}
