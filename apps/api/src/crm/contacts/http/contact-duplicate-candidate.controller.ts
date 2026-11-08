import {
  BadRequestException, Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards,
} from "@nestjs/common";
import { OidcOrApiClientGuard } from "../../../platform/developer/application/oidc-or-api-client.guard.js";
import {
  requireTenantAccessContext, type TenantAuthenticatedRequest,
} from "../../../platform/identity/tenant-context.guard.js";
import { RequireTenantPermission } from "../../../platform/identity/authorization/authorization.guard.js";
import { ContactDuplicateCandidateService } from "../application/contact-duplicate-candidate.service.js";

@Controller("v1/tenants/:tenantId/identity-resolution/candidates")
@UseGuards(OidcOrApiClientGuard)
export class ContactDuplicateCandidateController {
  constructor(private readonly candidates: ContactDuplicateCandidateService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireTenantPermission("crm.contacts.identities.read", "crm.contacts.identities.read")
  findCandidates(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Req() request: TenantAuthenticatedRequest,
  ) {
    const subject = requireTenantAccessContext(request);
    if (subject.tenantId !== tenantId) {
      throw new BadRequestException({
        code: "CRM_TENANT_CONTEXT_MISMATCH",
        detail: "El tenant de la ruta no coincide con el contexto autorizado.",
      });
    }
    return this.candidates.findCandidates(subject, body);
  }
}
