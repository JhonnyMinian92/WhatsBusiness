import {
  BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards,
} from "@nestjs/common";
import { OidcAuthGuard } from "../../../platform/identity/oidc-auth.guard.js";
import {
  requireTenantAccessContext, type TenantAuthenticatedRequest,
} from "../../../platform/identity/tenant-context.guard.js";
import { RequireTenantPermission } from "../../../platform/identity/authorization/authorization.guard.js";
import { ContactIdentityService } from "../application/contact-identity.service.js";

@Controller("v1/tenants/:tenantId/contacts/:contactId/identities")
@UseGuards(OidcAuthGuard)
export class ContactIdentityController {
  constructor(private readonly identities: ContactIdentityService) {}

  @Get()
  @RequireTenantPermission("crm.contacts.identities.read", "crm.contacts.identities.read")
  list(
    @Param("tenantId") tenantId: string,
    @Param("contactId") contactId: string,
    @Query("pageSize") pageSize: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Req() request: TenantAuthenticatedRequest,
  ) {
    return this.identities.list(this.subject(tenantId, request), contactId, { pageSize, cursor });
  }

  @Post()
  @RequireTenantPermission("crm.contacts.identities.link", "crm.contacts.identities.link")
  link(
    @Param("tenantId") tenantId: string,
    @Param("contactId") contactId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: TenantAuthenticatedRequest,
  ) {
    return this.identities.link(this.subject(tenantId, request), contactId, body, idempotencyKey ?? "");
  }

  private subject(tenantId: string, request: TenantAuthenticatedRequest) {
    const subject = requireTenantAccessContext(request);
    if (subject.tenantId !== tenantId) {
      throw new BadRequestException({
        code: "CRM_TENANT_CONTEXT_MISMATCH",
        detail: "El tenant de la ruta no coincide con el contexto autorizado.",
      });
    }
    return subject;
  }
}
