import type { MetaOAuthProduct, MetaOAuthScopePolicy } from "./meta-oauth.policy.js";

export interface MetaOAuthScopeEvidence {
  readonly product: MetaOAuthProduct;
  readonly scope: string;
  readonly purpose: string;
  readonly sourceUrl: string;
  readonly verifiedAt: string;
}

/**
 * Product-level permission inventory grounded in official Meta collections.
 * It does not imply App Review, Advanced Access, customer consent, business
 * verification, asset grants or runtime eligibility. Other products remain
 * fail-closed until their permissions are reviewed per operation.
 */
const VERIFIED_SCOPE_EVIDENCE: readonly MetaOAuthScopeEvidence[] = Object.freeze([
  {
    product: "whatsapp_business_platform",
    scope: "business_management",
    purpose: "Leer y administrar activos del Business Portfolio cuando el caso de uso lo requiere.",
    sourceUrl: "https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup",
    verifiedAt: "2026-11-08",
  },
  {
    product: "whatsapp_business_platform",
    scope: "whatsapp_business_management",
    purpose: "Administrar WhatsApp Business Accounts y completar Embedded Signup.",
    sourceUrl: "https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup",
    verifiedAt: "2026-11-08",
  },
  {
    product: "whatsapp_business_platform",
    scope: "whatsapp_business_messaging",
    purpose: "Operaciones de mensajería Cloud API que requieren este permiso.",
    sourceUrl: "https://www.postman.com/meta/whatsapp-business-platform/overview",
    verifiedAt: "2026-11-08",
  },
]);

export class MetaOAuthScopeCatalog implements MetaOAuthScopePolicy {
  isAllowed(product: MetaOAuthProduct, scope: string): boolean {
    return VERIFIED_SCOPE_EVIDENCE.some((entry) => entry.product === product && entry.scope === scope);
  }

  evidenceFor(product: MetaOAuthProduct, scope: string): MetaOAuthScopeEvidence | null {
    return VERIFIED_SCOPE_EVIDENCE.find((entry) => entry.product === product && entry.scope === scope) ?? null;
  }

  list(product: MetaOAuthProduct): readonly MetaOAuthScopeEvidence[] {
    return Object.freeze(VERIFIED_SCOPE_EVIDENCE.filter((entry) => entry.product === product));
  }
}
