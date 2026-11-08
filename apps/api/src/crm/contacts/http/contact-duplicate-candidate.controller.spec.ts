import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { ContactDuplicateCandidateController } from "./contact-duplicate-candidate.controller.js";
import type { ContactDuplicateCandidateService } from "../application/contact-duplicate-candidate.service.js";
import { AuthorizationGuard, REQUIRED_TENANT_PERMISSION } from "../../../platform/identity/authorization/authorization.guard.js";
import { TenantContextGuard, TENANT_ACCESS_PURPOSE, type TenantAuthenticatedRequest } from "../../../platform/identity/tenant-context.guard.js";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import { OidcOrApiClientGuard } from "../../../platform/developer/application/oidc-or-api-client.guard.js";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceContactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const subject = {
  actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  tenantId,
  membershipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  membershipStatus: "active",
  authzVersion: 4,
  roleKeys: ["tenant_admin"],
  permissionKeys: ["crm.contacts.identities.read"],
  entitlementKeys: [],
  locale: "es-EC", timezone: "America/Guayaquil", currency: "USD",
  purpose: "crm.contacts.identities.read",
  correlationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
} as unknown as TenantAccessContext;
const request = (): TenantAuthenticatedRequest => ({
  tenantAccessContext: subject,
} as unknown as TenantAuthenticatedRequest);

function controller(service: Partial<ContactDuplicateCandidateService> = {}): ContactDuplicateCandidateController {
  return new ContactDuplicateCandidateController(service as ContactDuplicateCandidateService);
}

test("candidate route requires OIDC, tenant context and sensitive identity-read permission", () => {
  const reflector = Reflect as unknown as { getMetadata(key: string, target: object): unknown };
  assert.deepEqual(reflector.getMetadata("__guards__", ContactDuplicateCandidateController), [OidcOrApiClientGuard]);
  assert.deepEqual(reflector.getMetadata("__guards__", ContactDuplicateCandidateController.prototype.findCandidates), [
    TenantContextGuard, AuthorizationGuard,
  ]);
  assert.equal(
    reflector.getMetadata(REQUIRED_TENANT_PERMISSION, ContactDuplicateCandidateController.prototype.findCandidates),
    "crm.contacts.identities.read",
  );
  assert.equal(
    reflector.getMetadata(TENANT_ACCESS_PURPOSE, ContactDuplicateCandidateController.prototype.findCandidates),
    "crm.contacts.identities.read",
  );
});

test("forwards the authorized subject and query and fails closed on missing/mismatched context", async () => {
  let received: unknown;
  const expected = { items: [] };
  const sut = controller({
    findCandidates: async (receivedSubject, body) => {
      received = { receivedSubject, body };
      return expected;
    },
  });
  const body = { sourceContactId, limit: 10 };
  assert.deepEqual(await sut.findCandidates(tenantId, body, request()), expected);
  assert.deepEqual(received, { receivedSubject: subject, body });
  assert.throws(
    () => sut.findCandidates("ffffffff-ffff-4fff-8fff-ffffffffffff", body, request()),
    error => error instanceof BadRequestException,
  );
  assert.throws(
    () => sut.findCandidates(tenantId, body, {} as TenantAuthenticatedRequest),
    error => error instanceof InternalServerErrorException,
  );
});
