/** Port for tenant pseudonymization; infrastructure owns the cryptographic implementation. */
export interface TenantPseudonymizer {
  pseudonymize(tenantId: string): string;
}
