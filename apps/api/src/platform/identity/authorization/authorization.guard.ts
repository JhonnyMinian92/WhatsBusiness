import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  requireTenantAccessContext,
  TenantAccessPurpose,
  TenantContextGuard,
  type TenantAuthenticatedRequest,
} from "../tenant-context.guard.js";
import { isPermissionKey, type PermissionKey } from "./permission-catalog.js";
import { AuthorizationService } from "./authorization.service.js";

export const REQUIRED_TENANT_PERMISSION = "whatsbusiness:required-tenant-permission";

export function RequirePermission(permission: PermissionKey): MethodDecorator {
  if (!isPermissionKey(permission)) {
    throw new Error("Unknown tenant permission key.");
  }
  return SetMetadata(REQUIRED_TENANT_PERMISSION, permission);
}

/**
 * Composite route decorator that cannot forget either the tenant-context guard,
 * the stable purpose declaration or the required RBAC permission.
 */
export function RequireTenantPermission(
  permission: PermissionKey,
  purpose: string,
): MethodDecorator {
  if (!isPermissionKey(permission)) {
    throw new Error("Unknown tenant permission key.");
  }
  return applyDecorators(
    UseGuards(TenantContextGuard, AuthorizationGuard),
    TenantAccessPurpose(purpose),
    RequirePermission(permission),
  );
}

/**
 * HTTP boundary guard for coarse tenant permission checks. Resource ownership,
 * consent, capability freshness and approval facts must also be evaluated by
 * the application use case through AuthorizationService.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  canActivate(execution: ExecutionContext): boolean {
    const permission = this.reflector.get<PermissionKey>(
      REQUIRED_TENANT_PERMISSION,
      execution.getHandler(),
    );
    if (!permission || !isPermissionKey(permission)) {
      throw new ForbiddenException({
        code: "TENANT_PERMISSION_REQUIRED",
        detail: "La ruta tenant-scoped no declaró un permiso requerido.",
      });
    }

    const request = execution.switchToHttp().getRequest<TenantAuthenticatedRequest>();
    const subject = requireTenantAccessContext(request);
    const decision = this.authorization.authorizeTenantPermission(subject, permission);
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: "AUTHORIZATION_DENIED",
        detail: "La operación no está autorizada para este actor y tenant.",
        reason: decision.reason,
      });
    }
    return true;
  }
}
