import {
  BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { OidcOrApiClientGuard } from "../../../platform/developer/application/oidc-or-api-client.guard.js";
import {
  requireTenantAccessContext, type TenantAuthenticatedRequest,
} from "../../../platform/identity/tenant-context.guard.js";
import { RequireTenantPermission } from "../../../platform/identity/authorization/authorization.guard.js";
import { ContactService } from "../application/contact.service.js";

@Controller("v1/tenants/:tenantId/contacts")
@UseGuards(OidcOrApiClientGuard)
export class ContactController {
  constructor(private readonly contacts: ContactService) {}

  @Get()
  @RequireTenantPermission("crm.contacts.read", "crm.contacts.read")
  list(
    @Param("tenantId") tenantId: string,
    @Query("q") query: string | undefined,
    @Query("contactType") contactType: string | undefined,
    @Query("status") status: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Req() request: TenantAuthenticatedRequest,
  ) {
    const subject = this.subject(tenantId, request);
    return this.contacts.list(subject, { query, contactType, status, pageSize, cursor });
  }

  @Post()
  @RequireTenantPermission("crm.contacts.create", "crm.contacts.create")
  async create(
    @Param("tenantId") tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: TenantAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const contact = await this.contacts.create(this.subject(tenantId, request), body, idempotencyKey ?? "");
    response.setHeader("ETag", contactEtag(contact.version));
    return contact;
  }

  @Get(":contactId")
  @RequireTenantPermission("crm.contacts.read", "crm.contacts.read")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("contactId") contactId: string,
    @Req() request: TenantAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const contact = await this.contacts.get(this.subject(tenantId, request), contactId);
    response.setHeader("ETag", contactEtag(contact.version));
    return contact;
  }

  @Patch(":contactId")
  @RequireTenantPermission("crm.contacts.update", "crm.contacts.update")
  async update(
    @Param("tenantId") tenantId: string,
    @Param("contactId") contactId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: TenantAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const expectedVersion = parseContactEtag(ifMatch);
    const contact = await this.contacts.update(
      this.subject(tenantId, request), contactId, expectedVersion, body, idempotencyKey ?? "",
    );
    response.setHeader("ETag", contactEtag(contact.version));
    return contact;
  }

  private subject(tenantId: string, request: TenantAuthenticatedRequest) {
    const subject = requireTenantAccessContext(request);
    if (subject.tenantId !== tenantId) {
      throw new BadRequestException({ code: "CRM_TENANT_CONTEXT_MISMATCH", detail: "El tenant de la ruta no coincide con el contexto autorizado." });
    }
    return subject;
  }
}

function contactEtag(version: number): string {
  return '"contact-' + version + '"';
}

function parseContactEtag(value: string | undefined): number {
  const match = value && /^"contact-([1-9][0-9]*)"$/.exec(value);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new BadRequestException({ code: "CRM_CONTACT_IF_MATCH_REQUIRED", detail: 'If-Match debe contener el ETag devuelto para el contacto, por ejemplo "contact-3".' });
  }
  return version;
}
