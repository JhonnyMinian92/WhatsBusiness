import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type { PermissionKey } from "../../../platform/identity/authorization/permission-catalog.js";
import { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import { DatabaseService } from "../../../platform/database/database.module.js";
import {
  ContactValidationError, encodeContactCursor, isContactUuid,
  parseContactListQuery, parseCreateContact, parseUpdateContact,
  type ContactListQuery, type ContactPage, type ContactRecord,
} from "../domain/contact.js";
import { PostgresContactRepository } from "../infrastructure/postgres-contact.repository.js";
import { assertIdempotencyKey, assertSameIdempotencyRequest, hashContactCommand } from "./contact-command-support.js";

@Injectable()
export class ContactService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: PostgresContactRepository,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  async list(subject: TenantAccessContext, input: {
    query?: string; contactType?: string; status?: string; pageSize?: string; cursor?: string;
  }): Promise<ContactPage> {
    this.assertPermission(subject, "crm.contacts.read");
    let query: ContactListQuery;
    try { query = parseContactListQuery({
      ...input,
      includeRestrictedFields: subject.permissionKeys.includes("crm.contacts.custom_fields.read_restricted"),
    }); }
    catch (error) { throw mapValidationError(error); }

    return this.database.withTenantContextAtVersion(
      subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const rows = await this.repository.list(client, subject.tenantId, query);
        const hasMore = rows.length > query.pageSize;
        const items = rows.slice(0, query.pageSize);
        const last = items.at(-1);
        return Object.freeze({
          items: Object.freeze(items),
          nextCursor: hasMore && last
            ? encodeContactCursor({ createdAt: last.createdAt, id: last.id })
            : null,
        });
      },
    );
  }

  async get(subject: TenantAccessContext, contactId: string): Promise<ContactRecord> {
    this.assertPermission(subject, "crm.contacts.read");
    this.assertContactId(contactId);
    return this.database.withTenantContextAtVersion(
      subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const contact = await this.repository.findById(client, subject.tenantId, contactId);
        if (!contact) throw new NotFoundException({ code: "CRM_CONTACT_NOT_FOUND", detail: "El contacto no existe o no es visible." });
        return contact;
      },
    );
  }

  async create(subject: TenantAccessContext, input: unknown, idempotencyKey: string): Promise<ContactRecord> {
    this.assertPermission(subject, "crm.contacts.create");
    const command = (() => { try { return parseCreateContact(input); } catch (error) { throw mapValidationError(error); } })();
    assertIdempotencyKey(idempotencyKey);
    const requestHash = hashContactCommand({
      contactType: command.contactType, displayName: command.displayName,
      firstName: command.firstName, lastName: command.lastName,
      sourceType: command.sourceType, sourceReference: command.sourceReference,
      sourceCapturedAt: command.sourceCapturedAt,
    });

    return this.database.withTenantContextAtVersion(
      subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.repository.reserveCommand(client, {
          tenantId: subject.tenantId, actorId: subject.actorId,
          operation: "create", idempotencyKey, requestHash,
        });
        if (reservation.kind === "existing") {
          assertSameIdempotencyRequest(reservation.requestHash, requestHash);
          if (!reservation.response) throw new ConflictException({ code: "CRM_CONTACT_IDEMPOTENCY_INCOMPLETE" });
          return reservation.response;
        }

        const contact = await this.repository.create(client, subject.tenantId, subject.actorId, command);
        await this.audit.append(client, {
          tenantId: subject.tenantId, actorUserId: subject.actorId,
          actionKey: "crm.contacts.create", resourceType: "contact", resourceId: contact.id,
          purpose: subject.purpose, outcome: "allowed", correlationId: subject.correlationId, requestHash,
        });
        await this.repository.completeCommand(client, reservation.id, contact);
        return contact;
      },
    );
  }

  async update(
    subject: TenantAccessContext,
    contactId: string,
    expectedVersion: number,
    input: unknown,
    idempotencyKey: string,
  ): Promise<ContactRecord> {
    this.assertPermission(subject, "crm.contacts.update");
    this.assertContactId(contactId);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new BadRequestException({ code: "CRM_CONTACT_VERSION_INVALID", detail: "La versión If-Match no es válida." });
    }
    const command = (() => { try { return parseUpdateContact(input); } catch (error) { throw mapValidationError(error); } })();
    assertIdempotencyKey(idempotencyKey);
    const requestHash = hashContactCommand({ contactId, expectedVersion, patch: command });

    return this.database.withTenantContextAtVersion(
      subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.repository.reserveCommand(client, {
          tenantId: subject.tenantId, actorId: subject.actorId,
          operation: "update", idempotencyKey, requestHash,
        });
        if (reservation.kind === "existing") {
          assertSameIdempotencyRequest(reservation.requestHash, requestHash);
          if (!reservation.response) throw new ConflictException({ code: "CRM_CONTACT_IDEMPOTENCY_INCOMPLETE" });
          return reservation.response;
        }

        const contact = await this.repository.update(
          client, subject.tenantId, subject.actorId, contactId, expectedVersion, command,
        );
        if (!contact) {
          const existing = await this.repository.findById(client, subject.tenantId, contactId);
          if (!existing) throw new NotFoundException({ code: "CRM_CONTACT_NOT_FOUND", detail: "El contacto no existe o no es visible." });
          throw new ConflictException({
            code: "CRM_CONTACT_VERSION_CONFLICT",
            detail: "El contacto cambió desde la versión leída; vuelve a consultarlo antes de actualizarlo.",
          });
        }
        await this.audit.append(client, {
          tenantId: subject.tenantId, actorUserId: subject.actorId,
          actionKey: "crm.contacts.update", resourceType: "contact", resourceId: contact.id,
          purpose: subject.purpose, outcome: "allowed", correlationId: subject.correlationId, requestHash,
        });
        await this.repository.completeCommand(client, reservation.id, contact);
        return contact;
      },
    );
  }

  private assertPermission(subject: TenantAccessContext, permission: PermissionKey): void {
    if (!subject.permissionKeys.includes(permission)) {
      throw new ForbiddenException({ code: "CRM_CONTACT_PERMISSION_REQUIRED", detail: "No tienes permiso para esta operación CRM." });
    }
  }
  private assertContactId(contactId: string): void {
    if (!isContactUuid(contactId)) throw new BadRequestException({ code: "CRM_CONTACT_ID_INVALID", detail: "contactId debe ser UUID." });
  }
}

function mapValidationError(error: unknown): Error {
  if (error instanceof ContactValidationError) {
    return new BadRequestException({ code: error.code, detail: "Los datos del contacto no cumplen el contrato." });
  }
  return error instanceof Error ? error : new Error("CRM_CONTACT_VALIDATION_FAILED");
}
