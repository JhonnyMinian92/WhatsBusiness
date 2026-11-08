import {Module} from "@nestjs/common";
import {DatabaseModule} from "../database/database.module.js";
import {IdentityModule} from "../identity/identity.module.js";
import {IsolationModule} from "../isolation/isolation.module.js";
import {DeveloperPlatformService} from "./application/developer-platform.service.js";
import {OidcOrApiClientGuard} from "./application/oidc-or-api-client.guard.js";
import {DeveloperWebhookEventPublisher} from "./application/developer-webhook-event.publisher.js";
import {DEVELOPER_API_KEY_PEPPER_PROVIDER,EnvironmentDeveloperApiKeyPepperProvider} from "./infrastructure/developer-api-key-pepper.js";
import {DEVELOPER_WEBHOOK_SECRET_PROTECTOR,EnvironmentDeveloperWebhookSecretProtector} from "./infrastructure/developer-webhook-secret-protector.js";
@Module({imports:[DatabaseModule,IdentityModule,IsolationModule],providers:[
DeveloperPlatformService,OidcOrApiClientGuard,DeveloperWebhookEventPublisher,EnvironmentDeveloperApiKeyPepperProvider,EnvironmentDeveloperWebhookSecretProtector,
{provide:DEVELOPER_API_KEY_PEPPER_PROVIDER,useExisting:EnvironmentDeveloperApiKeyPepperProvider},
{provide:DEVELOPER_WEBHOOK_SECRET_PROTECTOR,useExisting:EnvironmentDeveloperWebhookSecretProtector}],
exports:[DeveloperPlatformService,OidcOrApiClientGuard,DeveloperWebhookEventPublisher]})
export class DeveloperApiClientAuthModule{}
