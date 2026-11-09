import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import { ZodError, z } from "zod";
import type { Environment } from "../platform/config/environment.js";
import type { Database } from "../platform/database/database.js";
import { TenantContext } from "../platform/isolation/tenant-context.js";
import { ApplicationError, toPublicError } from "../platform/errors/application-error.js";
import type { TokenAuthenticator, AuthenticatedActor } from "../modules/identity/oidc-authenticator.js";
import { getBearerToken } from "../modules/identity/oidc-authenticator.js";
import type { TenantService } from "../modules/tenants/tenant.service.js";
import type { BusinessLoginService } from "../modules/meta/connections/business-login.service.js";
import type { MetaConnectionRepository } from "../modules/meta/connections/meta-connection.repository.js";
import type { MetaConnectionLifecycleService } from "../modules/meta/connections/meta-connection-lifecycle.service.js";
import type { MetaWebhookChallengeVerifier } from "../modules/meta/webhooks/webhook-signature.js";
import type { MetaWebhookIngestionService } from "../modules/meta/webhooks/webhook-ingestion.service.js";
import type { MetaWebhookSubscriptionService } from "../modules/meta/webhooks/meta-webhook-subscription.service.js";
import type { MetaDataDeletionService } from "../modules/privacy/data-deletion.service.js";
import type { AssetRegistryService } from "../modules/meta/assets/asset-registry.service.js";
import type { TokenVaultService } from "../modules/meta/token-vault/token-vault.service.js";
import { META_PERMISSION_CATALOG } from "../modules/meta/permissions/permission-catalog.js";
import type { ConsentService } from "../modules/privacy/consent.service.js";
import type { AuditService } from "../modules/audit/audit.service.js";

interface RawBodyRequest extends FastifyRequest { rawBody?: Buffer; }
export interface ApplicationDependencies {
  readonly env: Environment;
  readonly database: Database;
  readonly tenantContext: TenantContext;
  readonly authenticator: TokenAuthenticator;
  readonly tenants: TenantService;
  readonly businessLogin: BusinessLoginService;
  readonly connections: MetaConnectionRepository;
  readonly connectionLifecycle: MetaConnectionLifecycleService;
  readonly webhookChallenge: MetaWebhookChallengeVerifier;
  readonly webhookIngestion: MetaWebhookIngestionService;
  readonly webhookSubscriptions: MetaWebhookSubscriptionService;
  readonly dataDeletion: MetaDataDeletionService;
  readonly assetRegistry: AssetRegistryService;
  readonly tokenVault: TokenVaultService;
  readonly consent: ConsentService;
  readonly audit: AuditService;
}
const tenantIdSchema = z.string().uuid();
const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(3).max(63).regex(/^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])$/)
});
const completeSignupSchema = z.object({
  state: z.string().min(20).max(512), code: z.string().min(1).max(4096),
  businessId: z.string().optional(), wabaId: z.string().optional(), phoneNumberId: z.string().optional()
});
const consentSchema = z.object({
  subjectReference: z.string().min(1).max(256),
  channel: z.enum(["WHATSAPP", "MESSENGER", "INSTAGRAM", "EMAIL", "SMS", "WEB"]),
  purpose: z.enum(["SERVICE", "MARKETING", "ANALYTICS", "PERSONALIZATION"]),
  status: z.enum(["GRANTED", "REVOKED"]), source: z.string().min(1).max(100),
  evidenceReference: z.string().max(512).optional()
});

export function buildApplication(dependencies: ApplicationDependencies): FastifyInstance {
  const app = Fastify({
    logger: {
      level: dependencies.env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization", "req.headers.cookie", "req.body.code",
          "req.body.access_token", "req.body.signed_request", "req.query.code",
          "req.query.access_token", "response.headers.set-cookie"
        ],
        censor: "[REDACTED]"
      }
    },
    bodyLimit: 2_100_000,
    requestIdHeader: false,
    genReqId: () => randomUUID()
  });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    (request as RawBodyRequest).rawBody = Buffer.from(body);
    try {
      const text = (body as Buffer).toString("utf8");
      done(null, text ? JSON.parse(text) : null);
    } catch (error) {
      done(error as Error, undefined);
    }
  });
  void app.register(formbody);
  const origins = dependencies.env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  void app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || origins.includes(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed by CORS."), false);
    },
    credentials: true
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Request validation failed." },
        details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        correlationId: request.id
      });
    }
    const publicError = toPublicError(error);
    request.log.error({
      errorCode: publicError.code, errorName: error instanceof Error ? error.name : "UnknownError"
    }, "Request failed");
    return reply.status(publicError.statusCode).send({
      error: { code: publicError.code, message: publicError.message }, correlationId: request.id
    });
  });

  app.get("/health/live", async () => ({
    status: "ok", service: "whatsbusiness-api", timestamp: new Date().toISOString()
  }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await dependencies.database.ping();
      return { status: "ready", dependencies: { postgres: "ready" } };
    } catch {
      return reply.status(503).send({ status: "not_ready", dependencies: { postgres: "unavailable" } });
    }
  });

  app.post("/v1/tenants", async (request, reply) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const body = createTenantSchema.parse(request.body);
    const tenant = await dependencies.tenants.createForOwner({
      name: body.name, slug: body.slug, ownerUserId: actor.userId
    });
    return reply.status(201).send({ data: tenant });
  });

  app.get("/v1/tenants/:tenantId/members", async (request) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const { tenantId } = tenantParams(request);
    return dependencies.tenantContext.run({ tenantId, userId: actor.userId, correlationId: request.id }, async () => ({
      data: await dependencies.tenants.listMembers(tenantId, actor.userId)
    }));
  });

  app.post("/v1/tenants/:tenantId/meta/business-login/url", async (request) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const { tenantId } = tenantParams(request);
    return dependencies.tenantContext.run({ tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(tenantId, actor.userId, "meta.connect");
      return { data: { authorizationUrl: await dependencies.businessLogin.createBusinessLoginUrl(tenantId, actor.userId) } };
    });
  });

  app.post("/v1/tenants/:tenantId/meta/embedded-signup/session", async (request) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const { tenantId } = tenantParams(request);
    return dependencies.tenantContext.run({ tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(tenantId, actor.userId, "meta.connect");
      return { data: await dependencies.businessLogin.createEmbeddedSignupSession(tenantId, actor.userId) };
    });
  });

  app.post("/v1/tenants/:tenantId/meta/embedded-signup/complete", async (request, reply) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const { tenantId } = tenantParams(request);
    const body = completeSignupSchema.parse(request.body);
    return dependencies.tenantContext.run({ tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(tenantId, actor.userId, "meta.connect");
      const result = await dependencies.businessLogin.complete(
        body.state, body.code,
        {
          ...(body.businessId ? { businessId: body.businessId } : {}),
          ...(body.wabaId ? { wabaId: body.wabaId } : {}),
          ...(body.phoneNumberId ? { phoneNumberId: body.phoneNumberId } : {})
        },
        "WHATSAPP_EMBEDDED_SIGNUP_V4",
        tenantId
      );
      return reply.status(201).send({ data: result });
    });
  });

  app.get("/v1/meta/oauth/callback", async (request, reply) => {
    const query = z.object({
      state: z.string().min(20).max(512), code: z.string().min(1).max(4096).optional(),
      error: z.string().optional(), error_description: z.string().optional()
    }).parse(request.query);
    if (query.error) {
      throw new ApplicationError("UNAUTHENTICATED", "Meta authorization was not completed: " + (query.error_description ?? query.error));
    }
    if (!query.code) throw new ApplicationError("VALIDATION_ERROR", "Meta OAuth callback did not include an authorization code.");
    const result = await dependencies.businessLogin.complete(query.state, query.code, {}, "BUSINESS_LOGIN");
    return reply.status(200).send({ data: result, message: "Meta connection established. No access token is exposed." });
  });

  app.get("/v1/tenants/:tenantId/meta/connections", async (request) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const { tenantId } = tenantParams(request);
    return dependencies.tenantContext.run({ tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(tenantId, actor.userId, "assets.read");
      return { data: await dependencies.connections.listByTenant(tenantId) };
    });
  });

  app.post("/v1/tenants/:tenantId/meta/connections/:connectionId/verify", async (request) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const params = z.object({ tenantId: tenantIdSchema, connectionId: z.string().uuid() }).parse(request.params);
    return dependencies.tenantContext.run({ tenantId: params.tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(params.tenantId, actor.userId, "assets.manage");
      const result = await dependencies.connectionLifecycle.verify(params.tenantId, params.connectionId);
      await dependencies.audit.record({
        tenantId: params.tenantId, actorUserId: actor.userId,
        action: "meta.connection.verified", resourceType: "meta_connection",
        resourceId: params.connectionId, correlationId: request.id,
        metadata: { status: result.status, scopeCount: result.scopes.length }
      });
      return { data: result };
    });
  });

  app.post("/v1/tenants/:tenantId/meta/connections/:connectionId/rotate-token", async (request) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const params = z.object({ tenantId: tenantIdSchema, connectionId: z.string().uuid() }).parse(request.params);
    return dependencies.tenantContext.run({ tenantId: params.tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(params.tenantId, actor.userId, "assets.manage");
      const result = await dependencies.connectionLifecycle.rotateUserToken(params.tenantId, params.connectionId);
      await dependencies.audit.record({
        tenantId: params.tenantId, actorUserId: actor.userId,
        action: "meta.token.rotated", resourceType: "meta_connection",
        resourceId: params.connectionId, correlationId: request.id,
        metadata: { scopeCount: result.scopes.length, expiresAt: result.expiresAt?.toISOString() ?? null }
      });
      return { data: result };
    });
  });

  app.post("/v1/tenants/:tenantId/meta/connections/:connectionId/disconnect", async (request, reply) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const params = z.object({ tenantId: tenantIdSchema, connectionId: z.string().uuid() }).parse(request.params);
    return dependencies.tenantContext.run({ tenantId: params.tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(params.tenantId, actor.userId, "meta.disconnect");
      await dependencies.connectionLifecycle.disconnect(params.tenantId, params.connectionId);
      await dependencies.audit.record({
        tenantId: params.tenantId, actorUserId: actor.userId,
        action: "meta.connection.disconnected", resourceType: "meta_connection",
        resourceId: params.connectionId, correlationId: request.id
      });
      return reply.status(200).send({ data: { disconnected: true } });
    });
  });

  app.post("/v1/tenants/:tenantId/meta/connections/:connectionId/webhooks/synchronize", async (request) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const params = z.object({ tenantId: tenantIdSchema, connectionId: z.string().uuid() }).parse(request.params);
    return dependencies.tenantContext.run({ tenantId: params.tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(params.tenantId, actor.userId, "assets.manage");
      const token = await dependencies.tokenVault.retrieve(params.tenantId, params.connectionId);
      const assets = await dependencies.assetRegistry.list(params.tenantId);
      const result = await dependencies.webhookSubscriptions.synchronize({
        tenantId: params.tenantId, connectionId: params.connectionId, token, assets
      });
      await dependencies.audit.record({
        tenantId: params.tenantId, actorUserId: actor.userId,
        action: "meta.webhooks.synchronized", resourceType: "meta_connection",
        resourceId: params.connectionId, correlationId: request.id,
        metadata: { active: result.active.length, failed: result.failed.length }
      });
      return { data: result };
    });
  });

  app.get("/v1/tenants/:tenantId/meta/assets", async (request) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const { tenantId } = tenantParams(request);
    return dependencies.tenantContext.run({ tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(tenantId, actor.userId, "assets.read");
      return { data: await dependencies.assetRegistry.list(tenantId) };
    });
  });

  app.post("/v1/tenants/:tenantId/meta/connections/:connectionId/assets/synchronize", async (request) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const params = z.object({ tenantId: tenantIdSchema, connectionId: z.string().uuid() }).parse(request.params);
    return dependencies.tenantContext.run({ tenantId: params.tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(params.tenantId, actor.userId, "assets.manage");
      const token = await dependencies.tokenVault.retrieve(params.tenantId, params.connectionId);
      return { data: await dependencies.assetRegistry.synchronize({
        tenantId: params.tenantId, connectionId: params.connectionId, token
      }) };
    });
  });

  app.get("/v1/meta/permissions/catalog", async () => ({ data: META_PERMISSION_CATALOG }));

  app.post("/v1/tenants/:tenantId/consents", async (request, reply) => {
    const actor = await authenticate(request, dependencies.authenticator);
    const { tenantId } = tenantParams(request);
    const body = consentSchema.parse(request.body);
    return dependencies.tenantContext.run({ tenantId, userId: actor.userId, correlationId: request.id }, async () => {
      await dependencies.tenants.requirePermission(tenantId, actor.userId, "tenant.manage");
      await dependencies.consent.record({ tenantId, ...body, recordedBy: actor.userId });
      await dependencies.audit.record({
        tenantId, actorUserId: actor.userId,
        action: body.status === "GRANTED" ? "consent.granted" : "consent.revoked",
        resourceType: "consent", resourceId: body.subjectReference, correlationId: request.id,
        metadata: { channel: body.channel, purpose: body.purpose, source: body.source }
      });
      return reply.status(201).send({ data: { recorded: true } });
    });
  });

  app.get("/v1/webhooks/meta", async (request, reply) => {
    const query = z.object({
      "hub.mode": z.string().optional(), "hub.verify_token": z.string().optional(),
      "hub.challenge": z.string().optional()
    }).parse(request.query);
    const challenge = dependencies.webhookChallenge.verify({
      mode: query["hub.mode"], suppliedToken: query["hub.verify_token"],
      expectedToken: dependencies.env.META_WEBHOOK_VERIFY_TOKEN, challenge: query["hub.challenge"]
    });
    if (!challenge) throw new ApplicationError("UNAUTHENTICATED", "Meta webhook verification challenge was rejected.");
    return reply.type("text/plain").send(challenge);
  });

  app.post("/v1/webhooks/meta", async (request, reply) => {
    const rawBody = (request as RawBodyRequest).rawBody;
    if (!rawBody) throw new ApplicationError("VALIDATION_ERROR", "Raw webhook body is unavailable.");
    const result = await dependencies.webhookIngestion.accept(rawBody, request.headers["x-hub-signature-256"]);
    return reply.status(200).send({ received: true, eventId: result.eventId });
  });

  app.post("/v1/meta/data-deletion", async (request) => {
    const body = z.object({ signed_request: z.string().min(1).max(20_000) }).parse(request.body);
    return dependencies.dataDeletion.handleSignedRequest(body.signed_request);
  });
  app.get("/v1/meta/data-deletion/status", async (request) => {
    const query = z.object({ code: z.string().min(1).max(256) }).parse(request.query);
    return dependencies.dataDeletion.status(query.code);
  });

  return app;
}

async function authenticate(request: FastifyRequest, authenticator: TokenAuthenticator): Promise<AuthenticatedActor> {
  return authenticator.authenticate(getBearerToken(request.headers.authorization));
}
function tenantParams(request: FastifyRequest): { tenantId: string } {
  return z.object({ tenantId: tenantIdSchema }).parse(request.params);
}
