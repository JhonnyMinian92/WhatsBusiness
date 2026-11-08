import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { OidcAuthenticatedRequest } from "./oidc-auth.guard.js";
import type { DeveloperApiClientPrincipal } from "../developer/application/oidc-or-api-client.guard.js";
import { IdentityService } from "./identity.service.js";
import type { TenantAccessContext } from "./tenant-access-context.js";

export const TENANT_ACCESS_PURPOSE = "whatsbusiness:tenant-access-purpose";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,7}$/;


export interface TenantAuthenticatedRequest extends OidcAuthenticatedRequest {
  correlationId?: string;
  tenantAccessContext?: TenantAccessContext;
  developerApiClientContext?: DeveloperApiClientPrincipal;
}

export function TenantAccessPurpose(purpose: string): MethodDecorator {
  if (!isValidPurpose(purpose)) {
    throw new Error("Tenant access purpose must be a stable dotted identifier.");
  }
  return SetMetadata(TENANT_ACCESS_PURPOSE, purpose);
}

export function requireTenantAccessContext(
  request: TenantAuthenticatedRequest,
): TenantAccessContext {
  if (!request.tenantAccessContext) {
    throw new InternalServerErrorException({
      code: "TENANT_CONTEXT_NOT_RESOLVED",
      detail: "La ruta tenant-scoped no resolvió el contexto de autorización.",
    });
  }
  return request.tenantAccessContext;
}

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const request = execution.switchToHttp().getRequest<TenantAuthenticatedRequest>();

    const tenantId = request.params["tenantId"];
    if (typeof tenantId !== "string" || !UUID_PATTERN.test(tenantId)) {
      throw new BadRequestException("A valid tenantId path parameter is required.");
    }

    const purpose = this.reflector.get<string>(
      TENANT_ACCESS_PURPOSE,
      execution.getHandler(),
    );
    if (!isValidPurpose(purpose)) {
      throw new ForbiddenException({
        code: "TENANT_ACCESS_PURPOSE_REQUIRED",
        detail: "La ruta tenant-scoped no declaró un propósito de acceso válido.",
      });
    }

    const correlationId = resolveCorrelationId(request);
    request.correlationId = correlationId;
    const response = execution.switchToHttp().getResponse<Response>();
    response.setHeader("X-Correlation-ID", correlationId);

    const clientPrincipal = request.developerApiClientContext;
    let context: TenantAccessContext;
    if (clientPrincipal) {
      if (clientPrincipal.tenantId !== tenantId) {
        throw new NotFoundException({
          code: "TENANT_CONTEXT_NOT_FOUND",
          detail: "La credencial no pertenece al tenant solicitado.",
        });
      }
      context = await this.identity.authorizeTenantAccessForActor(
        clientPrincipal.ownerUserId,
        tenantId,
        purpose,
        correlationId,
      );
      const allowedScopes = new Set(clientPrincipal.scopes);
      context = Object.freeze({
        ...context,
        permissionKeys: Object.freeze(context.permissionKeys.filter((permission) => allowedScopes.has(permission))),
      });
    } else {
      const claims = request.oidcClaims;
      if (!claims) throw new UnauthorizedException("A verified OIDC or developer API principal is required.");
      context = await this.identity.authorizeTenantAccess(claims, tenantId, purpose, correlationId);
    }

    request.tenantAccessContext = Object.freeze({
      ...context,
      roleKeys: Object.freeze([...context.roleKeys]),
      permissionKeys: Object.freeze([...context.permissionKeys]),
      entitlementKeys: Object.freeze([...context.entitlementKeys]),
    });
    return true;
  }
}

function resolveCorrelationId(request: TenantAuthenticatedRequest): string {
  const supplied = request.header("x-correlation-id");
  return supplied && UUID_PATTERN.test(supplied) ? supplied : randomUUID();
}

function isValidPurpose(purpose: unknown): purpose is string {
  return typeof purpose === "string"
    && purpose.length <= 128
    && PURPOSE_PATTERN.test(purpose);
}
