import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import type { PermissionKey } from "../../../platform/identity/authorization/permission-catalog.js";
import type { DatabaseService } from "../../../platform/database/database.module.js";
import type { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type {
  MessageTemplateRecord,
  MessageTemplateRevision,
  PostgresMessageTemplateRepository,
  TemplateCommandReservation,
} from "../infrastructure/postgres-message-template.repository.js";
import { MessageTemplateService } from "./message-template.service.js";

const tenantId = randomUUID();
const actorId = randomUUID();
const correlationId = randomUUID();
const definition = {
  name: "appointment_reminder",
  language: "es_EC",
  category: "UTILITY",
  parameterFormat: "POSITIONAL",
  components: [
    { type: "BODY", text: "Hola {{1}}, tu cita es el {{2}}." },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Confirmar" }] },
  ],
};

function makeSubject(permissionKeys: PermissionKey[] = [
  "whatsapp.templates.read", "whatsapp.templates.create",
  "whatsapp.templates.update", "whatsapp.templates.delete",
]): TenantAccessContext {
  return {
    actorId, tenantId, membershipId: randomUUID(), membershipStatus: "active",
    authzVersion: 1, roleKeys: ["tenant_admin"], permissionKeys, entitlementKeys: [],
    locale: "es-EC", timezone: "America/Guayaquil", currency: "USD",
    purpose: "whatsapp.templates.manage", correlationId,
  };
}

function createFixture() {
  const records = new Map<string, MessageTemplateRecord>();
  const revisions: MessageTemplateRevision[] = [];
  const commands = new Map<string, {
    readonly id: string;
    readonly requestHash: string;
    response: MessageTemplateRecord | null;
  }>();
  const audits: unknown[] = [];
  let databaseCalls = 0;

  const repository = {
    list: async (_client: unknown, _tenant: string) => [...records.values()],
    findById: async (_client: unknown, tenant: string, id: string) => {
      const record = records.get(id);
      return record?.tenantId === tenant ? record : null;
    },
    reserveCommand: async (_client: unknown, input: {
      tenantId: string; actorId: string; operation: string; idempotencyKey: string; requestHash: string;
    }): Promise<TemplateCommandReservation> => {
      const key = [input.tenantId, input.actorId, input.operation, input.idempotencyKey].join(":");
      const existing = commands.get(key);
      if (existing) {
        return {
          id: existing.id, kind: "existing",
          requestHash: existing.requestHash, response: existing.response,
        };
      }
      const command: {
        id: string; requestHash: string; response: MessageTemplateRecord | null;
      } = { id: randomUUID(), requestHash: input.requestHash, response: null };
      commands.set(key, command);
      return { id: command.id, kind: "reserved", requestHash: input.requestHash, response: null };
    },
    createDraft: async (_client: unknown, tenant: string, actor: string, item: typeof definition) => {
      const now = new Date().toISOString();
      const record: MessageTemplateRecord = Object.freeze({
        id: randomUUID(), tenantId: tenant, name: item.name, language: item.language,
        category: item.category as "UTILITY", parameterFormat: "POSITIONAL",
        components: item.components as unknown as MessageTemplateRecord["components"],
        lifecycleState: "draft", metaTemplateId: null, metaStatus: null, qualityScore: null,
        qualityReason: null, version: 1, createdBy: actor, updatedBy: actor, createdAt: now, updatedAt: now,
      });
      records.set(record.id, record);
      revisions.push({
        id: randomUUID(), templateId: record.id, revisionNumber: 1, changeType: "created",
        snapshot: record, actorUserId: actor, createdAt: now,
      });
      return record;
    },
    updateDraft: async (_client: unknown, tenant: string, actor: string, id: string, expected: number, item: typeof definition) => {
      const current = records.get(id);
      if (!current || current.tenantId !== tenant || current.version !== expected || current.lifecycleState !== "draft") return null;
      const record: MessageTemplateRecord = Object.freeze({
        ...current, name: item.name, language: item.language, category: item.category as "UTILITY",
        parameterFormat: "POSITIONAL", components: item.components as unknown as MessageTemplateRecord["components"],
        version: current.version + 1, updatedBy: actor, updatedAt: new Date().toISOString(),
      });
      records.set(id, record);
      revisions.push({
        id: randomUUID(), templateId: record.id, revisionNumber: record.version, changeType: "updated",
        snapshot: record, actorUserId: actor, createdAt: record.updatedAt,
      });
      return record;
    },
    archiveDraft: async (_client: unknown, tenant: string, actor: string, id: string, expected: number) => {
      const current = records.get(id);
      if (!current || current.tenantId !== tenant || current.version !== expected || current.lifecycleState !== "draft") return null;
      const now = new Date().toISOString();
      const record: MessageTemplateRecord = Object.freeze({
        ...current, lifecycleState: "archived", version: current.version + 1, updatedBy: actor, updatedAt: now,
      });
      records.set(id, record);
      revisions.push({
        id: randomUUID(), templateId: record.id, revisionNumber: record.version, changeType: "archived",
        snapshot: record, actorUserId: actor, createdAt: now,
      });
      return record;
    },
    listRevisions: async (_client: unknown, _tenant: string, id: string) =>
      revisions.filter(revision => revision.templateId === id).sort((a, b) => b.revisionNumber - a.revisionNumber),
    completeCommand: async (_client: unknown, id: string, record: MessageTemplateRecord) => {
      for (const command of commands.values()) if (command.id === id) command.response = record;
    },
  };

  const database = {
    withTenantContextAtVersion: async (
      _actor: string, _tenant: string, _version: number, work: (client: unknown) => Promise<unknown>,
    ) => {
      databaseCalls += 1;
      return work({});
    },
  };
  const audit = { append: async (_client: unknown, event: unknown) => { audits.push(event); } };
  const service = new MessageTemplateService(
    database as unknown as DatabaseService,
    repository as unknown as PostgresMessageTemplateRepository,
    audit as unknown as AppendOnlyAuditRepository,
  );

  return { service, records, revisions, audits, getDatabaseCalls: () => databaseCalls };
}

test("creates a tenant template draft and replays idempotently without duplicate history or audit", async () => {
  const fixture = createFixture();
  const subject = makeSubject();
  const key = "template-create-" + randomUUID();
  const created = await fixture.service.createDraft(subject, definition, key);
  const replayed = await fixture.service.createDraft(subject, definition, key);
  assert.deepEqual(replayed, created);
  assert.equal(fixture.records.size, 1);
  assert.equal(fixture.revisions.length, 1);
  assert.equal(fixture.audits.length, 1);
});

test("requires tenant permission before database access", async () => {
  const fixture = createFixture();
  await assert.rejects(
    fixture.service.createDraft(makeSubject(["whatsapp.templates.read"]), definition, "template-create-" + randomUUID()),
    error => error instanceof ForbiddenException,
  );
  assert.equal(fixture.getDatabaseCalls(), 0);
  assert.equal(fixture.audits.length, 0);
});

test("rejects reusing an idempotency key for another normalized command", async () => {
  const fixture = createFixture();
  const subject = makeSubject();
  const key = "template-create-" + randomUUID();
  await fixture.service.createDraft(subject, definition, key);
  await assert.rejects(
    fixture.service.createDraft(subject, { ...definition, name: "different_template" }, key),
    error => error instanceof ConflictException
      && (error.getResponse() as { code?: string }).code === "WHATSAPP_TEMPLATE_IDEMPOTENCY_KEY_REUSED",
  );
});

test("updates with optimistic concurrency and preserves immutable revisions", async () => {
  const fixture = createFixture();
  const subject = makeSubject();
  const created = await fixture.service.createDraft(subject, definition, "template-create-" + randomUUID());
  const updated = await fixture.service.updateDraft(
    subject, created.id, 1,
    { ...definition, components: [{ type: "BODY", text: "Hola {{1}}, tu cita cambió al {{2}}." }] },
    "template-update-" + randomUUID(),
  );
  assert.equal(updated.version, 2);
  assert.equal(fixture.revisions.length, 2);
  assert.deepEqual(fixture.revisions.map(revision => revision.revisionNumber), [1, 2]);
  await assert.rejects(
    fixture.service.updateDraft(subject, created.id, 1, definition, "template-update-stale-" + randomUUID()),
    error => error instanceof ConflictException
      && (error.getResponse() as { code?: string }).code === "WHATSAPP_TEMPLATE_VERSION_CONFLICT",
  );
});

test("previews locally and reports a missing variable as a validation error", async () => {
  const fixture = createFixture();
  const subject = makeSubject();
  const created = await fixture.service.createDraft(subject, definition, "template-create-" + randomUUID());
  const preview = await fixture.service.preview(subject, created.id, { "1": "Ana", "2": "10 de noviembre" });
  assert.match(preview.text, /Ana/);
  await assert.rejects(
    fixture.service.preview(subject, created.id, { "1": "Ana" }),
    error => error instanceof BadRequestException
      && (error.getResponse() as { code?: string }).code === "WHATSAPP_TEMPLATE_PREVIEW_VARIABLE_REQUIRED",
  );
});
