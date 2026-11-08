import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import {
  IdentityRepository,
  type MembershipSummary,
  type ResolvedIdentityUser,
  type TenantContextRecord,
} from "./identity.repository.js";
import type { TenantAccessContext } from "./tenant-access-context.js";
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

  async authorizeTenantAccess(
    claims: OidcClaims,
    tenantId: string,
    purpose: string,
    correlationId: string,
  ): Promise<TenantAccessContext> {
    const user = await this.activeUser(claims);
    const resolved = await this.repository.tenantContext(user.userId, tenantId);
    if (!resolved) {
      throw new NotFoundException({
        code: "TENANT_CONTEXT_NOT_FOUND",
        detail: "El tenant no existe o no es accesible para este usuario.",
      });
    }

    return {
      actorId: user.userId,
      tenantId: resolved.tenantId,
      membershipId: resolved.membershipId,
      membershipStatus: resolved.membershipStatus,
      authzVersion: resolved.authzVersion,
      roleKeys: resolved.roleKeys,
      permissionKeys: resolved.permissionKeys,
      entitlementKeys: resolved.entitlementKeys,
      locale: resolved.locale,
      timezone: resolved.timezone,
      currency: resolved.currency,
      purpose,
      correlationId,
    };
  }


  /**
   * Resolves a service credential against its owning, currently active tenant member.
   * The API-client guard has already validated key digest, expiry and active status;
   * this method deliberately re-resolves membership and grants on every request.
   */
  async authorizeTenantAccessForActor(
    actorUserId: string,
    tenantId: string,
    purpose: string,
    correlationId: string,
  ): Promise<TenantAccessContext> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorUserId)) {
      throw new ForbiddenException({ code: "DEVELOPER_API_CLIENT_OWNER_INVALID" });
    }
    const resolved = await this.repository.tenantContext(actorUserId, tenantId);
    if (!resolved) {
      throw new NotFoundException({
        code: "TENANT_CONTEXT_NOT_FOUND",
        detail: "El tenant no existe o no es accesible para el propietario de la credencial.",
      });
    }
    return {
      actorId: actorUserId,
      tenantId: resolved.tenantId,
      membershipId: resolved.membershipId,
      membershipStatus: resolved.membershipStatus,
      authzVersion: resolved.authzVersion,
      roleKeys: resolved.roleKeys,
      permissionKeys: resolved.permissionKeys,
      entitlementKeys: resolved.entitlementKeys,
      locale: resolved.locale,
      timezone: resolved.timezone,
      currency: resolved.currency,
      purpose,
      correlationId,
    };
  }

  tenantContextResponse(context: TenantAccessContext): TenantContextRecord {
    return {
      tenantId: context.tenantId,
      membershipStatus: context.membershipStatus,
      roleKeys: context.roleKeys,
      permissionKeys: context.permissionKeys,
      entitlementKeys: context.entitlementKeys,
      locale: context.locale,
      timezone: context.timezone,
      currency: context.currency,
    };
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
