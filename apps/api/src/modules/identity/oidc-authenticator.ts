import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { ApplicationError } from "../../platform/errors/application-error.js";

export interface AuthenticatedActor {
  readonly userId: string;
  readonly email?: string;
  readonly activeTenantId?: string;
  readonly roles: readonly string[];
}

export interface TokenAuthenticator {
  authenticate(accessToken: string): Promise<AuthenticatedActor>;
}

export class OidcJwtAuthenticator implements TokenAuthenticator {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    jwksUrl: string,
    private readonly issuer: string,
    private readonly audience: string
  ) {
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async authenticate(accessToken: string): Promise<AuthenticatedActor> {
    try {
      const { payload } = await jwtVerify(accessToken, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["RS256", "ES256"],
        clockTolerance: 5
      });
      const userId = typeof payload.sub === "string" ? payload.sub : "";
      if (!userId) throw new ApplicationError("UNAUTHENTICATED", "The access token has no subject.");
      const email = typeof payload.email === "string" ? payload.email : undefined;
      const activeTenantId = typeof payload.tenant_id === "string" ? payload.tenant_id : undefined;
      const roles = Array.isArray(payload.roles)
        ? payload.roles.filter((role): role is string => typeof role === "string")
        : [];
      return {
        userId,
        ...(email ? { email } : {}),
        ...(activeTenantId ? { activeTenantId } : {}),
        roles
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError("UNAUTHENTICATED", "The access token is invalid or expired.", { cause: error });
    }
  }
}

export function getBearerToken(header: string | undefined): string {
  if (!header?.startsWith("Bearer ")) {
    throw new ApplicationError("UNAUTHENTICATED", "A Bearer access token is required.");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token || token.length > 16_384) {
    throw new ApplicationError("UNAUTHENTICATED", "The access token is malformed.");
  }
  return token;
}

export function safeIdentityClaims(payload: JWTPayload): Readonly<Record<string, string>> {
  const claims: Record<string, string> = {};
  if (typeof payload.sub === "string") claims.sub = payload.sub;
  if (typeof payload.iss === "string") claims.iss = payload.iss;
  if (typeof payload.aud === "string") claims.aud = payload.aud;
  return Object.freeze(claims);
}
