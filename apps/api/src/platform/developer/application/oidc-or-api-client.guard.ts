import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { OidcAuthGuard } from "../../identity/oidc-auth.guard.js";

/**
 * Authentication boundary shared by tenant HTTP controllers.
 *
 * Only the independently verified OIDC path is enabled at this point.
 * Developer API-client credentials remain denied until TASK-062 has a frozen
 * contract, a credential store, rotation/revocation semantics and its own
 * authentication integration. Do not trust a request-supplied client context.
 */
@Injectable()
export class OidcOrApiClientGuard implements CanActivate {
  constructor(private readonly oidc: OidcAuthGuard) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    return this.oidc.canActivate(context);
  }
}

/** Trusted principal shape reserved for the future TASK-062 authenticator. */
export interface DeveloperApiClientPrincipal {
  readonly clientId: string;
  readonly ownerUserId: string;
  readonly tenantId: string;
  readonly scopes: readonly string[];
}
