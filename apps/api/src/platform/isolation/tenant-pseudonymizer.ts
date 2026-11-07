export interface TenantPseudonymizer {
  pseudonymize(tenantId: string): string;
}
