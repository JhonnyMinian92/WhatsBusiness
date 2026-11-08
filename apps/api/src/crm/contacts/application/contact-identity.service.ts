import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.module.js";
import { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type { PermissionKey } from "../../../platform/identity/authorization/permission-catalog.js";
import { PostgresContactRepository } from "../infrastructure/postgres-contact.repository.js";
import { PostgresContactIdentityRepository } from "../infrastructure/postgres-contact-identity.repository.js";
import { ContactValidationError, isContactUuid } from "../domain/contact.js";
import {
  encodeContactIdentityCursor, parseContactIdentityListQuery, parseCreateContactIdentity,
  type ContactIdentityListQuery, type ContactIdentityPage, type ContactIdentityRecord,
  type CreateContactIdentityCommand,
} from "../domain/contact-identity.js";
import {
  assertIdempotencyKey, assertSameIdempotencyRequest, hashContactCommand,
} from "./contact-command-support.js";

@Injectable()
export class ContactIdentityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly identities: PostgresContactIdentityRepository,
    private readonly contacts: PostgresContactRepository,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  async list(
    subject: TenantAccessContext,
    contactId: string,
    input: { readonly pageSize?: string; readonly cursor?: string },
  ): Promise<ContactIdentityPage> {
    this.assertPermission(subject, "crm.contacts.identities.read");
    this.assertContactId(contactId);
    let query: ContactIdentityListQuery;
    try {
      query = parseContactIdentityListQuery(input);
    } catch (error) {
      throw mapValidationError(error);
    }

    return this.database.withTenantContextAtVersion(
      subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const contact = await this.contacts.findById(client, subject.tenantId, contactId);
        if (!contact) {
          throw new NotFoundException({
            code: "CRM_CONTACT_NOT_FOUND",
            detail: "El contacto no existe o no es visible.",
          });
        }
        const rows = await this.identities.list(client, subject.tenantId, contactId, query);
        const hasMore = rows.length > query.pageSize;
        const items = rows.slice(0, query.pageSize);
        const last = items.at(-1);
        return Object.freeze({
          items: Object.freeze(items),
          nextCursor: hasMore && last
            ? encodeContactIdentityCursor({ createdAt: last.createdAt, id: last.id })
            : null,
        });
      },
    );
  }

  async link(
    subject: TenantAccessContext,
    contactId: string,
    input: unknown,
    idempotencyKey: string,
  ): Promise<ContactIdentityRecord> {
    this.assertPermission(subject, "crm.contacts.identities.link");
    this.assertContactId(contactId);
    let command: CreateContactIdentityCommand;
    try {
      command = parseCreateContactIdentity(input);
    } catch (error) {
      throw mapValidationError(error);
    }
    assertIdempotencyKey(idempotencyKey);
    const requestHash = hashContactCommand({ contactId, command });

    return this.database.withTenantContextAtVersion(
      subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.contacts.reserveCommand<ContactIdentityRecord>(client, {
          tenantId: subject.tenantId, actorId: subject.actorId, operation: "link_identity",
          idempotencyKey, requestHash,
        });
        if (reservation.kind === "existing") {
          assertSameIdempotencyRequest(reservation.requestHash, requestHash);
          if (!reservation.response) {
            throw new ConflictException({ code: "CRM_CONTACT_IDENTITY_IDEMPOTENCY_INCOMPLETE" });
          }
          return reservation.response;
        }

        const contact = await this.contacts.findById(client, subject.tenantId, contactId);
        if (!contact) {
          throw new NotFoundException({
            code: "CRM_CONTACT_NOT_FOUND",
            detail: "El contacto no existe o no es visible.",
          });
        }
        if (contact.status !== "active") {
          throw new ConflictException({
            code: "CRM_CONTACT_ARCHIVED",
            detail: "No se pueden vincular identidades nuevas a un contacto archivado.",
          });
        }

        let identity: ContactIdentityRecord;
        try {
          identity = await this.identities.create(client, subject.tenantId, subject.actorId, contactId, command);
        } catch (error) {
          if (isPostgresUniqueViolation(error)) {
            throw new ConflictException({
              code: "CRM_CONTACT_IDENTITY_ALREADY_LINKED",
              detail: "El identificador ya está vinculado a un contacto de este tenant.",
            });
          }
          throw error;
        }
        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: "crm.contacts.identity.link",
          resourceType: "contact_identity",
          resourceId: identity.id,
          purpose: subject.purpose,
          outcome: "allowed",
          correlationId: subject.correlationId,
          requestHash,
        });
        await this.contacts.completeCommand(client, reservation.id, identity);
        return identity;
      },
    );
  }

  private assertPermission(subject: TenantAccessContext, permission: PermissionKey): void {
    if (!subject.permissionKeys.includes(permission)) {
      throw new ForbiddenException({
        code: "CRM_CONTACT_IDENTITY_PERMISSION_REQUIRED",
        detail: "No tienes permiso para esta operación de identidad CRM.",
      });
    }
  }

  private assertContactId(contactId: string): void {
    if (!isContactUuid(contactId)) {
      throw new BadRequestException({ code: "CRM_CONTACT_ID_INVALID", detail: "contactId debe ser UUID." });
    }
  }
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && "code" in error && (error as { readonly code?: unknown }).code === "23505";
}

function mapValidationError(error: unknown): Error {
  if (error instanceof ContactValidationError) {
    return new BadRequestException({
      code: error.code,
      detail: "Los datos de identidad no cumplen el contrato.",
    });
  }
  return error instanceof Error ? error : new Error("CRM_CONTACT_IDENTITY_VALIDATION_FAILED");
}
