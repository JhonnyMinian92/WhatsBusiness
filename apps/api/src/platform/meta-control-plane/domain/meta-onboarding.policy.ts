import { createHash } from "node:crypto";
import type { MetaAuthorizationMode, MetaOAuthProduct } from "./meta-oauth.policy.js";

export type MetaOnboardingStatus =
  | "created" | "oauth_pending" | "asset_sync_pending" | "ready" | "blocked" | "cancelled";

export interface MetaOnboardingRequest {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly product: MetaOAuthProduct;
  readonly authorizationMode: MetaAuthorizationMode;
  readonly requiredScopes: readonly string[];
  readonly idempotencyKey: string;
}
export interface ValidatedMetaOnboardingRequest extends MetaOnboardingRequest {
  readonly requestHash: string;
}
export class MetaOnboardingPolicyViolation extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "MetaOnboardingPolicyViolation";
  }
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class MetaOnboardingPolicy {
  validate(input: MetaOnboardingRequest): ValidatedMetaOnboardingRequest {
    if(!UUID.test(input.tenantId)||!UUID.test(input.actorUserId))
      throw new MetaOnboardingPolicyViolation("META_ONBOARDING_CONTEXT_INVALID","El tenant o actor no es válido.");
    if(typeof input.idempotencyKey!=="string"||input.idempotencyKey.length<16||input.idempotencyKey.length>255)
      throw new MetaOnboardingPolicyViolation("META_ONBOARDING_IDEMPOTENCY_INVALID","Se requiere una clave de idempotencia de 16 a 255 caracteres.");
    if(!Array.isArray(input.requiredScopes)||input.requiredScopes.length<1||input.requiredScopes.length>100)
      throw new MetaOnboardingPolicyViolation("META_ONBOARDING_SCOPES_INVALID","Debe especificarse el conjunto de permisos requerido.");
    const scopes=new Set<string>();
    for(const scope of input.requiredScopes){
      if(typeof scope!=="string"||!/^[a-z][a-z0-9_]{1,127}$/.test(scope)||scopes.has(scope))
        throw new MetaOnboardingPolicyViolation("META_ONBOARDING_SCOPES_INVALID","Los scopes contienen valores inválidos o duplicados.");
      scopes.add(scope);
    }
    const requestHash=createHash("sha256").update(JSON.stringify([
      input.tenantId,input.actorUserId,input.product,input.authorizationMode,[...scopes].sort(),
    ]),"utf8").digest("hex");
    return Object.freeze({...input,requiredScopes:Object.freeze([...scopes]),requestHash});
  }
}
