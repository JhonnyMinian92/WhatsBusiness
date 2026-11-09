import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import type { PermissionKey } from "../../identity/authorization/permission-catalog.js";
import { AppendOnlyAuditRepository } from "../../identity/audit/append-only-audit.repository.js";
import { DatabaseService } from "../../database/database.module.js";
import { PostgresTenantJobRecordWriter } from "../../isolation/postgres-tenant-job-record.writer.js";
import {
  assertDeveloperIdempotencyKey, assertDeveloperUuid, generateDeveloperApiCredential,
  hashDeveloperCommand, isDeveloperApiScope, parseCreateDeveloperApiClient,
  secureDigestEquals, type DeveloperApiScope,
} from "../domain/developer-api-credential.js";
import {
  createDeveloperWebhookSecret, parseCreateWebhookEndpoint,
  parseDeveloperWebhookSubscriptions, DeveloperWebhookValidationError,
  validateWebhookTargetUrl,
} from "../domain/developer-webhook.js";
import { DEVELOPER_API_KEY_PEPPER_PROVIDER, type DeveloperApiKeyPepperProvider } from "../infrastructure/developer-api-key-pepper.js";
import { DEVELOPER_WEBHOOK_SECRET_PROTECTOR, type DeveloperWebhookSecretProtector } from "../infrastructure/developer-webhook-secret-protector.js";

const DELIVERY_JOB_TYPE = "developer.webhook.delivery";
const VERIFY_JOB_TYPE = "developer.webhook.verify_endpoint";

interface ApiClientRow {
  id: string; name: string; key_id: string; scopes: string[]; status: string;
  expires_at: Date | null; last_used_at: Date | null; created_at: Date;
  rotated_at: Date | null; revoked_at: Date | null;
}
interface EndpointRow {
  id: string; name: string; target_url: string; status: string;
  last_verified_at: Date | null; created_at: Date; updated_at: Date;
}
interface CommandRow { id: string; request_sha256: string; resource_id: string | null; }

export interface ApiClientMutationResult {
  readonly client: { readonly id: string; readonly name: string; readonly keyId: string;
    readonly scopes: readonly string[]; readonly status: string; readonly expiresAt: string | null };
  readonly bearerToken: string | null;
  readonly secretShownOnce: boolean;
  readonly replayed: boolean;
}
export interface WebhookEndpointMutationResult {
  readonly endpoint: { readonly id: string; readonly name: string; readonly url: string; readonly status: string };
  readonly signingSecret: string | null;
  readonly secretShownOnce: boolean;
}

@Injectable()
export class DeveloperPlatformService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AppendOnlyAuditRepository,
    private readonly jobs: PostgresTenantJobRecordWriter,
    @Inject(DEVELOPER_API_KEY_PEPPER_PROVIDER) private readonly pepper: DeveloperApiKeyPepperProvider,
    @Inject(DEVELOPER_WEBHOOK_SECRET_PROTECTOR) private readonly secretProtector: DeveloperWebhookSecretProtector,
  ) {}

  listApiClients(subject: TenantAccessContext) {
    this.assertPermission(subject, "developer.api_clients.read");
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const result = await client.query<ApiClientRow>(
          "SELECT id::text, name, key_id, scopes, status, expires_at, last_used_at, created_at, rotated_at, revoked_at " +
          "FROM platform.developer_api_clients WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100",
          [subject.tenantId],
        );
        return result.rows.map((row) => this.apiClientView(row));
      });
  }

  createApiClient(subject: TenantAccessContext, body: unknown, idempotencyKey: string | undefined): Promise<ApiClientMutationResult> {
    this.assertPermission(subject, "developer.api_clients.manage");
    const commandIdempotencyKey = validateDeveloperInput(() => {
      assertDeveloperIdempotencyKey(idempotencyKey);
      return idempotencyKey;
    });
    const command = validateDeveloperInput(() => parseCreateDeveloperApiClient(body));
    const requestHash = hashDeveloperCommand({
      name: command.name, scopes: command.scopes, expiresAt: command.expiresAt?.toISOString() ?? null,
    });
    const generated = generateDeveloperApiCredential(this.pepper.getPepper());
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.reserveCommand(client, subject, "api_client.create", commandIdempotencyKey, requestHash);
        if (reservation.replayed) {
          const existing = reservation.resourceId ? await this.findApiClient(client, subject.tenantId, reservation.resourceId) : null;
          if (!existing) throw new ConflictException({ code: "DEVELOPER_COMMAND_INCOMPLETE" });
          return { client: this.apiClientMutationView(existing), bearerToken: null, secretShownOnce: false, replayed: true };
        }
        const result = await client.query<ApiClientRow>(
          "INSERT INTO platform.developer_api_clients " +
          "(tenant_id, owner_user_id, name, key_id, secret_digest, scopes, expires_at) " +
          "VALUES ($1,$2,$3,$4,$5,$6,$7) " +
          "RETURNING id::text, name, key_id, scopes, status, expires_at, last_used_at, created_at, rotated_at, revoked_at",
          [subject.tenantId, subject.actorId, command.name, generated.keyId, generated.secretDigest, command.scopes, command.expiresAt],
        );
        const row = result.rows[0];
        if (!row) throw new Error("DEVELOPER_API_CLIENT_INSERT_FAILED");
        await this.completeCommand(client, reservation.commandId, row.id);
        await this.appendAudit(client, subject, "developer.api_clients.manage", "developer_api_client", row.id, requestHash);
        return { client: this.apiClientMutationView(row), bearerToken: generated.bearerToken, secretShownOnce: true, replayed: false };
      });
  }

  rotateApiClient(subject: TenantAccessContext, clientId: string, idempotencyKey: string | undefined): Promise<ApiClientMutationResult> {
    this.assertPermission(subject, "developer.api_clients.manage");
    validateDeveloperInput(() => assertDeveloperUuid(clientId));
    const commandIdempotencyKey = validateDeveloperInput(() => {
      assertDeveloperIdempotencyKey(idempotencyKey);
      return idempotencyKey;
    });
    const requestHash = hashDeveloperCommand({ clientId, operation: "rotate" });
    const generated = generateDeveloperApiCredential(this.pepper.getPepper());
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.reserveCommand(client, subject, "api_client.rotate", commandIdempotencyKey, requestHash);
        if (reservation.replayed) {
          const existing = reservation.resourceId ? await this.findApiClient(client, subject.tenantId, reservation.resourceId) : null;
          if (!existing) throw new ConflictException({ code: "DEVELOPER_COMMAND_INCOMPLETE" });
          return { client: this.apiClientMutationView(existing), bearerToken: null, secretShownOnce: false, replayed: true };
        }
        const current = await this.findApiClient(client, subject.tenantId, clientId, true);
        if (!current || current.status !== "active") throw new NotFoundException({ code: "DEVELOPER_API_CLIENT_NOT_FOUND" });
        const updated = await client.query<ApiClientRow>(
          "UPDATE platform.developer_api_clients SET previous_secret_digest = secret_digest, " +
          "previous_secret_expires_at = now() + interval '15 minutes', secret_digest = $3, " +
          "rotated_at = now(), updated_at = now() WHERE id = $1 AND tenant_id = $2 AND status = 'active' " +
          "RETURNING id::text, name, key_id, scopes, status, expires_at, last_used_at, created_at, rotated_at, revoked_at",
          [clientId, subject.tenantId, generated.secretDigest],
        );
        const row = updated.rows[0];
        if (!row) throw new ConflictException({ code: "DEVELOPER_API_CLIENT_STATE_CHANGED" });
        await this.completeCommand(client, reservation.commandId, clientId);
        await this.appendAudit(client, subject, "developer.api_clients.manage", "developer_api_client", clientId, requestHash);
        return { client: this.apiClientMutationView(row), bearerToken: generated.bearerToken, secretShownOnce: true, replayed: false };
      });
  }

  revokeApiClient(subject: TenantAccessContext, clientId: string, idempotencyKey: string | undefined) {
    this.assertPermission(subject, "developer.api_clients.manage");
    validateDeveloperInput(() => assertDeveloperUuid(clientId));
    const commandIdempotencyKey = validateDeveloperInput(() => {
      assertDeveloperIdempotencyKey(idempotencyKey);
      return idempotencyKey;
    });
    const requestHash = hashDeveloperCommand({ clientId, operation: "revoke" });
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.reserveCommand(client, subject, "api_client.revoke", commandIdempotencyKey, requestHash);
        if (reservation.replayed) {
          const row = await this.findApiClient(client, subject.tenantId, reservation.resourceId ?? clientId);
          if (!row || row.status !== "revoked" || !row.revoked_at) throw new ConflictException({ code: "DEVELOPER_API_CLIENT_STATE_CHANGED" });
          return { id: row.id, status: "revoked" as const, revokedAt: row.revoked_at.toISOString(), replayed: true };
        }
        const result = await client.query<{ id: string; revoked_at: Date }>(
          "UPDATE platform.developer_api_clients SET status='revoked', revoked_at=now(), " +
          "previous_secret_digest=NULL, previous_secret_expires_at=NULL, updated_at=now() " +
          "WHERE id=$1 AND tenant_id=$2 AND status='active' RETURNING id::text, revoked_at",
          [clientId, subject.tenantId],
        );
        const row = result.rows[0];
        if (!row) throw new NotFoundException({ code: "DEVELOPER_API_CLIENT_NOT_FOUND" });
        await this.completeCommand(client, reservation.commandId, row.id);
        await this.appendAudit(client, subject, "developer.api_clients.manage", "developer_api_client", row.id, requestHash);
        return { id: row.id, status: "revoked" as const, revokedAt: row.revoked_at.toISOString(), replayed: false };
      });
  }

  listWebhookEndpoints(subject: TenantAccessContext) {
    this.assertPermission(subject, "developer.webhooks.read");
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const result = await client.query<EndpointRow>(
          "SELECT id::text,name,target_url,status,last_verified_at,created_at,updated_at " +
          "FROM platform.developer_webhook_endpoints WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
          [subject.tenantId],
        );
        return result.rows.map((row) => this.endpointView(row));
      });
  }

  createWebhookEndpoint(subject: TenantAccessContext, body: unknown, idempotencyKey: string | undefined): Promise<WebhookEndpointMutationResult> {
    this.assertPermission(subject, "developer.webhooks.manage");
    const commandIdempotencyKey = validateDeveloperInput(() => {
      assertDeveloperIdempotencyKey(idempotencyKey);
      return idempotencyKey;
    });
    const command = validateDeveloperInput(() => parseCreateWebhookEndpoint(body));
    const requestHash = hashDeveloperCommand(command);
    const signingSecret = createDeveloperWebhookSecret();
    const challenge = randomBytes(32).toString("base64url");
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.reserveCommand(client, subject, "webhook_endpoint.create", commandIdempotencyKey, requestHash);
        if (reservation.replayed) {
          const endpoint = reservation.resourceId ? await this.findEndpoint(client, subject.tenantId, reservation.resourceId) : null;
          if (!endpoint) throw new ConflictException({ code: "DEVELOPER_COMMAND_INCOMPLETE" });
          return { endpoint: this.endpointMutationView(endpoint), signingSecret: null, secretShownOnce: false };
        }
        const idResult = await client.query<{ id: string }>("SELECT gen_random_uuid()::text AS id");
        const endpointId = idResult.rows[0]?.id;
        if (!endpointId) throw new Error("DEVELOPER_WEBHOOK_ENDPOINT_ID_FAILED");
        const protectedSecret = this.secretProtector.protect(subject.tenantId, endpointId, signingSecret);
        const inserted = await client.query<EndpointRow>(
          "INSERT INTO platform.developer_webhook_endpoints " +
          "(id,tenant_id,created_by_user_id,name,target_url,status,signing_secret_version," +
          "signing_secret_nonce,signing_secret_ciphertext,signing_secret_auth_tag,challenge_digest) " +
          "VALUES ($1,$2,$3,$4,$5,'pending_verification',$6,$7,$8,$9,$10) " +
          "RETURNING id::text,name,target_url,status,last_verified_at,created_at,updated_at",
          [endpointId, subject.tenantId, subject.actorId, command.name, command.url, protectedSecret.version,
            protectedSecret.nonce, protectedSecret.ciphertext, protectedSecret.authTag,
            createHash("sha256").update(challenge, "utf8").digest("hex")],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("DEVELOPER_WEBHOOK_ENDPOINT_INSERT_FAILED");
        await this.jobs.stage(client, {
          tenantId: subject.tenantId, actorUserId: subject.actorId,
          purpose: "developer.webhooks.verify", correlationId: subject.correlationId,
          jobType: VERIFY_JOB_TYPE, idempotencyKey: "developer-webhook-verify:" + endpointId,
          payload: { endpointId, challenge }, maxAttempts: 1,
        });
        await this.completeCommand(client, reservation.commandId, endpointId);
        await this.appendAudit(client, subject, "developer.webhooks.manage", "developer_webhook_endpoint", endpointId, requestHash);
        return { endpoint: this.endpointMutationView(row), signingSecret, secretShownOnce: true };
      });
  }

  updateWebhookEndpoint(subject: TenantAccessContext, endpointId: string, body: unknown, idempotencyKey: string | undefined): Promise<WebhookEndpointMutationResult> {
    this.assertPermission(subject, "developer.webhooks.manage");
    validateDeveloperInput(() => assertDeveloperUuid(endpointId));
    const commandIdempotencyKey = validateDeveloperInput(() => {
      assertDeveloperIdempotencyKey(idempotencyKey);
      return idempotencyKey;
    });
    const command = validateDeveloperInput(() => parseUpdateWebhookEndpoint(body));
    const requestHash = hashDeveloperCommand({ endpointId, command });
    const challenge = randomBytes(32).toString("base64url");
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.reserveCommand(client, subject, "webhook_endpoint.update", commandIdempotencyKey, requestHash);
        if (reservation.replayed) {
          const existing = await this.findEndpoint(client, subject.tenantId, reservation.resourceId ?? endpointId);
          if (!existing) throw new NotFoundException({ code: "DEVELOPER_WEBHOOK_ENDPOINT_NOT_FOUND" });
          return { endpoint: this.endpointMutationView(existing), signingSecret: null, secretShownOnce: false };
        }
        const current = await this.findEndpoint(client, subject.tenantId, endpointId, true);
        if (!current || current.status === "disabled") throw new NotFoundException({ code: "DEVELOPER_WEBHOOK_ENDPOINT_NOT_FOUND" });
        const changedUrl = command.url !== undefined && command.url !== current.target_url;
        const updated = await client.query<EndpointRow>(
          "UPDATE platform.developer_webhook_endpoints SET name=$3,target_url=$4," +
          "status=CASE WHEN $5::boolean THEN 'pending_verification' ELSE status END," +
          "last_verified_at=CASE WHEN $5::boolean THEN NULL ELSE last_verified_at END," +
          "challenge_digest=CASE WHEN $5::boolean THEN $6 ELSE challenge_digest END, updated_at=now() " +
          "WHERE id=$1 AND tenant_id=$2 RETURNING id::text,name,target_url,status,last_verified_at,created_at,updated_at",
          [endpointId, subject.tenantId, command.name ?? current.name, command.url ?? current.target_url,
            changedUrl, createHash("sha256").update(challenge, "utf8").digest("hex")],
        );
        const row = updated.rows[0];
        if (!row) throw new NotFoundException({ code: "DEVELOPER_WEBHOOK_ENDPOINT_NOT_FOUND" });
        if (changedUrl) {
          await this.jobs.stage(client, {
            tenantId: subject.tenantId, actorUserId: subject.actorId,
            purpose: "developer.webhooks.verify", correlationId: subject.correlationId,
            jobType: VERIFY_JOB_TYPE,
            idempotencyKey: "developer-webhook-verify:" + endpointId + ":" + reservation.commandId,
            payload: { endpointId, challenge }, maxAttempts: 1,
          });
        }
        await this.completeCommand(client, reservation.commandId, endpointId);
        await this.appendAudit(client, subject, "developer.webhooks.manage", "developer_webhook_endpoint", endpointId, requestHash);
        return { endpoint: this.endpointMutationView(row), signingSecret: null, secretShownOnce: false };
      });
  }

  disableWebhookEndpoint(subject: TenantAccessContext, endpointId: string, idempotencyKey: string | undefined) {
    this.assertPermission(subject, "developer.webhooks.manage");
    validateDeveloperInput(() => assertDeveloperUuid(endpointId));
    const commandIdempotencyKey = validateDeveloperInput(() => {
      assertDeveloperIdempotencyKey(idempotencyKey);
      return idempotencyKey;
    });
    const requestHash = hashDeveloperCommand({ endpointId, operation: "disable" });
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.reserveCommand(client, subject, "webhook_endpoint.disable", commandIdempotencyKey, requestHash);
        if (reservation.replayed) return { id: reservation.resourceId ?? endpointId, status: "disabled" as const, replayed: true };
        const result = await client.query<{ id: string }>(
          "UPDATE platform.developer_webhook_endpoints SET status='disabled',disabled_at=now(),updated_at=now() " +
          "WHERE id=$1 AND tenant_id=$2 AND status<>'disabled' RETURNING id::text",
          [endpointId, subject.tenantId],
        );
        const row = result.rows[0];
        if (!row) throw new NotFoundException({ code: "DEVELOPER_WEBHOOK_ENDPOINT_NOT_FOUND" });
        await this.completeCommand(client, reservation.commandId, row.id);
        await this.appendAudit(client, subject, "developer.webhooks.manage", "developer_webhook_endpoint", row.id, requestHash);
        return { id: row.id, status: "disabled" as const, replayed: false };
      });
  }

  subscribeWebhookEvents(subject: TenantAccessContext, body: unknown, idempotencyKey: string | undefined) {
    this.assertPermission(subject, "developer.webhooks.manage");
    const commandIdempotencyKey = validateDeveloperInput(() => {
      assertDeveloperIdempotencyKey(idempotencyKey);
      return idempotencyKey;
    });
    const record = asPlainRecord(body);
    const endpointIdValue = record["endpointId"];
    if (typeof endpointIdValue !== "string") {
      throw new BadRequestException({ code: "DEVELOPER_RESOURCE_ID_INVALID" });
    }
    const endpointId = endpointIdValue;
    validateDeveloperInput(() => assertDeveloperUuid(endpointId));
    if (Object.keys(record).some((key) => key !== "endpointId" && key !== "subscriptions")) {
      throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_SUBSCRIPTION_FIELDS_INVALID");
    }
    const subscriptions = validateDeveloperInput(() => parseDeveloperWebhookSubscriptions(record["subscriptions"]));
    const requestHash = hashDeveloperCommand({ endpointId, subscriptions });
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.reserveCommand(client, subject, "webhook_subscription.upsert", commandIdempotencyKey, requestHash);
        if (reservation.replayed) {
          return { endpointId, subscriptions: await this.getSubscriptions(client, subject.tenantId, endpointId), replayed: true };
        }
        const endpoint = await this.findEndpoint(client, subject.tenantId, endpointId, true);
        if (!endpoint || endpoint.status === "disabled") throw new NotFoundException({ code: "DEVELOPER_WEBHOOK_ENDPOINT_NOT_FOUND" });
        // A POST replaces the subscription set atomically; omitted event types are removed.
        await client.query(
          "DELETE FROM platform.developer_webhook_subscriptions WHERE tenant_id=$1 AND endpoint_id=$2",
          [subject.tenantId, endpointId],
        );
        for (const item of subscriptions) {
          await client.query(
            "INSERT INTO platform.developer_webhook_subscriptions (tenant_id,endpoint_id,event_type,schema_version) " +
            "VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,endpoint_id,event_type,schema_version) DO NOTHING",
            [subject.tenantId, endpointId, item.eventType, item.schemaVersion],
          );
        }
        await this.completeCommand(client, reservation.commandId, endpointId);
        await this.appendAudit(client, subject, "developer.webhooks.manage", "developer_webhook_endpoint", endpointId, requestHash);
        return { endpointId, subscriptions: await this.getSubscriptions(client, subject.tenantId, endpointId), replayed: false };
      });
  }

  listWebhookDeliveries(subject: TenantAccessContext, pageSizeValue?: string) {
    this.assertPermission(subject, "developer.webhooks.read");
    const pageSize = pageSizeValue === undefined ? 25 : Number(pageSizeValue);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException({ code: "DEVELOPER_PAGE_SIZE_INVALID" });
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const result = await client.query(
          "SELECT d.id::text,d.endpoint_id::text,e.name AS endpoint_name,d.event_id::text,d.event_type," +
          "d.schema_version,d.status,d.attempt_count,d.max_attempts,d.manual_retry_count,d.next_attempt_at," +
          "d.delivered_at,d.last_http_status,d.last_error_code,d.created_at," +
          "(SELECT count(*)::integer FROM platform.developer_webhook_delivery_attempts a " +
          "WHERE a.tenant_id=d.tenant_id AND a.delivery_id=d.id) AS attempt_history_count " +
          "FROM platform.developer_webhook_deliveries d " +
          "INNER JOIN platform.developer_webhook_endpoints e ON e.id=d.endpoint_id AND e.tenant_id=d.tenant_id " +
          "WHERE d.tenant_id=$1 ORDER BY d.created_at DESC,d.id DESC LIMIT $2",
          [subject.tenantId, pageSize],
        );
        return result.rows;
      });
  }

  retryWebhookDelivery(subject: TenantAccessContext, deliveryId: string, idempotencyKey: string | undefined) {
    this.assertPermission(subject, "developer.webhooks.retry");
    validateDeveloperInput(() => assertDeveloperUuid(deliveryId));
    const commandIdempotencyKey = validateDeveloperInput(() => {
      assertDeveloperIdempotencyKey(idempotencyKey);
      return idempotencyKey;
    });
    const requestHash = hashDeveloperCommand({ deliveryId, operation: "manual_retry" });
    return this.database.withTenantContextAtVersion(subject.actorId, subject.tenantId, subject.authzVersion,
      async (client) => {
        const reservation = await this.reserveCommand(client, subject, "webhook_delivery.retry", commandIdempotencyKey, requestHash);
        if (reservation.replayed) return { id: reservation.resourceId ?? deliveryId, status: "pending" as const, replayed: true };
        const selected = await client.query<{
          id: string; status: string; attempt_count: number; max_attempts: number; manual_retry_count: number;
        }>(
          "SELECT id::text,status,attempt_count,max_attempts,manual_retry_count " +
          "FROM platform.developer_webhook_deliveries WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
          [deliveryId, subject.tenantId],
        );
        const row = selected.rows[0];
        if (!row) throw new NotFoundException({ code: "DEVELOPER_WEBHOOK_DELIVERY_NOT_FOUND" });
        if (!["failed", "dead_letter"].includes(row.status) || row.manual_retry_count >= 3) {
          throw new ConflictException({ code: "DEVELOPER_WEBHOOK_RETRY_NOT_ALLOWED" });
        }
        const nextManualRetry = row.manual_retry_count + 1;
        const nextMaximum = Math.min(12, Math.max(row.max_attempts, row.attempt_count + 1));
        await client.query(
          "UPDATE platform.developer_webhook_deliveries SET status='pending',next_attempt_at=now()," +
          "delivered_at=NULL,last_error_code=NULL,max_attempts=$3,manual_retry_count=$4,updated_at=now() " +
          "WHERE id=$1 AND tenant_id=$2",
          [deliveryId, subject.tenantId, nextMaximum, nextManualRetry],
        );
        await this.jobs.stage(client, {
          tenantId: subject.tenantId, actorUserId: subject.actorId,
          purpose: "developer.webhooks.deliver", correlationId: subject.correlationId,
          jobType: DELIVERY_JOB_TYPE,
          idempotencyKey: "developer-webhook-delivery:" + deliveryId + ":manual:" + nextManualRetry,
          payload: { deliveryId }, maxAttempts: nextMaximum - row.attempt_count,
        });
        await this.completeCommand(client, reservation.commandId, deliveryId);
        await this.appendAudit(client, subject, "developer.webhooks.retry", "developer_webhook_delivery", deliveryId, requestHash);
        return { id: deliveryId, status: "pending" as const, replayed: false };
      });
  }

  async authenticateDeveloperApiClient(keyId: string, digest: string) {
    const candidate = await this.database.transaction(async (client) => {
      const result = await client.query<{
        client_id:string; tenant_id:string; owner_user_id:string; secret_digest:string;
        previous_secret_digest:string|null; previous_secret_expires_at:Date|null;
        scopes:string[]; expires_at:Date|null; status:string;
      }>("SELECT * FROM platform.lookup_developer_api_client($1)", [keyId]);
      const row = result.rows[0], now = new Date();
      if (!row || row.status !== "active" || (row.expires_at && row.expires_at <= now)) return null;
      const valid = secureDigestEquals(row.secret_digest.trim(), digest)
        || Boolean(row.previous_secret_digest && row.previous_secret_expires_at
          && row.previous_secret_expires_at > now
          && secureDigestEquals(row.previous_secret_digest.trim(), digest));
      if (!valid) return null;
      return Object.freeze({
        clientId:row.client_id, tenantId:row.tenant_id, ownerUserId:row.owner_user_id,
        scopes:Object.freeze(row.scopes.filter(isDeveloperApiScope)),
      });
    });
    if (!candidate || candidate.scopes.length === 0) return null;
    const perClient = boundedInteger("DEVELOPER_API_CLIENT_RATE_LIMIT",60,1,10000);
    const perTenant = boundedInteger("DEVELOPER_API_TENANT_RATE_LIMIT",600,perClient,100000);
    const quota = await this.database.withTenantContext(candidate.ownerUserId,candidate.tenantId,async (client) => {
      const now = new Date();
      const touched = await client.query<{accepted:boolean}>(
        "SELECT platform.touch_developer_api_client($1,$2,$3) AS accepted",
        [candidate.clientId,candidate.tenantId,now],
      );
      if (touched.rows[0]?.accepted !== true) return {accepted:false,allowed:false,retry:60};
      const limited = await client.query<{allowed:boolean;retry_after_seconds:number}>(
        "SELECT * FROM platform.consume_developer_api_rate_limit($1,$2,$3,$4,$5)",
        [candidate.tenantId,candidate.clientId,now,perClient,perTenant],
      );
      return {accepted:true,allowed:limited.rows[0]?.allowed===true,retry:limited.rows[0]?.retry_after_seconds??60};
    });
    if (!quota.accepted) return null;
    if (!quota.allowed) throw new DeveloperApiRateLimitError(quota.retry);
    return candidate;
  }

  private async reserveCommand(client: PoolClient, subject: TenantAccessContext, operation: string, key: string, requestHash: string) {
    const inserted = await client.query<{ id: string }>(
      "INSERT INTO platform.developer_api_commands (tenant_id,actor_user_id,operation_key,idempotency_key,request_sha256) " +
      "VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,actor_user_id,operation_key,idempotency_key) DO NOTHING RETURNING id::text",
      [subject.tenantId, subject.actorId, operation, key, requestHash],
    );
    if (inserted.rows[0]) return { commandId: inserted.rows[0].id, replayed: false, resourceId: null as string | null };
    const existing = await client.query<CommandRow>(
      "SELECT id::text,request_sha256,resource_id::text FROM platform.developer_api_commands " +
      "WHERE tenant_id=$1 AND actor_user_id=$2 AND operation_key=$3 AND idempotency_key=$4",
      [subject.tenantId, subject.actorId, operation, key],
    );
    const row = existing.rows[0];
    if (!row) throw new ConflictException({ code: "DEVELOPER_IDEMPOTENCY_RECORD_NOT_FOUND" });
    if (row.request_sha256.trim() !== requestHash) throw new ConflictException({ code: "DEVELOPER_IDEMPOTENCY_KEY_REUSED" });
    return { commandId: row.id, replayed: true, resourceId: row.resource_id };
  }

  private async completeCommand(client: PoolClient, commandId: string, resourceId: string) {
    await client.query("UPDATE platform.developer_api_commands SET resource_id=$2 WHERE id=$1", [commandId, resourceId]);
  }

  private async appendAudit(client: PoolClient, subject: TenantAccessContext, action: string, type: string, id: string, hash: string) {
    await this.audit.append(client, {
      tenantId: subject.tenantId, actorUserId: subject.actorId, actionKey: action,
      resourceType: type, resourceId: id, purpose: subject.purpose, outcome: "allowed",
      correlationId: subject.correlationId, requestHash: hash,
    });
  }

  private async findApiClient(client: PoolClient, tenantId: string, id: string, lock = false): Promise<ApiClientRow | null> {
    const result = await client.query<ApiClientRow>(
      "SELECT id::text,name,key_id,scopes,status,expires_at,last_used_at,created_at,rotated_at,revoked_at " +
      "FROM platform.developer_api_clients WHERE id=$1 AND tenant_id=$2" + (lock ? " FOR UPDATE" : ""),
      [id, tenantId],
    );
    return result.rows[0] ?? null;
  }

  private async findEndpoint(client: PoolClient, tenantId: string, id: string, lock = false): Promise<EndpointRow | null> {
    const result = await client.query<EndpointRow>(
      "SELECT id::text,name,target_url,status,last_verified_at,created_at,updated_at " +
      "FROM platform.developer_webhook_endpoints WHERE id=$1 AND tenant_id=$2" + (lock ? " FOR UPDATE" : ""),
      [id, tenantId],
    );
    return result.rows[0] ?? null;
  }

  private async getSubscriptions(client: PoolClient, tenantId: string, endpointId: string) {
    const result = await client.query<{ event_type: string; schema_version: string }>(
      "SELECT event_type,schema_version FROM platform.developer_webhook_subscriptions " +
      "WHERE tenant_id=$1 AND endpoint_id=$2 ORDER BY event_type,schema_version",
      [tenantId, endpointId],
    );
    return result.rows.map((row) => ({ eventType: row.event_type, schemaVersion: row.schema_version }));
  }

  private apiClientView(row: ApiClientRow) {
    return {
      id: row.id, name: row.name, keyId: row.key_id, scopes: row.scopes, status: row.status,
      expiresAt: row.expires_at?.toISOString() ?? null, lastUsedAt: row.last_used_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(), rotatedAt: row.rotated_at?.toISOString() ?? null,
      revokedAt: row.revoked_at?.toISOString() ?? null,
    };
  }
  private apiClientMutationView(row: ApiClientRow) {
    return {
      id: row.id, name: row.name, keyId: row.key_id, scopes: row.scopes, status: row.status,
      expiresAt: row.expires_at?.toISOString() ?? null,
    };
  }
  private endpointView(row: EndpointRow) {
    return {
      id: row.id, name: row.name, url: row.target_url, status: row.status,
      lastVerifiedAt: row.last_verified_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
  }
  private endpointMutationView(row: EndpointRow) {
    return { id: row.id, name: row.name, url: row.target_url, status: row.status };
  }
  private assertPermission(subject: TenantAccessContext, permission: PermissionKey) {
    if (!subject.permissionKeys.includes(permission)) {
      throw new ForbiddenException({ code: "DEVELOPER_PERMISSION_REQUIRED" });
    }
  }
}

export class DeveloperApiRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("DEVELOPER_API_RATE_LIMITED");
    this.name = "DeveloperApiRateLimitError";
  }
}

function parseUpdateWebhookEndpoint(value: unknown): { name?: string; url?: string } {
  const body = asPlainRecord(value);
  if (Object.keys(body).some((key) => key !== "name" && key !== "url") || Object.keys(body).length === 0) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_UPDATE_FIELDS_INVALID");
  }
  let name: string | undefined;
  let url: string | undefined;
  if (body["name"] !== undefined) {
    if (typeof body["name"] !== "string" || body["name"].trim().length < 2 || body["name"].trim().length > 100) {
      throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_NAME_INVALID");
    }
    name = body["name"].trim();
  }
  if (body["url"] !== undefined) {
    if (typeof body["url"] !== "string") throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_URL_INVALID");
    url = validateWebhookTargetUrl(body["url"]);
  }
  return Object.freeze({ ...(name ? { name } : {}), ...(url ? { url } : {}) });
}
function asPlainRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ code: "DEVELOPER_REQUEST_BODY_INVALID" });
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new BadRequestException({ code: "DEVELOPER_REQUEST_BODY_INVALID" });
  return value as Record<string, unknown>;
}
function validateDeveloperInput<T>(operation: () => T): T {
  try { return operation(); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as {code?:unknown}).code;
      if (typeof code === "string" && code.startsWith("DEVELOPER_"))
        throw new BadRequestException({code,detail:"La solicitud no cumple el contrato de Developer Platform."});
    }
    throw error;
  }
}
function boundedInteger(key: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[key]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(key + " configuration is invalid.");
  return value;
}
