import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import type { TenantAccessContext } from "../tenant-access-context.js";
import type { TenantAuthenticatedRequest } from "../tenant-context.guard.js";
import { AuthorizationService } from "./authorization.service.js";
import {
  AuthorizationGuard,
  RequirePermission,
  REQUIRED_TENANT_PERMISSION,
} from "./authorization.guard.js";
import { TenantAuthorizationPolicyEvaluator } from "./tenant-authorization-policy.js";

const actorId = randomUUID();
const tenantId = randomUUID();

function requestContext(overrides: Partial<TenantAccessContext> = {}): TenantAccessContext {
  return {
    actorId,
    tenantId,
    membershipId: randomUUID(),
    membershipStatus: "active",
    authzVersion: 2,
    roleKeys: ["agent"],
    permissionKeys: ["inbox.conversations.reply"],
    entitlementKeys: ["inbox"],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose: "inbox.conversation.reply",
    correlationId: randomUUID(),
    ...overrides,
  };
}

function executionFixture(permission?: string, context?: TenantAccessContext) {
  const handler = () => undefined;
  const request: TenantAuthenticatedRequest = {
    params: { tenantId },
    headers: {},
    tenantAccessContext: context ?? requestContext(),
  } as TenantAuthenticatedRequest;
  const reflector = {
    get(key: string) {
      return key === REQUIRED_TENANT_PERMISSION ? permission : undefined;
    },
  };
  const execution = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
  return { execution, reflector };
}

test("authorization guard allows a required permission granted to the active tenant context", () => {
  const fixture = executionFixture("inbox.conversations.reply");
  const guard = new AuthorizationGuard(
    fixture.reflector as unknown as Reflector,
    new AuthorizationService(new TenantAuthorizationPolicyEvaluator()),
  );
  assert.equal(guard.canActivate(fixture.execution), true);
});

test("authorization guard denies a route with no permission declaration", () => {
  const fixture = executionFixture();
  const guard = new AuthorizationGuard(
    fixture.reflector as unknown as Reflector,
    new AuthorizationService(new TenantAuthorizationPolicyEvaluator()),
  );
  assert.throws(
    () => guard.canActivate(fixture.execution),
    (error: unknown) => error instanceof ForbiddenException
      && (error.getResponse() as { code?: string }).code === "TENANT_PERMISSION_REQUIRED",
  );
});

test("authorization guard denies when the actor lacks the declared permission", () => {
  const fixture = executionFixture("ads.publish.request");
  const guard = new AuthorizationGuard(
    fixture.reflector as unknown as Reflector,
    new AuthorizationService(new TenantAuthorizationPolicyEvaluator()),
  );
  assert.throws(
    () => guard.canActivate(fixture.execution),
    (error: unknown) => error instanceof ForbiddenException
      && (error.getResponse() as { code?: string; reason?: string }).code === "AUTHORIZATION_DENIED"
      && (error.getResponse() as { reason?: string }).reason === "PERMISSION_NOT_GRANTED",
  );
});

test("RequirePermission decorator rejects permission keys outside the catalog", () => {
  assert.doesNotThrow(() => RequirePermission("tenant.read"));
  assert.throws(() => RequirePermission("platform.root" as never));
});
