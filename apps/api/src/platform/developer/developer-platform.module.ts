import {Module} from "@nestjs/common";
import {DeveloperApiClientAuthModule} from "./developer-api-client-auth.module.js";
import {DeveloperPlatformController} from "./http/developer-platform.controller.js";
/** Explicit opt-in. Register only after API-CONTRACT-FREEZE and independent G0 approval. */
@Module({imports:[DeveloperApiClientAuthModule],controllers:[DeveloperPlatformController]})
export class DeveloperPlatformModule{}
