import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type { PermissionKey } from "../../../platform/identity/authorization/permission-catalog.js";
import { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import { DatabaseService } from "../../../platform/database/database.module.js";
import {
  parseMessageTemplateDefinition,
  previewMessageTemplate,
  TemplateValidationError,
  type MessageTemplateDefinition,
  type TemplateCategory,
  type TemplateMetaStatus,
} from "../domain/message-template.js";
import {
  assertSameTemplateCommand,
  assertTemplateIdempotencyKey,
  hashTemplateCommand,
} from "./message-template-command-support.js";
import {
  PostgresMessageTemplateRepository,
  type MessageTemplateRecord,
  type MessageTemplateRevision,
  type TemplateLifecycleState,
  type TemplateListFilters,
} from "../infrastructure/postgres-message-template.repository.js";

export type MessageTemplateSubject = Pick<
  TenantAccessContext,
  "actorId" | "tenantId" | "authzVersion" | "permissionKeys" | "purpose" | "correlationId"
>;

export interface MessageTemplateListInput {
  readonly category?: string;
  readonly language?: string;
  readonly lifecycleState?: string;
  readonly metaStatus?: string;
  readonly pageSize?: string;
}

export interface MessageTemplatePage {
  readonly items: readonly MessageTemplateRecord[];
}

const TEMPLATE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES: readonly TemplateCategory[] = ["AUTHENTICATION", "MARKETING", "UTILITY"];
const META_STATUSES: readonly TemplateMetaStatus[] = [
  "APPROVED", "ARCHIVED", "DELETED", "DISABLED", "IN_APPEAL",
  "LIMIT_EXCEEDED", "PAUSED", "PENDING", "PENDING_DELETION", "REJECTED",
];

@Injectable()
export class MessageTemplateService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: PostgresMessageTemplateRepository,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  async list(subject: MessageTemplateSubject, input: MessageTemplateListInput): Promise<MessageTemplatePage> {
    this.assertPermission(subject, "whatsapp.templates.read");
    const filters = parseListFilters(input);
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async client => Object.freeze({
        items: await this.repository.list(client, subject.tenantId, filters),
      }),
    );
  }

  async get(subject: MessageTemplateSubject, templateId: string): Promise<MessageTemplateRecord> {
    this.assertPermission(subject, "whatsapp.templates.read");
    this.assertTemplateId(templateId);
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async client => {
        const record = await this.repository.findById(client, subject.tenantId, templateId);
        if (!record) throw notFound();
        return record;
      },
    );
  }

  async createDraft(
    subject: MessageTemplateSubject,
    input: unknown,
    idempotencyKey: string,
  ): Promise<MessageTemplateRecord> {
    this.assertPermission(subject, "whatsapp.templates.create");
    const definition = parseDefinition(input);
    assertTemplateIdempotencyKey(idempotencyKey);
    const requestHash = hashTemplateCommand({ operation: "create", definition });

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async client => {
        const reservation = await this.repository.reserveCommand(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          operation: "create",
          idempotencyKey,
          requestHash,
        });
        if (reservation.kind === "existing") {
          assertSameTemplateCommand(reservation.requestHash, requestHash);
          if (!reservation.response) throw new ConflictException({ code: "WHATSAPP_TEMPLATE_IDEMPOTENCY_INCOMPLETE" });
          return reservation.response;
        }

        const record = await this.repository.createDraft(client, subject.tenantId, subject.actorId, definition);
        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: "whatsapp.templates.create",
          resourceType: "whatsapp_template",
          resourceId: record.id,
          purpose: subject.purpose,
          outcome: "allowed",
          correlationId: subject.correlationId,
          requestHash,
        });
        await this.repository.completeCommand(client, reservation.id, record);
        return record;
      },
    );
  }

  async updateDraft(
    subject: MessageTemplateSubject,
    templateId: string,
    expectedVersion: number,
    input: unknown,
    idempotencyKey: string,
  ): Promise<MessageTemplateRecord> {
    this.assertPermission(subject, "whatsapp.templates.update");
    this.assertTemplateId(templateId);
    this.assertExpectedVersion(expectedVersion);
    const definition = parseDefinition(input);
    assertTemplateIdempotencyKey(idempotencyKey);
    const requestHash = hashTemplateCommand({ operation: "update", templateId, expectedVersion, definition });

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async client => {
        const reservation = await this.repository.reserveCommand(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          operation: "update",
          idempotencyKey,
          requestHash,
        });
        if (reservation.kind === "existing") {
          assertSameTemplateCommand(reservation.requestHash, requestHash);
          if (!reservation.response) throw new ConflictException({ code: "WHATSAPP_TEMPLATE_IDEMPOTENCY_INCOMPLETE" });
          return reservation.response;
        }

        const updated = await this.repository.updateDraft(
          client, subject.tenantId, subject.actorId, templateId, expectedVersion, definition,
        );
        if (!updated) await this.throwMutationFailure(client, subject.tenantId, templateId);
        const record = updated as MessageTemplateRecord;
        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: "whatsapp.templates.update",
          resourceType: "whatsapp_template",
          resourceId: record.id,
          purpose: subject.purpose,
          outcome: "allowed",
          correlationId: subject.correlationId,
          requestHash,
        });
        await this.repository.completeCommand(client, reservation.id, record);
        return record;
      },
    );
  }

  /**
   * Removes a local draft from active work without deleting audit/revision history.
   * This deliberately does not delete a template from Meta.
   */
  async archiveDraft(
    subject: MessageTemplateSubject,
    templateId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<MessageTemplateRecord> {
    this.assertPermission(subject, "whatsapp.templates.delete");
    this.assertTemplateId(templateId);
    this.assertExpectedVersion(expectedVersion);
    assertTemplateIdempotencyKey(idempotencyKey);
    const requestHash = hashTemplateCommand({ operation: "archive", templateId, expectedVersion });

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async client => {
        const reservation = await this.repository.reserveCommand(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          operation: "archive",
          idempotencyKey,
          requestHash,
        });
        if (reservation.kind === "existing") {
          assertSameTemplateCommand(reservation.requestHash, requestHash);
          if (!reservation.response) throw new ConflictException({ code: "WHATSAPP_TEMPLATE_IDEMPOTENCY_INCOMPLETE" });
          return reservation.response;
        }

        const archived = await this.repository.archiveDraft(
          client, subject.tenantId, subject.actorId, templateId, expectedVersion,
        );
        if (!archived) await this.throwMutationFailure(client, subject.tenantId, templateId);
        const record = archived as MessageTemplateRecord;
        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: "whatsapp.templates.archive",
          resourceType: "whatsapp_template",
          resourceId: record.id,
          purpose: subject.purpose,
          outcome: "allowed",
          correlationId: subject.correlationId,
          requestHash,
        });
        await this.repository.completeCommand(client, reservation.id, record);
        return record;
      },
    );
  }

  async listRevisions(
    subject: MessageTemplateSubject,
    templateId: string,
    pageSize = 50,
  ): Promise<readonly MessageTemplateRevision[]> {
    this.assertPermission(subject, "whatsapp.templates.read");
    this.assertTemplateId(templateId);
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException({ code: "WHATSAPP_TEMPLATE_REVISION_PAGE_SIZE_INVALID" });
    }
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async client => {
        const template = await this.repository.findById(client, subject.tenantId, templateId);
        if (!template) throw notFound();
        return this.repository.listRevisions(client, subject.tenantId, templateId, pageSize);
      },
    );
  }

  async preview(
    subject: MessageTemplateSubject,
    templateId: string,
    variableValues: unknown,
  ) {
    this.assertPermission(subject, "whatsapp.templates.read");
    this.assertTemplateId(templateId);
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async client => {
        const template = await this.repository.findById(client, subject.tenantId, templateId);
        if (!template) throw notFound();
        const definition: MessageTemplateDefinition = {
          name: template.name,
          language: template.language,
          category: template.category,
          parameterFormat: template.parameterFormat,
          components: template.components,
        };
        try {
          return previewMessageTemplate(definition, variableValues);
        } catch (error) {
          if (error instanceof TemplateValidationError) {
            throw new BadRequestException({ code: error.code, field: error.field });
          }
          throw error;
        }
      },
    );
  }

  private async throwMutationFailure(
    client: PoolClient,
    tenantId: string,
    templateId: string,
  ): Promise<never> {
    const existing = await this.repository.findById(client, tenantId, templateId);
    if (!existing) throw notFound();
    if (existing.lifecycleState !== "draft" || existing.metaTemplateId !== null) {
      throw new ConflictException({
        code: "WHATSAPP_TEMPLATE_REMOTE_MUTATION_REQUIRES_META_CAPABILITY",
        detail: "La plantilla vinculada a Meta requiere una capacidad verificada y un adapter autorizado.",
      });
    }
    throw new ConflictException({
      code: "WHATSAPP_TEMPLATE_VERSION_CONFLICT",
      detail: "La plantilla cambió desde la versión leída; vuelve a consultarla antes de modificarla.",
    });
  }

  private assertPermission(subject: MessageTemplateSubject, permission: PermissionKey): void {
    if (!subject.permissionKeys.includes(permission)) {
      throw new ForbiddenException({
        code: "WHATSAPP_TEMPLATE_PERMISSION_REQUIRED",
        detail: "No tienes permiso para administrar plantillas de WhatsApp.",
      });
    }
  }

  private assertTemplateId(templateId: string): void {
    if (!TEMPLATE_ID.test(templateId)) throw new BadRequestException({ code: "WHATSAPP_TEMPLATE_ID_INVALID" });
  }

  private assertExpectedVersion(expectedVersion: number): void {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new BadRequestException({ code: "WHATSAPP_TEMPLATE_VERSION_INVALID" });
    }
  }
}

function parseDefinition(input: unknown): MessageTemplateDefinition {
  try {
    return parseMessageTemplateDefinition(input);
  } catch (error) {
    if (error instanceof TemplateValidationError) {
      throw new BadRequestException({ code: error.code, field: error.field });
    }
    throw error;
  }
}

function parseListFilters(input: MessageTemplateListInput): TemplateListFilters {
  const limit = input.pageSize === undefined ? 50 : Number(input.pageSize);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new BadRequestException({ code: "WHATSAPP_TEMPLATE_PAGE_SIZE_INVALID" });
  }

  let category: TemplateCategory | undefined;
  if (input.category !== undefined) {
    if (!CATEGORIES.includes(input.category as TemplateCategory)) {
      throw new BadRequestException({ code: "WHATSAPP_TEMPLATE_CATEGORY_INVALID" });
    }
    category = input.category as TemplateCategory;
  }

  let lifecycleState: TemplateLifecycleState | undefined;
  if (input.lifecycleState !== undefined) {
    if (input.lifecycleState !== "draft" && input.lifecycleState !== "archived") {
      throw new BadRequestException({ code: "WHATSAPP_TEMPLATE_LIFECYCLE_STATE_INVALID" });
    }
    lifecycleState = input.lifecycleState as TemplateLifecycleState;
  }

  let metaStatus: TemplateMetaStatus | undefined;
  if (input.metaStatus !== undefined) {
    if (!META_STATUSES.includes(input.metaStatus as TemplateMetaStatus)) {
      throw new BadRequestException({ code: "WHATSAPP_TEMPLATE_META_STATUS_INVALID" });
    }
    metaStatus = input.metaStatus as TemplateMetaStatus;
  }

  if (input.language !== undefined && !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(input.language)) {
    throw new BadRequestException({ code: "WHATSAPP_TEMPLATE_LANGUAGE_INVALID" });
  }

  return Object.freeze({
    ...(category ? { category } : {}),
    ...(input.language ? { language: input.language } : {}),
    ...(lifecycleState ? { lifecycleState } : {}),
    ...(metaStatus ? { metaStatus } : {}),
    limit,
  });
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: "WHATSAPP_TEMPLATE_NOT_FOUND",
    detail: "La plantilla no existe o no es visible para este tenant.",
  });
}
