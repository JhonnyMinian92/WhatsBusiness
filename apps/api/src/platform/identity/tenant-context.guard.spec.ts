import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import type { IdentityService } from "./identity.service.js";
import {
  TenantAccessPurpose,
  TenantContextGuard,
  requireTenantAccessContext,
  TENANT_ACCESS_PURPOSE,
  type TenantAuthenticatedRequest,
} from "./tenant-context.guard.js";

const purpose = "platform.tenant.context.read";
const tenantId = randomUUID();
const correlationId = randomUUID();
const userId = randomUUID();
const membershipId = randomUUID();

function fixture(options: {
  readonly claims?: boolean;
  readonly tenantId?: string;
  readonly purpose?: string;
} = {}) {
  const request: TenantAuthenticatedRequest = {
    params: { tenantId: options.tenantId ?? tenantId },
    headers: { "x-correlation-id": correlationId },
    header(name: string) {
      const value = this.headers[name.toLowerCase()];
      return typeof value === "string" ? value : undefined;
    },
    ...(options.claims === false ? {} : {
      oidcClaims: {
        issuer: "https://issuer.synthetic.test",
        subject: "synthetic-subject",
        audience: ["whatsbusiness-web"],
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        displayName: "Synthetic User",
      },
    }),
  } as TenantAuthenticatedRequest;
  const responseHeaders = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      responseHeaders.set(name, value);
      return this;
    },
  };
  const handler = () => undefined;
  const execution = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
  return { request, responseHeaders, execution };
}

test("tenant guard resolves an immutable actor context and propagates correlation ID", async () => {
  const calls: unknown[][] = [];
  const identity = {
    async authorizeTenantAccess(...args: unknown[]) {
      calls.push(args);
      return {
        actorId: userId,
        tenantId,
        membershipId,
        membershipStatus: "active" as const,
        authzVersion: 7,
        roleKeys: ["tenant_admin"],
        permissionKeys: ["tenant.read"],
        entitlementKeys: ["inbox"],
        locale: "es-EC",
        timezone: "America/Guayaquil",
        currency: "USD",
        purpose,
        correlationId,
      };
    },
  };
  const reflector = {
    get(key: string) {
      return key === TENANT_ACCESS_PURPOSE ? purpose : undefined;
    },
  };
  const { request, responseHeaders, execution } = fixture();
  const guard = new TenantContextGuard(
    reflector as unknown as Reflector,
    identity as unknown as IdentityService,
  );

  assert.equal(await guard.canActivate(execution), true);
  assert.deepEqual(calls, [[request.oidcClaims, tenantId, purpose, correlationId]]);
  assert.equal(request.correlationId, correlationId);
  assert.equal(responseHeaders.get("X-Correlation-ID"), correlationId);

  const resolved = requireTenantAccessContext(request);
  assert.equal(resolved.actorId, userId);
  assert.equal(resolved.tenantId, tenantId);
  assert.equal(resolved.authzVersion, 7);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.roleKeys), true);
  assert.throws(() => (resolved.roleKeys as string[]).push("platform_owner"));
});

test("tenant guard rejects requests without a verified OIDC principal", async () => {
  const identity = { authorizeTenantAccess: async () => { throw new Error("must not be called"); } };
  const reflector = { get: () => purpose };
  const guard = new TenantContextGuard(
    reflector as unknown as Reflector,
    identity as unknown as IdentityService,
  );
  const { execution } = fixture({ claims: false });

  await assert.rejects(
    guard.canActivate(execution),
    (error: unknown) => error instanceof UnauthorizedException,
  );
});

test("tenant guard rejects malformed tenant IDs before querying authorization", async () => {
  const identity = { authorizeTenantAccess: async () => { throw new Error("must not be called"); } };
  const reflector = { get: () => purpose };
  const guard = new TenantContextGuard(
    reflector as unknown as Reflector,
    identity as unknown as IdentityService,
  );
  const { execution } = fixture({ tenantId: "not-a-uuid" });

  await assert.rejects(
    guard.canActivate(execution),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test("tenant guard fails closed when a route has no declared access purpose", async () => {
  const identity = { authorizeTenantAccess: async () => { throw new Error("must not be called"); } };
  const reflector = { get: () => undefined };
  const guard = new TenantContextGuard(
    reflector as unknown as Reflector,
    identity as unknown as IdentityService,
  );
  const { execution } = fixture();

  await assert.rejects(
    guard.canActivate(execution),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

test("tenant access purpose decorator rejects unstable or malformed identifiers", () => {
  assert.doesNotThrow(() => TenantAccessPurpose(purpose));
  assert.throws(() => TenantAccessPurpose("read"));
  assert.throws(() => TenantAccessPurpose("platform..read"));
});
