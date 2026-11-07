import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import test from "node:test";
import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { OidcJwtVerifier } from "./oidc-auth.guard.js";
import { IdentityRepository } from "./identity.repository.js";
import { IdentityService } from "./identity.service.js";
import { DatabaseService } from "../database/database.module.js";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function tokenFor(privateKey: KeyObject, payload: Record<string, unknown>): string {
  const header = encode({ alg: "RS256", typ: "JWT", kid: "synthetic-rsa-key" });
  const claims = encode(payload);
  const signedValue = header + "." + claims;
  const signature = sign("RSA-SHA256", Buffer.from(signedValue), privateKey).toString("base64url");
  return signedValue + "." + signature;
}

test("OIDC verifier validates RSA signature, issuer, audience, expiry and not-before", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicExponent: 0x10001 });
  const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "synthetic-rsa-key", use: "sig", alg: "RS256" };
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const rawAddress = server.address();
  if (!rawAddress || typeof rawAddress === "string") {
    throw new Error("Synthetic JWKS server did not bind a TCP port");
  }
  const address = rawAddress as AddressInfo;
  const previous = {
    nodeEnv: process.env["NODE_ENV"],
    issuer: process.env["OIDC_ISSUER"],
    audience: process.env["OIDC_AUDIENCE"],
    jwks: process.env["OIDC_JWKS_URI"],
  };
  process.env["NODE_ENV"] = "test";
  process.env["OIDC_ISSUER"] = "http://issuer.synthetic.test/realms/whatsbusiness";
  process.env["OIDC_AUDIENCE"] = "whatsbusiness-web";
  process.env["OIDC_JWKS_URI"] = "http://127.0.0.1:" + address.port + "/jwks";

  try {
    const verifier = new OidcJwtVerifier();
    const claims = {
      iss: process.env["OIDC_ISSUER"],
      sub: "synthetic-user-01",
      aud: "whatsbusiness-web",
      exp: Math.floor(Date.now() / 1000) + 300,
      name: "Synthetic User",
    };
    const verified = await verifier.verify(tokenFor(privateKey, claims));
    assert.equal(verified.subject, "synthetic-user-01");
    assert.equal(verified.displayName, "Synthetic User");

    for (const rejected of [
      { ...claims, iss: "http://attacker.synthetic.test" },
      { ...claims, aud: "other-client" },
      { ...claims, exp: Math.floor(Date.now() / 1000) - 5 },
      { ...claims, nbf: Math.floor(Date.now() / 1000) + 300 },
    ]) {
      await assert.rejects(
        verifier.verify(tokenFor(privateKey, rejected)),
        (error: unknown) => error instanceof UnauthorizedException,
      );
    }

    const parts = tokenFor(privateKey, claims).split(".");
    const signature = Buffer.from(parts[2], "base64url");
    signature[0] ^= 0xff;
    await assert.rejects(
      verifier.verify(parts[0] + "." + parts[1] + "." + signature.toString("base64url")),
      (error: unknown) => error instanceof UnauthorizedException,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previous.nodeEnv === undefined) delete process.env["NODE_ENV"]; else process.env["NODE_ENV"] = previous.nodeEnv;
    if (previous.issuer === undefined) delete process.env["OIDC_ISSUER"]; else process.env["OIDC_ISSUER"] = previous.issuer;
    if (previous.audience === undefined) delete process.env["OIDC_AUDIENCE"]; else process.env["OIDC_AUDIENCE"] = previous.audience;
    if (previous.jwks === undefined) delete process.env["OIDC_JWKS_URI"]; else process.env["OIDC_JWKS_URI"] = previous.jwks;
  }
});

const runtimeUrl = process.env["DATABASE_URL"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];

test("PostgreSQL RLS isolates tenants and clears SET LOCAL context on a reused connection", {
  skip: !runtimeUrl || !migrationUrl,
}, async () => {
  const adminPool = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 1 });
  const database = new DatabaseService(runtimePool);
  const identity = new IdentityService(new IdentityRepository(database));
  const organizationId = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const issuer = "https://issuer.synthetic.test/realms/whatsbusiness";

  try {
    const role = await runtimePool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    assert.equal(role.rows[0]?.rolsuper, false);
    assert.equal(role.rows[0]?.rolbypassrls, false);

    await adminPool.query(
      "INSERT INTO platform.organizations (id, organization_type, name) VALUES ($1, 'customer', 'Synthetic isolation test')",
      [organizationId],
    );
    await adminPool.query([
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status)",
      "VALUES ($1, $2, 'subject-a', 'Synthetic A', 'active'),",
      "       ($3, $2, 'subject-b', 'Synthetic B', 'active')",
    ].join("\n"), [userA, issuer, userB]);
    await adminPool.query([
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status)",
      "VALUES ($1, $2, 'tenant-a', 'Synthetic Tenant A', 'active'),",
      "       ($3, $2, 'tenant-b', 'Synthetic Tenant B', 'active')",
    ].join("\n"), [tenantA, organizationId, tenantB]);
    await adminPool.query("SELECT set_config('app.tenant_id', $1, false)", [tenantA]);
    await adminPool.query("UPDATE platform.tenants SET status = 'suspended' WHERE id = $1", [tenantA]);
    await adminPool.query("UPDATE platform.tenants SET status = 'active' WHERE id = $1", [tenantA]);
    await adminPool.query(
      "INSERT INTO platform.memberships (tenant_id, user_id, status) VALUES ($1, $2, 'active'), ($3, $4, 'active')",
      [tenantA, userA, tenantB, userB],
    );

    const roleA = randomUUID();
    await adminPool.query(
      "INSERT INTO platform.roles (id, tenant_id, role_key, display_name) VALUES ($1, $2, 'tenant_admin', 'Tenant Admin')",
      [roleA, tenantA],
    );
    await adminPool.query(
      "INSERT INTO platform.permissions (permission_key, description, risk_class) VALUES ('tenant.read', 'Read tenant resources', 'normal')",
    );
    const membershipA = await adminPool.query<{ id: string }>(
      "SELECT id::text FROM platform.memberships WHERE tenant_id = $1 AND user_id = $2",
      [tenantA, userA],
    );
    const membershipAId = membershipA.rows[0]?.id;
    assert.ok(membershipAId);
    await adminPool.query(
      "INSERT INTO platform.membership_roles (membership_id, role_id, tenant_id) VALUES ($1, $2, $3)",
      [membershipAId, roleA, tenantA],
    );
    await adminPool.query(
      "INSERT INTO platform.role_permissions (role_id, permission_key, tenant_id) VALUES ($1, 'tenant.read', $2)",
      [roleA, tenantA],
    );
    await adminPool.query(
      "INSERT INTO platform.entitlements (tenant_id, feature_key, state) VALUES ($1, 'synthetic.feature.a', 'active'), ($2, 'synthetic.feature.b', 'active')",
      [tenantA, tenantB],
    );

    const resolved = await database.transaction((client) =>
      client.query<{ user_id: string; status: string }>(
        "SELECT user_id::text, status FROM platform.resolve_oidc_user($1, 'subject-a')",
        [issuer],
      ),
    );
    assert.equal(resolved.rows[0]?.user_id, userA);
    assert.equal(resolved.rows[0]?.status, "active");

    const noContext = await database.transaction((client) =>
      client.query("SELECT tenant_id::text FROM platform.memberships ORDER BY tenant_id"),
    );
    assert.deepEqual(noContext.rows, []);

    const membershipsA = await database.withUserContext(userA, (client) =>
      client.query<{ tenant_id: string }>("SELECT tenant_id::text FROM platform.memberships ORDER BY tenant_id"),
    );
    assert.deepEqual(membershipsA.rows.map((row) => row.tenant_id), [tenantA]);

    const visibleTenantA = await database.withTenantContext(userA, tenantA, (client) =>
      client.query<{ id: string }>("SELECT id::text FROM platform.tenants ORDER BY id"),
    );
    assert.deepEqual(visibleTenantA.rows.map((row) => row.id), [tenantA]);

    await assert.rejects(
      database.withTenantContext(userA, tenantB, (client) =>
        client.query<{ id: string }>("SELECT id::text FROM platform.tenants WHERE id = $1", [tenantB]),
      ),
      (error: unknown) => error instanceof NotFoundException,
    );

    const entitlementsA = await database.withTenantContext(userA, tenantA, (client) =>
      client.query<{ feature_key: string }>("SELECT feature_key FROM platform.entitlements ORDER BY feature_key"),
    );
    assert.deepEqual(entitlementsA.rows.map((row) => row.feature_key), ["synthetic.feature.a"]);

    const reusedWithoutContext = await database.transaction((client) =>
      client.query("SELECT feature_key FROM platform.entitlements ORDER BY feature_key"),
    );
    assert.deepEqual(reusedWithoutContext.rows, []);

    const membershipsB = await database.withUserContext(userB, (client) =>
      client.query<{ tenant_id: string }>("SELECT tenant_id::text FROM platform.memberships ORDER BY tenant_id"),
    );
    assert.deepEqual(membershipsB.rows.map((row) => row.tenant_id), [tenantB]);

    const claimsA = {
      issuer,
      subject: "subject-a",
      audience: ["whatsbusiness-web"],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      displayName: "Synthetic A",
    };
    const accessContext = await identity.authorizeTenantAccess(
      claimsA,
      tenantA,
      "platform.tenant.context.read",
      randomUUID(),
    );
    assert.equal(accessContext.actorId, userA);
    assert.equal(accessContext.tenantId, tenantA);
    assert.equal(accessContext.membershipId, membershipAId);
    assert.ok(accessContext.authzVersion > 1);
    assert.deepEqual(accessContext.roleKeys, ["tenant_admin"]);
    assert.deepEqual(accessContext.permissionKeys, ["tenant.read"]);
    const publicContext = identity.tenantContextResponse(accessContext);
    assert.equal("membershipId" in publicContext, false);
    assert.equal("authzVersion" in publicContext, false);

    const currentVersionTransaction = await database.withTenantContextAtVersion(
      userA,
      tenantA,
      accessContext.authzVersion,
      (client) => client.query<{ id: string }>("SELECT id::text FROM platform.tenants WHERE id = $1", [tenantA]),
    );
    assert.deepEqual(currentVersionTransaction.rows.map((row) => row.id), [tenantA]);

    await adminPool.query(
      "DELETE FROM platform.role_permissions WHERE role_id = $1 AND permission_key = 'tenant.read'",
      [roleA],
    );
    await assert.rejects(
      database.withTenantContextAtVersion(
        userA,
        tenantA,
        accessContext.authzVersion,
        (client) => client.query("SELECT id FROM platform.tenants WHERE id = $1", [tenantA]),
      ),
      (error: unknown) => error instanceof NotFoundException
        && (error.getResponse() as { code?: string }).code === "TENANT_AUTHORIZATION_STALE",
    );
    const refreshedAccessContext = await identity.authorizeTenantAccess(
      claimsA,
      tenantA,
      "platform.tenant.context.read",
      randomUUID(),
    );
    assert.ok(refreshedAccessContext.authzVersion > accessContext.authzVersion);
    assert.deepEqual(refreshedAccessContext.permissionKeys, []);

    const versionBeforeMembershipChange = refreshedAccessContext.authzVersion;
    await adminPool.query(
      "UPDATE platform.memberships SET status = 'suspended' WHERE id = $1",
      [membershipAId],
    );
    const versionAfterMembershipChange = await adminPool.query<{ authz_version: number }>(
      "SELECT authz_version FROM platform.tenants WHERE id = $1",
      [tenantA],
    );
    assert.ok((versionAfterMembershipChange.rows[0]?.authz_version ?? 0) > versionBeforeMembershipChange);
    await assert.rejects(
      database.withTenantContext(userA, tenantA, (client) =>
        client.query("SELECT id FROM platform.tenants WHERE id = $1", [tenantA]),
      ),
      (error: unknown) => error instanceof NotFoundException,
    );
    await assert.rejects(
      identity.authorizeTenantAccess(claimsA, tenantA, "platform.tenant.context.read", randomUUID()),
      (error: unknown) => error instanceof NotFoundException,
    );
    await adminPool.query(
      "UPDATE platform.memberships SET status = 'active' WHERE id = $1",
      [membershipAId],
    );

    await adminPool.query(
      "UPDATE platform.users SET status = 'disabled' WHERE id = $1",
      [userA],
    );
    await assert.rejects(
      database.withTenantContext(userA, tenantA, (client) => client.query("SELECT id FROM platform.tenants")),
      (error: unknown) => error instanceof NotFoundException,
    );
    await assert.rejects(
      identity.authorizeTenantAccess(claimsA, tenantA, "platform.tenant.context.read", randomUUID()),
      (error: unknown) => error instanceof ForbiddenException,
    );
    await adminPool.query(
      "UPDATE platform.users SET status = 'active' WHERE id = $1",
      [userA],
    );

    await adminPool.query(
      "UPDATE platform.organizations SET status = 'suspended' WHERE id = $1",
      [organizationId],
    );
    await assert.rejects(
      database.withTenantContext(userA, tenantA, (client) => client.query("SELECT id FROM platform.tenants")),
      (error: unknown) => error instanceof NotFoundException,
    );
    await adminPool.query(
      "UPDATE platform.organizations SET status = 'active' WHERE id = $1",
      [organizationId],
    );

    await assert.rejects(
      adminPool.query("UPDATE platform.tenants SET status = 'pending_provisioning' WHERE id = $1", [tenantA]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "23514",
    );

    await adminPool.query("UPDATE platform.tenants SET status = 'suspended' WHERE id = $1", [tenantA]);
    await assert.rejects(
      database.withTenantContext(userA, tenantA, (client) => client.query("SELECT id FROM platform.tenants")),
      (error: unknown) => error instanceof NotFoundException,
    );
    const suspended = await adminPool.query<{ status: string; suspended_at: Date | null }>(
      "SELECT status, suspended_at FROM platform.tenants WHERE id = $1",
      [tenantA],
    );
    assert.equal(suspended.rows[0]?.status, "suspended");
    assert.ok(suspended.rows[0]?.suspended_at instanceof Date);

    await adminPool.query("UPDATE platform.tenants SET status = 'active' WHERE id = $1", [tenantA]);
    await adminPool.query("UPDATE platform.tenants SET status = 'closing' WHERE id = $1", [tenantA]);
    await adminPool.query("UPDATE platform.tenants SET status = 'deleted' WHERE id = $1", [tenantA]);

    const deletedTenantVisibility = await database.withUserContext(userA, (client) =>
      client.query("SELECT id FROM platform.tenants WHERE id = $1", [tenantA]),
    );
    assert.deepEqual(deletedTenantVisibility.rows, []);

    await assert.rejects(
      adminPool.query("UPDATE platform.tenants SET status = 'active' WHERE id = $1", [tenantA]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "23514",
    );
    await assert.rejects(
      adminPool.query("UPDATE platform.tenants SET organization_id = $2 WHERE id = $1", [tenantB, randomUUID()]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "23514",
    );
    await assert.rejects(
      adminPool.query("DELETE FROM platform.organizations WHERE id = $1", [organizationId]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "23001",
    );
  } finally {
    await adminPool.query("DELETE FROM platform.tenants WHERE organization_id = $1", [organizationId]);
    await adminPool.query("DELETE FROM platform.organizations WHERE id = $1", [organizationId]);
    await adminPool.query("DELETE FROM platform.users WHERE id = ANY($1::uuid[])", [[userA, userB]]);
    await database.onModuleDestroy();
    await adminPool.end();
  }
});
