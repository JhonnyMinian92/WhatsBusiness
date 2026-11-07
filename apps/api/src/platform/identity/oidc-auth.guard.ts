import { createPublicKey, verify as verifySignature } from "node:crypto";
import {
  CanActivate, ExecutionContext, Injectable,
  ServiceUnavailableException, UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

interface JwtHeader { readonly alg?: unknown; readonly kid?: unknown; }
interface JwtPayload {
  readonly iss?: unknown; readonly sub?: unknown; readonly aud?: unknown;
  readonly exp?: unknown; readonly nbf?: unknown; readonly azp?: unknown; readonly name?: unknown;
  readonly auth_time?: unknown; readonly acr?: unknown; readonly amr?: unknown;
}
interface JsonWebKeyRecord {
  readonly kid?: string; readonly kty?: string; readonly use?: string;
  readonly alg?: string; readonly n?: string; readonly e?: string;
}
interface JwksDocument { readonly keys?: readonly JsonWebKeyRecord[]; }

export interface OidcClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly audience: readonly string[];
  readonly expiresAt: number;
  readonly displayName: string | null;
  readonly authTime: number | null;
  readonly authenticationContext: string | null;
  readonly authenticationMethods: readonly string[];
}
export interface OidcAuthenticatedRequest extends Request { oidcClaims?: OidcClaims; }

@Injectable()
export class OidcJwtVerifier {
  private cachedKeys: { readonly keys: readonly JsonWebKeyRecord[]; readonly expiresAt: number } | null = null;
  private pendingRefresh: Promise<readonly JsonWebKeyRecord[]> | null = null;

  async verify(token: string): Promise<OidcClaims> {
    if (typeof token !== "string" || token.length < 32 || token.length > 16_384) {
      throw new UnauthorizedException("Bearer token is invalid.");
    }
    const parts = token.split(".");
    if (parts.length !== 3) throw new UnauthorizedException("Bearer token is invalid.");

    const header = this.decodeSegment<JwtHeader>(parts[0]);
    if (header.alg !== "RS256" || typeof header.kid !== "string" ||
        header.kid.length === 0 || header.kid.length > 256) {
      throw new UnauthorizedException("Only signed RS256 access tokens are accepted.");
    }

    const config = this.configuration();
    const key = await this.publicKey(header.kid, config.jwksUri);
    if (!key) throw new UnauthorizedException("Bearer token signing key is unknown.");

    const signature = Buffer.from(parts[2], "base64url");
    if (signature.length < 128 || signature.length > 1024) {
      throw new UnauthorizedException("Bearer token signature is invalid.");
    }
    const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
    if (!verifySignature("RSA-SHA256", signedContent, key, signature)) {
      throw new UnauthorizedException("Bearer token signature is invalid.");
    }

    const payload = this.decodeSegment<JwtPayload>(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    const audience = typeof payload.aud === "string"
      ? [payload.aud]
      : Array.isArray(payload.aud) && payload.aud.every((item) => typeof item === "string")
        ? payload.aud as string[]
        : [];

    const authTime = payload.auth_time;
    const authenticationContext = payload.acr;
    const authenticationMethods = payload.amr;

    if (
      payload.iss !== config.issuer ||
      typeof payload.sub !== "string" ||
      payload.sub.trim().length === 0 ||
      payload.sub.length > 512 ||
      !audience.includes(config.audience) ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= now ||
      (payload.nbf !== undefined && (typeof payload.nbf !== "number" || payload.nbf > now)) ||
      (audience.length > 1 && payload.azp !== config.audience) ||
      (authTime !== undefined && (
        typeof authTime !== "number" ||
        !Number.isSafeInteger(authTime) ||
        authTime < 0 ||
        authTime > now + 60
      )) ||
      (authenticationContext !== undefined && (
        typeof authenticationContext !== "string" ||
        authenticationContext.length === 0 ||
        authenticationContext.length > 512
      )) ||
      (authenticationMethods !== undefined && (
        !Array.isArray(authenticationMethods) ||
        authenticationMethods.length > 20 ||
        !authenticationMethods.every((method) =>
          typeof method === "string" && method.length > 0 && method.length <= 128
        )
      ))
    ) {
      throw new UnauthorizedException("Bearer token claims are invalid or expired.");
    }

    return {
      issuer: config.issuer,
      subject: payload.sub,
      audience,
      expiresAt: payload.exp,
      displayName: typeof payload.name === "string" && payload.name.trim().length > 0
        ? payload.name.trim().slice(0, 200)
        : null,
      authTime: typeof authTime === "number" ? authTime : null,
      authenticationContext: typeof authenticationContext === "string"
        ? authenticationContext
        : null,
      authenticationMethods: Array.isArray(authenticationMethods)
        ? authenticationMethods as string[]
        : [],
    };
  }

  private configuration(): { issuer: string; audience: string; jwksUri: string } {
    const issuer = process.env["OIDC_ISSUER"]?.trim();
    const audience = process.env["OIDC_AUDIENCE"]?.trim();
    const jwksUri = process.env["OIDC_JWKS_URI"]?.trim();
    if (!issuer || !audience || !jwksUri) {
      throw new ServiceUnavailableException("OIDC issuer, audience and JWKS endpoint must be configured.");
    }

    let issuerUrl: URL;
    let jwksUrl: URL;
    try {
      issuerUrl = new URL(issuer);
      jwksUrl = new URL(jwksUri);
    } catch {
      throw new ServiceUnavailableException("OIDC configuration contains an invalid URL.");
    }

    if (
      !["http:", "https:"].includes(issuerUrl.protocol) ||
      !["http:", "https:"].includes(jwksUrl.protocol) ||
      jwksUrl.username.length > 0 || jwksUrl.password.length > 0 || jwksUrl.hash.length > 0
    ) {
      throw new ServiceUnavailableException("OIDC configuration contains an invalid endpoint.");
    }
    if (
      process.env["NODE_ENV"] === "production" &&
      (issuerUrl.protocol !== "https:" || jwksUrl.protocol !== "https:")
    ) {
      throw new ServiceUnavailableException("Production OIDC endpoints must use HTTPS.");
    }
    return { issuer, audience, jwksUri: jwksUrl.toString() };
  }

  private async publicKey(kid: string, jwksUri: string) {
    let keys = await this.loadKeys(jwksUri, false);
    let jwk = keys.find((item) => item.kid === kid && this.isSigningKey(item));
    if (!jwk) {
      keys = await this.loadKeys(jwksUri, true);
      jwk = keys.find((item) => item.kid === kid && this.isSigningKey(item));
    }
    if (!jwk || !jwk.n || !jwk.e) return null;
    try {
      return createPublicKey({ key: jwk as never, format: "jwk" });
    } catch {
      throw new ServiceUnavailableException("OIDC JWKS contains an unusable signing key.");
    }
  }

  private isSigningKey(key: JsonWebKeyRecord): boolean {
    if (
      key.kty !== "RSA" ||
      (key.use !== undefined && key.use !== "sig") ||
      (key.alg !== undefined && key.alg !== "RS256") ||
      typeof key.n !== "string" || typeof key.e !== "string" ||
      !/^[A-Za-z0-9_-]+$/.test(key.n) || !/^[A-Za-z0-9_-]+$/.test(key.e)
    ) return false;
    return Buffer.from(key.n, "base64url").length >= 256;
  }

  private async loadKeys(jwksUri: string, force: boolean): Promise<readonly JsonWebKeyRecord[]> {
    if (force) this.cachedKeys = null;
    if (this.cachedKeys && this.cachedKeys.expiresAt > Date.now()) return this.cachedKeys.keys;
    if (this.pendingRefresh) return this.pendingRefresh;
    this.pendingRefresh = this.downloadKeys(jwksUri);
    try {
      const keys = await this.pendingRefresh;
      this.cachedKeys = { keys, expiresAt: Date.now() + 300_000 };
      return keys;
    } finally {
      this.pendingRefresh = null;
    }
  }

  private async downloadKeys(jwksUri: string): Promise<readonly JsonWebKeyRecord[]> {
    let response: Response;
    try {
      response = await fetch(jwksUri, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ServiceUnavailableException("OIDC signing keys could not be reached.");
    }
    if (!response.ok) throw new ServiceUnavailableException("OIDC signing keys are unavailable.");
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > 1_000_000) {
      throw new ServiceUnavailableException("OIDC JWKS response exceeds the allowed size.");
    }
    const body = await response.text();
    if (body.length > 1_000_000) {
      throw new ServiceUnavailableException("OIDC JWKS response exceeds the allowed size.");
    }
    let document: JwksDocument;
    try {
      document = JSON.parse(body) as JwksDocument;
    } catch {
      throw new ServiceUnavailableException("OIDC JWKS response is invalid JSON.");
    }
    if (!Array.isArray(document.keys) || document.keys.length === 0 || document.keys.length > 100) {
      throw new ServiceUnavailableException("OIDC JWKS document has no usable key set.");
    }
    return document.keys;
  }

  private decodeSegment<T>(segment: string): T {
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
      throw new UnauthorizedException("Bearer token encoding is invalid.");
    }
    try {
      const decoded: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        throw new Error("JWT segment must be an object");
      }
      return decoded as T;
    } catch {
      throw new UnauthorizedException("Bearer token payload is invalid.");
    }
  }
}

@Injectable()
export class OidcAuthGuard implements CanActivate {
  constructor(private readonly verifier: OidcJwtVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OidcAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("A bearer access token is required.");
    }
    const token = authorization.slice("Bearer ".length).trim();
    if (!token || token.includes(" ")) throw new UnauthorizedException("Bearer token is invalid.");
    request.oidcClaims = await this.verifier.verify(token);
    return true;
  }
}
