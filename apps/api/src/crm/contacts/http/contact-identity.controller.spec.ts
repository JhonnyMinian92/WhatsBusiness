import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { ContactIdentityController } from "./contact-identity.controller.js";
import type { ContactIdentityService } from "../application/contact-identity.service.js";
import type { ContactIdentityPage, ContactIdentityRecord } from "../domain/contact-identity.js";
import { AuthorizationGuard, REQUIRED_TENANT_PERMISSION } from "../../../platform/identity/authorization/authorization.guard.js";
import { TenantContextGuard, TENANT_ACCESS_PURPOSE, type TenantAuthenticatedRequest } from "../../../platform/identity/tenant-context.guard.js";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import { OidcOrApiClientGuard } from "../../../platform/developer/application/oidc-or-api-client.guard.js";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const subject = {
  actorId, tenantId, membershipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  membershipStatus: "active", authzVersion: 4, roleKeys: ["tenant_admin"],
  permissionKeys: ["crm.contacts.identities.read", "crm.contacts.identities.link"],
  entitlementKeys: [], locale: "es-EC", timezone: "America/Guayaquil", currency: "USD",
  purpose: "crm.contacts.identities.read", correlationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
} as unknown as TenantAccessContext;
const request = (): TenantAuthenticatedRequest => ({ tenantAccessContext: subject } as unknown as TenantAuthenticatedRequest);
const identity: ContactIdentityRecord = Object.freeze({
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff", tenantId, contactId,
  provider: "meta", product: "whatsapp", channel: "whatsapp", identifierType: "bsuid",
  externalId: "123456789", sourceType: "api", sourceReference: null,
  observedAt: "2026-11-08T12:00:00.000Z", verifiedAt: null, confidence: null,
  visibility: "tenant_only", createdAt: "2026-11-08T12:00:00.000Z",
});
function controller(service: Partial<ContactIdentityService> = {}): ContactIdentityController {
  return new ContactIdentityController(service as ContactIdentityService);
}

test("identity routes require OIDC, tenant context, declared purpose and exact RBAC", () => {
  const reflector = Reflect as unknown as { getMetadata(key: string, target: object): unknown };
  assert.deepEqual(reflector.getMetadata("__guards__", ContactIdentityController), [OidcOrApiClientGuard]);
  for (const handler of [ContactIdentityController.prototype.list, ContactIdentityController.prototype.link]) {
    assert.deepEqual(reflector.getMetadata("__guards__", handler), [TenantContextGuard, AuthorizationGuard]);
  }
  assert.equal(reflector.getMetadata(REQUIRED_TENANT_PERMISSION, ContactIdentityController.prototype.list), "crm.contacts.identities.read");
  assert.equal(reflector.getMetadata(TENANT_ACCESS_PURPOSE, ContactIdentityController.prototype.list), "crm.contacts.identities.read");
  assert.equal(reflector.getMetadata(REQUIRED_TENANT_PERMISSION, ContactIdentityController.prototype.link), "crm.contacts.identities.link");
  assert.equal(reflector.getMetadata(TENANT_ACCESS_PURPOSE, ContactIdentityController.prototype.link), "crm.contacts.identities.link");
});

test("list forwards the authorized tenant, contact and stable pagination query", async () => {
  const expected: ContactIdentityPage = { items: [identity], nextCursor: null };
  let received: unknown;
  const sut = controller({
    list: async (receivedSubject, receivedContactId, query) => {
      received = { receivedSubject, receivedContactId, query };
      return expected;
    },
  });
  assert.deepEqual(await sut.list(tenantId, contactId, "25", undefined, request()), expected);
  assert.deepEqual(received, {
    receivedSubject: subject, receivedContactId: contactId, query: { pageSize: "25", cursor: undefined },
  });
});

test("link forwards the idempotency key and rejects route tenant/context mismatch", async () => {
  let received: unknown;
  const sut = controller({
    link: async (receivedSubject, receivedContactId, body, key) => {
      received = { receivedSubject, receivedContactId, body, key };
      return identity;
    },
  });
  const body = {
    provider: "meta", product: "whatsapp", channel: "whatsapp",
    identifierType: "bsuid", externalId: "123456789",
  };
  assert.deepEqual(await sut.link(tenantId, contactId, "identity-link-0000001", body, request()), identity);
  assert.deepEqual(received, {
    receivedSubject: subject, receivedContactId: contactId, body, key: "identity-link-0000001",
  });
  assert.throws(
    () => sut.list("ffffffff-ffff-4fff-8fff-ffffffffffff", contactId, undefined, undefined, request()),
    error => error instanceof BadRequestException,
  );
  assert.throws(
    () => sut.list(tenantId, contactId, undefined, undefined, {} as TenantAuthenticatedRequest),
    error => error instanceof InternalServerErrorException,
  );
});
