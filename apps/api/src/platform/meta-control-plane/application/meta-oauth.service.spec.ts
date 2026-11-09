import assert from "node:assert/strict";
import test from "node:test";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import { MetaOAuthPolicy } from "../domain/meta-oauth.policy.js";
import { MetaOAuthScopeCatalog } from "../domain/meta-oauth-scope-catalog.js";
import { MetaOAuthService } from "./meta-oauth.service.js";
import type {
  MetaConnectionCredentialRecord,
  MetaOAuthProviderPort,
  MetaOAuthRepositoryPort,
  MetaOAuthTokenSet,
} from "./meta-oauth.ports.js";
import type { MetaCredentialVault } from "./meta-credential-vault.js";

const tenantId = "b2cbecb4-bda0-4cf4-a43b-ecb34c11b025";
const creatorId = "c2cbecb4-bda0-4cf4-a43b-ecb34c11b025";
const managerId = "d2cbecb4-bda0-4cf4-a43b-ecb34c11b025";
const connectionId = "e2cbecb4-bda0-4cf4-a43b-ecb34c11b025";

function subject(actorId: string): TenantAccessContext {
  return {
    actorId,
    tenantId,
    membershipId: "f2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
    membershipStatus: "active",
    authzVersion: 1,
    roleKeys: ["tenant_admin"],
    permissionKeys: ["meta.connections.manage"],
    entitlementKeys: [],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose: "meta.connections.manage",
    correlationId: "a2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  };
}

const originalConnection: MetaConnectionCredentialRecord = {
  connectionId,
  tenantId,
  createdByUserId: creatorId,
  product: "whatsapp_business_platform",
  authorizationMode: "user_token",
  providerUserId: "meta-user-001",
  status: "active",
  encryptedToken: { keyId: "kms-key", ciphertext: "ciphertext", iv: "iv", tag: "tag" },
  tokenExpiresAt: new Date("2026-11-09T00:00:00.000Z"),
  grantedScopes: ["business_management"],
  remoteRevocationState: "not_attempted",
};

function tokenSet(accessToken: string): MetaOAuthTokenSet {
  return {
    accessToken,
    refreshToken: null,
    expiresInSeconds: 3600,
    grantedScopes: ["business_management"],
    providerUserId: "meta-user-001",
  };
}

function createHarness(options?: { decryptFails?: boolean; legacyAadOnly?: boolean }) {
  let connection = originalConnection;
  let lastAssociatedData = "";
  let encryptedAssociatedData = "";
  const decryptAttempts: string[] = [];
  let refreshAccessToken = "";
  let remoteRevocationCalls = 0;
  let localRevocationMarked = false;
  let revocationCompleted: "confirmed" | "unknown" | null = null;
  let finalEncryptedToken: unknown = null;

  const vault = {
    async encryptSecret(_plaintext: string, associatedData: string) {
      lastAssociatedData = associatedData;
      encryptedAssociatedData = associatedData;
      return { keyId: "kms-key", ciphertext: "rotated-ciphertext", iv: "iv", tag: "tag" };
    },
    async decryptSecret(_envelope: unknown, associatedData: string) {
      lastAssociatedData = associatedData;
      decryptAttempts.push(associatedData);
      if (options?.decryptFails) throw new Error("simulated KMS outage");
      const legacyAad = ["whatsbusiness","meta-oauth",tenantId,creatorId,"whatsapp_business_platform"].join(":");
      if (options?.legacyAadOnly && associatedData !== legacyAad) {
        throw new Error("simulated legacy envelope AAD mismatch");
      }
      return JSON.stringify({ accessToken: "meta-access-token", refreshToken: null, tokenType: "bearer" });
    },
  } as unknown as MetaCredentialVault;

  const provider: MetaOAuthProviderPort = {
    async buildAuthorizationUrl() { throw new Error("not used in this test"); },
    async exchangeAuthorizationCode() { throw new Error("not used in this test"); },
    async refreshAccessToken(input) {
      refreshAccessToken = input.accessToken;
      return tokenSet("meta-access-token-rotated");
    },
    async revokeAccessToken() { remoteRevocationCalls += 1; },
  };

  const repository: MetaOAuthRepositoryPort = {
    async createState() { throw new Error("not used in this test"); },
    async consumeState() { return null; },
    async saveConnection() { return { connectionId }; },
    async loadConnection() { return connection; },
    async saveRefreshedConnection(input) {
      finalEncryptedToken = input.encryptedToken;
      connection = { ...connection, encryptedToken: input.encryptedToken, tokenExpiresAt: input.expiresAt };
    },
    async markRevocationPending() {
      localRevocationMarked = true;
      connection = { ...connection, status: "reauthorization_required", remoteRevocationState: "unknown" };
    },
    async completeRevocation(input) {
      revocationCompleted = input.remoteState;
      if (input.remoteState === "confirmed") {
        connection = { ...connection, status: "revoked", remoteRevocationState: "confirmed" };
      }
    },
  };

  const policy = new MetaOAuthPolicy({
    allowedRedirectUris: [],
    allowedAuthorizationHosts: [],
  }, new MetaOAuthScopeCatalog());
  const service = new MetaOAuthService(policy, vault, provider, repository);

  return {
    service,
    associatedData: () => lastAssociatedData,
    encryptedAssociatedData: () => encryptedAssociatedData,
    decryptAttempts: () => [...decryptAttempts],
    refreshedAccessToken: () => refreshAccessToken,
    remoteRevocationCalls: () => remoteRevocationCalls,
    localRevocationMarked: () => localRevocationMarked,
    revocationCompleted: () => revocationCompleted,
    finalEncryptedToken: () => finalEncryptedToken,
    connection: () => connection,
  };
}

test("un segundo administrador puede renovar la conexión sin cambiar el AAD de credenciales", async () => {
  const harness = createHarness();
  await harness.service.refreshConnection(subject(managerId), connectionId);

  assert.equal(harness.refreshedAccessToken(), "meta-access-token");
  assert.ok(harness.associatedData().includes(tenantId));
  assert.ok(harness.associatedData().includes("meta-user-001"));
  assert.equal(harness.associatedData().includes(creatorId), false);
  assert.equal(harness.associatedData().includes(managerId), false);
  assert.ok(harness.finalEncryptedToken());
});

test("la revocación local se aplica antes de KMS y falla cerrada ante su indisponibilidad", async () => {
  const harness = createHarness({ decryptFails: true });
  const result = await harness.service.revokeConnection(subject(managerId), connectionId);

  assert.equal(harness.localRevocationMarked(), true);
  assert.equal(harness.revocationCompleted(), "unknown");
  assert.equal(harness.remoteRevocationCalls(), 0);
  assert.equal(result.status, "reauthorization_required");
  assert.equal(result.remoteRevocationState, "unknown");
  assert.equal(result.requiresManualFollowUp, true);
  assert.equal(harness.connection().status, "reauthorization_required");
});


test("migra de forma transparente un sobre histórico al AAD estable al renovar", async () => {
  const harness = createHarness({ legacyAadOnly: true });
  await harness.service.refreshConnection(subject(managerId), connectionId);

  const currentAad = JSON.stringify([
    "whatsbusiness","meta-oauth","credential",tenantId,"whatsapp_business_platform","meta-user-001",
  ]);
  const legacyAad = ["whatsbusiness","meta-oauth",tenantId,creatorId,"whatsapp_business_platform"].join(":");

  assert.deepEqual(harness.decryptAttempts(), [currentAad, legacyAad]);
  assert.equal(harness.encryptedAssociatedData(), currentAad);
  assert.ok(harness.finalEncryptedToken());
});

test("puede revocar una credencial histórica sin reactivar el acceso local", async () => {
  const harness = createHarness({ legacyAadOnly: true });
  const result = await harness.service.revokeConnection(subject(managerId), connectionId);

  assert.equal(harness.decryptAttempts().length, 2);
  assert.equal(harness.remoteRevocationCalls(), 1);
  assert.equal(harness.revocationCompleted(), "confirmed");
  assert.equal(harness.connection().status, "revoked");
  assert.equal(result.status, "revoked");
});
