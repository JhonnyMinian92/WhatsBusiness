import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { MetaAssetDiscoveryPort } from "../application/meta-onboarding.ports.js";

/** The application cannot claim onboarding readiness until a reviewed Meta asset adapter is configured. */
@Injectable()
export class UnconfiguredMetaAssetDiscovery implements MetaAssetDiscoveryPort {
  async discoverAndPersist():Promise<never>{
    throw new ServiceUnavailableException("El descubrimiento de activos Meta no está habilitado: falta elegibilidad de proveedor y adaptación oficial versionada.");
  }
}
