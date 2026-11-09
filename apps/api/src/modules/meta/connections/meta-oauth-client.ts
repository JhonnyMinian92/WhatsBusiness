import { ApplicationError } from "../../../platform/errors/application-error.js";
import type { MetaAccessToken, MetaTokenInspection } from "../shared/meta-types.js";

interface TokenExchangeResponse { access_token?: string; token_type?: string; expires_in?: number; }
interface DebugTokenResponse {
  data?: {
    app_id?: string; is_valid?: boolean; user_id?: string; type?: string;
    expires_at?: number; data_access_expires_at?: number; scopes?: string[];
    granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
  };
}
export interface MetaOAuthConfiguration {
  readonly appId: string; readonly appSecret: string; readonly graphBaseUrl: string;
  readonly apiVersion: string; readonly redirectUri: string;
}

export class MetaOAuthClient {
  constructor(private readonly config: MetaOAuthConfiguration) {}

  createAuthorizationUrl(state: string, configId: string): string {
    const url = new URL("https://www.facebook.com/" + this.config.apiVersion + "/dialog/oauth");
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("config_id", configId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("override_default_response_type", "true");
    return url.toString();
  }

  async exchangeCode(code: string): Promise<MetaAccessToken> {
    const url = new URL(this.config.apiVersion + "/oauth/access_token", this.config.graphBaseUrl.replace(/\/?$/, "/"));
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("client_secret", this.config.appSecret);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("code", code);
    return this.toAccessToken(await this.request<TokenExchangeResponse>(url));
  }

  async exchangeLongLivedUserToken(shortLivedToken: string): Promise<MetaAccessToken> {
    if (!shortLivedToken || shortLivedToken.length > 16_384) {
      throw new ApplicationError("VALIDATION_ERROR", "A valid user access token is required for token extension.");
    }
    const url = new URL(this.config.apiVersion + "/oauth/access_token", this.config.graphBaseUrl.replace(/\/?$/, "/"));
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("client_secret", this.config.appSecret);
    url.searchParams.set("fb_exchange_token", shortLivedToken);
    return this.toAccessToken(await this.request<TokenExchangeResponse>(url));
  }

  async inspectToken(accessToken: string): Promise<MetaTokenInspection> {
    const url = new URL(this.config.apiVersion + "/debug_token", this.config.graphBaseUrl.replace(/\/?$/, "/"));
    url.searchParams.set("input_token", accessToken);
    url.searchParams.set("access_token", this.config.appId + "|" + this.config.appSecret);
    const payload = await this.request<DebugTokenResponse>(url);
    const data = payload.data;
    if (!data || typeof data.app_id !== "string" || typeof data.is_valid !== "boolean") {
      throw new ApplicationError("EXTERNAL_PROVIDER_ERROR", "Meta returned an invalid token inspection response.");
    }
    return {
      appId: data.app_id, isValid: data.is_valid,
      ...(data.user_id ? { userId: data.user_id } : {}),
      ...(data.type ? { tokenType: data.type } : {}),
      ...(data.expires_at && data.expires_at > 0 ? { expiresAt: new Date(data.expires_at * 1000) } : {}),
      ...(data.data_access_expires_at && data.data_access_expires_at > 0
        ? { dataAccessExpiresAt: new Date(data.data_access_expires_at * 1000) } : {}),
      scopes: Array.isArray(data.scopes) ? data.scopes.filter((scope): scope is string => typeof scope === "string") : [],
      granularScopes: Array.isArray(data.granular_scopes)
        ? data.granular_scopes.flatMap((grant) => typeof grant.scope === "string"
          ? [{ scope: grant.scope, targetIds: Array.isArray(grant.target_ids)
            ? grant.target_ids.filter((id): id is string => typeof id === "string") : [] }]
          : [])
        : []
    };
  }

  private toAccessToken(payload: TokenExchangeResponse): MetaAccessToken {
    if (!payload.access_token) throw new ApplicationError("EXTERNAL_PROVIDER_ERROR", "Meta did not return an access token.");
    const expiresAt = typeof payload.expires_in === "number" && payload.expires_in > 0
      ? new Date(Date.now() + payload.expires_in * 1000) : null;
    return {
      value: payload.access_token,
      tokenType: payload.token_type ?? "bearer",
      expiresAt,
      dataAccessExpiresAt: null,
      scopes: []
    };
  }

  private async request<T>(url: URL): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object") {
        throw new ApplicationError("EXTERNAL_PROVIDER_ERROR", "Meta OAuth request failed with HTTP " + response.status + ".");
      }
      if ("error" in payload) {
        const message = (payload as { error?: { message?: string } }).error?.message;
        throw new ApplicationError("EXTERNAL_PROVIDER_ERROR", "Meta OAuth rejected the request: " + (message ?? "unknown provider error"));
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError("DEPENDENCY_UNAVAILABLE", "Meta OAuth service is temporarily unavailable.", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}
