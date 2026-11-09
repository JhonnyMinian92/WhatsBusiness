import type { MetaOAuthScopePolicyPort } from "../application/meta-oauth.ports.js";

export type MetaOAuthProduct =
  | "whatsapp_business_platform"
  | "facebook_pages"
  | "instagram"
  | "marketing_api"
  | "conversions_api"
  | "threads";
export type MetaAuthorizationMode = "user_token" | "system_user_token";

export interface MetaOAuthRequest {
  readonly product: MetaOAuthProduct;
  readonly authorizationMode: MetaAuthorizationMode;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly returnPath: string;
}
export interface MetaOAuthPolicyConfig {
  readonly allowedRedirectUris: readonly string[];
  readonly maximumStateLifetimeSeconds?: number;
}
export class MetaOAuthPolicyViolation extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "MetaOAuthPolicyViolation";
  }
}

const PRODUCTS: readonly MetaOAuthProduct[] = [
  "whatsapp_business_platform", "facebook_pages", "instagram",
  "marketing_api", "conversions_api", "threads",
];
const UUID_SAFE_PATH = /^\/(?!\/)[^\r\n]*$/;

export class MetaOAuthPolicy {
  private readonly allowedRedirectUris: ReadonlySet<string>;
  readonly stateLifetimeSeconds: number;

  constructor(
    config: MetaOAuthPolicyConfig,
    private readonly scopePolicy: MetaOAuthScopePolicyPort,
  ) {
    this.allowedRedirectUris = new Set(config.allowedRedirectUris.map((value) => value.trim()).filter(Boolean));
    this.stateLifetimeSeconds = config.maximumStateLifetimeSeconds ?? 600;
    if (!Number.isSafeInteger(this.stateLifetimeSeconds)
      || this.stateLifetimeSeconds < 60 || this.stateLifetimeSeconds > 900) {
      throw new MetaOAuthPolicyViolation("META_OAUTH_TTL_INVALID", "La vigencia de OAuth debe estar entre 60 y 900 segundos.");
    }
  }

  validate(request: MetaOAuthRequest): MetaOAuthRequest {
    if (!PRODUCTS.includes(request.product)) {
      throw new MetaOAuthPolicyViolation("META_OAUTH_PRODUCT_INVALID", "El producto Meta solicitado no está soportado.");
    }
    if (request.authorizationMode !== "user_token" && request.authorizationMode !== "system_user_token") {
      throw new MetaOAuthPolicyViolation("META_OAUTH_MODE_INVALID", "El modo de autorización no está soportado.");
    }
    const redirectUri = this.validateRedirectUri(request.redirectUri);
    if (!UUID_SAFE_PATH.test(request.returnPath) || request.returnPath.length > 512) {
      throw new MetaOAuthPolicyViolation("META_OAUTH_RETURN_PATH_INVALID", "La ruta de retorno debe ser relativa al origen.");
    }
    if (!Array.isArray(request.scopes) || request.scopes.length < 1 || request.scopes.length > 100) {
      throw new MetaOAuthPolicyViolation("META_OAUTH_SCOPES_INVALID", "El conjunto de scopes es vacío o excede el límite permitido.");
    }
    const unique = new Set<string>();
    for (const scope of request.scopes) {
      if (typeof scope !== "string" || !/^[a-z][a-z0-9_]{1,127}$/.test(scope) || unique.has(scope)) {
        throw new MetaOAuthPolicyViolation("META_OAUTH_SCOPES_INVALID", "Los scopes contienen valores inválidos o duplicados.");
      }
      if (!this.scopePolicy.isAllowed(request.product, scope)) {
        throw new MetaOAuthPolicyViolation("META_OAUTH_SCOPE_UNVERIFIED", "El scope no cuenta con evidencia oficial vigente para este producto.");
      }
      unique.add(scope);
    }
    return {
      ...request,
      redirectUri,
      scopes: Object.freeze([...unique]),
      returnPath: request.returnPath,
    };
  }

  private validateRedirectUri(value: string): string {
    let parsed: URL;
    try { parsed = new URL(value); } catch {
      throw new MetaOAuthPolicyViolation("META_OAUTH_REDIRECT_INVALID", "El redirect URI no es válido.");
    }
    if (parsed.username || parsed.password || parsed.hash
      || !this.allowedRedirectUris.has(parsed.toString())) {
      throw new MetaOAuthPolicyViolation("META_OAUTH_REDIRECT_NOT_ALLOWED", "El redirect URI no pertenece a la allowlist exacta.");
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new MetaOAuthPolicyViolation("META_OAUTH_REDIRECT_INSECURE", "OAuth requiere HTTPS fuera de desarrollo local.");
    }
    return parsed.toString();
  }
}
