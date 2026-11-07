import { createHmac } from "node:crypto";
import type { TenantPseudonymizer } from "./tenant-pseudonymizer.js";

/**
 * HMAC-SHA-256 pseudonymizer. The key must be injected from a secret manager;
 * never source it from tenant data, request input, or a committed .env file.
 */
export class HmacTenantPseudonymizer implements TenantPseudonymizer {
  private readonly secret: Uint8Array;

  constructor(secret: Uint8Array) {
    if (secret.byteLength < 32) {
      throw new Error("Tenant telemetry HMAC key must contain at least 256 bits.");
    }
    this.secret = Uint8Array.from(secret);
  }

  pseudonymize(tenantId: string): string {
    return `hmacv1_${createHmac("sha256", this.secret).update(tenantId).digest("hex")}`;
  }
}
