import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import type { Response } from "express";
import { ContactController } from "./contact.controller.js";
import type { ContactService } from "../application/contact.service.js";
import type { ContactRecord } from "../domain/contact.js";
import { AuthorizationGuard, REQUIRED_TENANT_PERMISSION } from "../../../platform/identity/authorization/authorization.guard.js";
import { TenantContextGuard } from "../../../platform/identity/tenant-context.guard.js";
import {
  TENANT_ACCESS_PURPOSE,
  type TenantAuthenticatedRequest,
} from "../../../platform/identity/tenant-context.guard.js";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import { OidcOrApiClientGuard } from "../../../platform/developer/application/oidc-or-api-client.guard.js";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const subject = {
  actorId,
  tenantId,
  membershipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  membershipStatus: "active",
  authzVersion: 4,
  roleKeys: ["tenant_admin"],
  permissionKeys: ["crm.contacts.read", "crm.contacts.create", "crm.contacts.update"],
  entitlementKeys: [],
  locale: "es-EC",
  timezone: "America/Guayaquil",
  currency: "USD",
  purpose: "crm.contacts.read",
  correlationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
} as unknown as TenantAccessContext;

const request = (): TenantAuthenticatedRequest => ({
  tenantAccessContext: subject,
} as unknown as TenantAuthenticatedRequest);

const contact: ContactRecord = Object.freeze({
  id: contactId,
  tenantId,
  contactType: "person",
  displayName: "Ana María López",
  firstName: "Ana María",
  lastName: "López",
  status: "active",
  sourceType: "manual",
  sourceReference: null,
  sourceCapturedAt: null,
  version: 2,
  createdAt: "2026-11-08T10:00:00.000Z",
  updatedAt: "2026-11-08T10:05:00.000Z",
});

class ResponseDouble {
  readonly headers = new Map<string, string>();
  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }
}

function controller(service: Partial<ContactService> = {}): ContactController {
  return new ContactController(service as ContactService);
}

test("CRM routes declare OIDC/API-client, tenant context, purpose and exact RBAC permissions", () => {
  const reflector = Reflect as unknown as {
    getMetadata(key: string, target: object): unknown;
  };
  assert.deepEqual(reflector.getMetadata("__guards__", ContactController), [OidcOrApiClientGuard]);
  for (const handler of [
    ContactController.prototype.list,
    ContactController.prototype.create,
    ContactController.prototype.get,
    ContactController.prototype.update,
  ]) {
    assert.deepEqual(
      reflector.getMetadata("__guards__", handler),
      [TenantContextGuard, AuthorizationGuard],
      "Every CRM route must execute tenant-context resolution and RBAC authorization guards.",
    );
  }
  assert.equal(reflector.getMetadata(REQUIRED_TENANT_PERMISSION, ContactController.prototype.list), "crm.contacts.read");
  assert.equal(reflector.getMetadata(TENANT_ACCESS_PURPOSE, ContactController.prototype.list), "crm.contacts.read");
  assert.equal(reflector.getMetadata(REQUIRED_TENANT_PERMISSION, ContactController.prototype.create), "crm.contacts.create");
  assert.equal(reflector.getMetadata(TENANT_ACCESS_PURPOSE, ContactController.prototype.create), "crm.contacts.create");
  assert.equal(reflector.getMetadata(REQUIRED_TENANT_PERMISSION, ContactController.prototype.update), "crm.contacts.update");
  assert.equal(reflector.getMetadata(TENANT_ACCESS_PURPOSE, ContactController.prototype.update), "crm.contacts.update");
});

test("list passes tenant-scoped filters to the application service", async () => {
  let received: unknown;
  const sut = controller({
    list: async (receivedSubject, query) => {
      received = { receivedSubject, query };
      return { items: [contact], nextCursor: null };
    },
  });
  const result = await sut.list(tenantId, "Ana", "person", "active", "25", undefined, request());
  assert.deepEqual(result, { items: [contact], nextCursor: null });
  assert.deepEqual(received, {
    receivedSubject: subject,
    query: { query: "Ana", contactType: "person", status: "active", pageSize: "25", cursor: undefined },
  });
});

test("create emits an ETag from the persisted contact version", async () => {
  let receivedKey = "";
  const sut = controller({
    create: async (_subject, _body, key) => {
      receivedKey = key;
      return contact;
    },
  });
  const response = new ResponseDouble();
  const result = await sut.create(tenantId, "crm-create-idempotency-0001", { displayName: "Ana" }, request(), response as unknown as Response);
  assert.equal(result, contact);
  assert.equal(receivedKey, "crm-create-idempotency-0001");
  assert.equal(response.headers.get("etag"), '"contact-2"');
});

test("get emits the ETag for the tenant-scoped resource version", async () => {
  const sut = controller({ get: async () => contact });
  const response = new ResponseDouble();
  assert.equal(await sut.get(tenantId, contactId, request(), response as unknown as Response), contact);
  assert.equal(response.headers.get("etag"), '"contact-2"');
});

test("update parses If-Match, forwards the expected version and emits the new ETag", async () => {
  let expectedVersion = 0;
  let receivedKey = "";
  const sut = controller({
    update: async (_subject, _contactId, version, _body, key) => {
      expectedVersion = version;
      receivedKey = key;
      return contact;
    },
  });
  const response = new ResponseDouble();
  const result = await sut.update(
    tenantId, contactId, "crm-update-idempotency-0001", '"contact-1"',
    { displayName: "Ana María López" }, request(), response as unknown as Response,
  );
  assert.equal(result, contact);
  assert.equal(expectedVersion, 1);
  assert.equal(receivedKey, "crm-update-idempotency-0001");
  assert.equal(response.headers.get("etag"), '"contact-2"');
});

test("invalid If-Match and missing or mismatched tenant context fail closed", async () => {
  const sut = controller({
    get: async () => contact,
    update: async () => contact,
  });
  const response = new ResponseDouble();
  await assert.rejects(
    sut.update(tenantId, contactId, "crm-update-idempotency-0001", "W/\"contact-1\"", {}, request(), response as unknown as Response),
    error => error instanceof BadRequestException,
  );
  await assert.rejects(
    sut.get(tenantId, contactId, {} as TenantAuthenticatedRequest, response as unknown as Response),
    error => error instanceof InternalServerErrorException,
  );
  await assert.rejects(
    sut.get("ffffffff-ffff-4fff-8fff-ffffffffffff", contactId, request(), response as unknown as Response),
    error => error instanceof BadRequestException,
  );
});
