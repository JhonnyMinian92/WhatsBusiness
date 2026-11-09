import "dotenv/config";
import { loadEnvironment } from "./platform/config/environment.js";
import { Database } from "./platform/database/database.js";
import { TenantContext } from "./platform/isolation/tenant-context.js";
import { OidcJwtAuthenticator } from "./modules/identity/oidc-authenticator.js";
import { PostgresTenantRepository } from "./modules/tenants/postgres-tenant.repository.js";
import { TenantService } from "./modules/tenants/tenant.service.js";
import { MetaOAuthClient } from "./modules/meta/connections/meta-oauth-client.js";
import { PostgresMetaOAuthStateRepository } from "./modules/meta/connections/postgres-meta-oauth-state.repository.js";
import { PostgresMetaConnectionRepository } from "./modules/meta/connections/postgres-meta-connection.repository.js";
import { PostgresMetaPermissionGrantRepository } from "./modules/meta/connections/meta-permission-grant.repository.js";
import { MetaConnectionLifecycleService } from "./modules/meta/connections/meta-connection-lifecycle.service.js";
import { BusinessLoginService } from "./modules/meta/connections/business-login.service.js";
import { PostgresMetaTokenRepository } from "./modules/meta/token-vault/postgres-meta-token.repository.js";
import { TokenVaultService } from "./modules/meta/token-vault/token-vault.service.js";
import { EnvelopeEncryptionService } from "./platform/security/envelope-encryption.js";
import { LocalDataKeyProvider } from "./platform/security/local-data-key-provider.js";
import { AwsKmsDataKeyProvider } from "./platform/security/aws-kms-data-key-provider.js";
import { MetaGraphClient } from "./modules/meta/shared/meta-graph-client.js";
import { MetaAssetDiscoveryAdapter } from "./modules/meta/assets/meta-asset-discovery.adapter.js";
import { PostgresMetaAssetRepository } from "./modules/meta/assets/postgres-asset.repository.js";
import { AssetRegistryService } from "./modules/meta/assets/asset-registry.service.js";
import { MetaWebhookChallengeVerifier, MetaWebhookSignatureVerifier } from "./modules/meta/webhooks/webhook-signature.js";
import { MetaWebhookIngestionService } from "./modules/meta/webhooks/webhook-ingestion.service.js";
import { PostgresWebhookInboxRepository } from "./modules/meta/webhooks/postgres-webhook-inbox.repository.js";
import { PostgresMetaWebhookSubscriptionRepository } from "./modules/meta/webhooks/postgres-webhook-subscription.repository.js";
import { MetaWebhookSubscriptionService } from "./modules/meta/webhooks/meta-webhook-subscription.service.js";
import { MetaDataDeletionService } from "./modules/privacy/data-deletion.service.js";
import { PostgresDataDeletionRepository } from "./modules/privacy/postgres-data-deletion.repository.js";
import { ConsentService } from "./modules/privacy/consent.service.js";
import { PostgresConsentRepository } from "./modules/privacy/postgres-consent.repository.js";
import { AuditService } from "./modules/audit/audit.service.js";
import { buildApplication } from "./http/application.js";

const env = loadEnvironment();
const tenantContext = new TenantContext();
const database = new Database({
  connectionString: env.DATABASE_URL,
  maxConnections: env.DATABASE_POOL_MAX
}, tenantContext);

const tenantRepository = new PostgresTenantRepository(database);
const tenantService = new TenantService(database, tenantRepository, tenantRepository);
const authenticator = new OidcJwtAuthenticator(env.OIDC_JWKS_URL, env.OIDC_ISSUER, env.OIDC_AUDIENCE);

const keyProvider = env.TOKEN_ENCRYPTION_MODE === "aws-kms"
  ? new AwsKmsDataKeyProvider(env.AWS_KMS_KEY_ID ?? "", env.AWS_REGION)
  : new LocalDataKeyProvider(env.TOKEN_ENCRYPTION_KEY_BASE64 ?? "");
const cipher = new EnvelopeEncryptionService(keyProvider);

const tokenVault = new TokenVaultService(new PostgresMetaTokenRepository(database), cipher);
const connectionRepository = new PostgresMetaConnectionRepository(database);
const connectionLifecycle = new MetaConnectionLifecycleService(
  connectionRepository, tokenVault,
  new MetaOAuthClient({
    appId: env.META_APP_ID, appSecret: env.META_APP_SECRET,
    graphBaseUrl: env.META_GRAPH_BASE_URL, apiVersion: env.META_GRAPH_API_VERSION,
    redirectUri: env.META_OAUTH_REDIRECT_URI
  }),
  env.META_APP_ID
);
const permissionGrantRepository = new PostgresMetaPermissionGrantRepository(database);
const oauthStateRepository = new PostgresMetaOAuthStateRepository(database);
const oauthClient = new MetaOAuthClient({
  appId: env.META_APP_ID,
  appSecret: env.META_APP_SECRET,
  graphBaseUrl: env.META_GRAPH_BASE_URL,
  apiVersion: env.META_GRAPH_API_VERSION,
  redirectUri: env.META_OAUTH_REDIRECT_URI
});
const graphClient = new MetaGraphClient({
  baseUrl: env.META_GRAPH_BASE_URL,
  apiVersion: env.META_GRAPH_API_VERSION,
  appSecret: env.META_APP_SECRET
});

const assetRegistry = new AssetRegistryService(
  new PostgresMetaAssetRepository(database),
  new MetaAssetDiscoveryAdapter(graphClient)
);
const webhookSubscriptions = new MetaWebhookSubscriptionService(
  graphClient,
  new PostgresMetaWebhookSubscriptionRepository(database)
);

const businessLogin = new BusinessLoginService(
  oauthStateRepository,
  oauthClient,
  tokenVault,
  connectionRepository,
  tenantContext,
  env.META_APP_ID,
  env.META_BUSINESS_LOGIN_CONFIG_ID,
  async (tenantId, connectionId, token, inspection, selectedAssets) => {
    const grants = inspection.scopes.map((scope) => ({
      scope, status: "GRANTED" as const, source: "OAUTH_DEBUG_TOKEN" as const
    }));
    const granularGrants = inspection.granularScopes.flatMap((grant) =>
      grant.targetIds.map((targetAssetId) => ({
        scope: grant.scope, status: "GRANTED" as const, targetAssetId,
        source: "OAUTH_DEBUG_TOKEN" as const
      }))
    );
    await permissionGrantRepository.synchronize(tenantId, connectionId, [...grants, ...granularGrants]);

    const discovered = await assetRegistry.synchronize({
      tenantId, connectionId, token,
      ...(selectedAssets.businessId ? { selectedBusinessId: selectedAssets.businessId } : {})
    });
    const assets = await assetRegistry.list(tenantId);
    const waba = selectedAssets.wabaId
      ? assets.find((asset) => asset.providerAssetId === selectedAssets.wabaId && asset.type === "WHATSAPP_BUSINESS_ACCOUNT")
      : undefined;
    if (selectedAssets.wabaId && !waba) {
      throw new Error("The WABA selected in Embedded Signup is not accessible through the granted Meta token.");
    }
    if (selectedAssets.phoneNumberId) {
      const phone = assets.find((asset) =>
        asset.providerAssetId === selectedAssets.phoneNumberId && asset.type === "WHATSAPP_PHONE_NUMBER"
      );
      if (!phone || (waba && phone.ownerBusinessId !== waba.ownerBusinessId)) {
        throw new Error("The phone number selected in Embedded Signup is not owned by the selected WABA.");
      }
    }
    if (discovered.assetsDiscovered === 0) {
      throw new Error("Meta returned no accessible business assets for the connection.");
    }

    const subscriptions = await webhookSubscriptions.synchronize({
      tenantId, connectionId, token, assets
    });
    if (selectedAssets.wabaId && !subscriptions.active.includes(selectedAssets.wabaId)) {
      const failure = subscriptions.failed.find((item) => item.assetId === selectedAssets.wabaId);
      throw new Error("WhatsApp webhook subscription was not established: " + (failure?.reason ?? "unknown error"));
    }
  }
);

const webhookIngestion = new MetaWebhookIngestionService(
  new MetaWebhookSignatureVerifier(),
  new PostgresWebhookInboxRepository(database),
  cipher,
  env.META_APP_SECRET
);
const dataDeletion = new MetaDataDeletionService(
  new PostgresDataDeletionRepository(database),
  env.META_APP_SECRET,
  env.DATA_DELETION_URL
);
const consent = new ConsentService(new PostgresConsentRepository(database));
const audit = new AuditService(database);

const app = buildApplication({
  env,
  database,
  tenantContext,
  authenticator,
  tenants: tenantService,
  businessLogin,
  connections: connectionRepository,
  connectionLifecycle,
  webhookChallenge: new MetaWebhookChallengeVerifier(),
  webhookIngestion,
  webhookSubscriptions,
  dataDeletion,
  assetRegistry,
  tokenVault,
  consent,
  audit
});

const shutdown = async (): Promise<void> => {
  await app.close();
  await database.close();
  if ("destroy" in keyProvider && typeof keyProvider.destroy === "function") keyProvider.destroy();
  if ("close" in keyProvider && typeof keyProvider.close === "function") await keyProvider.close();
};
process.once("SIGINT", () => { void shutdown().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { void shutdown().finally(() => process.exit(0)); });
await app.listen({ host: env.HOST, port: env.PORT });
