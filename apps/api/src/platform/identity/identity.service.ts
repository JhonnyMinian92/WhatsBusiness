import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import {
  IdentityRepository,
  type MembershipSummary,
  type ResolvedIdentityUser,
  type TenantContextRecord,
} from "./identity.repository.js";
import type { OidcClaims } from "./oidc-auth.guard.js";

export interface CurrentPrincipalResponse {
  readonly userId: string;
  readonly displayName: string | null;
  readonly memberships: readonly MembershipSummary[];
}
export interface TenantListResponse {
  readonly items: readonly MembershipSummary[];
  readonly nextCursor: string | null;
}

@Injectable()
export class IdentityService {
  constructor(private readonly repository: IdentityRepository) {}

  async currentPrincipal(claims: OidcClaims): Promise<CurrentPrincipalResponse> {
    const user = await this.activeUser(claims);
    return {
      userId: user.userId,
      displayName: user.displayName,
      memberships: await this.repository.membershipsForUser(user.userId),
    };
  }

  async accessibleTenants(
    claims: OidcClaims,
    cursor: string | undefined,
    pageSize: number,
  ): Promise<TenantListResponse> {
    const user = await this.activeUser(claims);
    return this.repository.accessibleTenants(user.userId, cursor, pageSize);
  }

  async tenantContext(claims: OidcClaims, tenantId: string): Promise<TenantContextRecord> {
    const user = await this.activeUser(claims);
    const context = await this.repository.tenantContext(user.userId, tenantId);
    if (!context) {
      throw new NotFoundException({
        code: "TENANT_CONTEXT_NOT_FOUND",
        detail: "El tenant no existe o no es accesible para este usuario.",
      });
    }
    return context;
  }

  private async activeUser(claims: OidcClaims): Promise<ResolvedIdentityUser> {
    const user = await this.repository.resolveOidcUser(claims.issuer, claims.subject);
    if (!user) {
      throw new HttpException({
        code: "USER_NOT_PROVISIONED",
        detail: "La identidad autenticada todavía no está provisionada en WhatsBusiness.",
      }, HttpStatus.FORBIDDEN);
    }
    if (user.status !== "active") {
      throw new ForbiddenException({
        code: "USER_NOT_ACTIVE",
        detail: "La cuenta no está habilitada para acceder a WhatsBusiness.",
      });
    }
    return user;
  }
}
