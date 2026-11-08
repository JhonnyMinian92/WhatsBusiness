export type TenantLifecycleStatus = "pending_provisioning" | "active" | "suspended" | "closing" | "deleted";
export type UsageCategory = "meta" | "infrastructure" | "ai";
export type UsageEvidenceType = "measured" | "provider_reported" | "estimated";
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = Readonly<Record<string, JsonValue>>;

export class PlatformAdministrationPolicyViolation extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PlatformAdministrationPolicyViolation";
  }
}

const TRANSITIONS: Readonly<Record<TenantLifecycleStatus, readonly TenantLifecycleStatus[]>> = {
  pending_provisioning: ["active"],
  active: ["suspended", "closing"],
  suspended: ["active", "closing"],
  closing: ["deleted"],
  deleted: [],
};

export class TenantLifecyclePolicy {
  assertTransition(current: TenantLifecycleStatus, next: TenantLifecycleStatus): void {
    if (!TRANSITIONS[current].includes(next)) {
      throw new PlatformAdministrationPolicyViolation(
        "TENANT_LIFECYCLE_TRANSITION_INVALID",
        "La transición solicitada no está permitida.",
      );
    }
  }
}

export interface PlanEntitlementDefinition {
  readonly featureKey: string;
  readonly state: "active" | "suspended";
  readonly limits: JsonObject;
}
export interface PlanVersionDefinition {
  readonly planKey: string;
  readonly version: number;
  readonly displayName: string;
  readonly entitlements: readonly PlanEntitlementDefinition[];
}

export class PlanDefinitionPolicy {
  validate(plan: PlanVersionDefinition): void {
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(plan.planKey)) {
      throw new PlatformAdministrationPolicyViolation("PLAN_KEY_INVALID", "El identificador del plan no es válido.");
    }
    if (!Number.isSafeInteger(plan.version) || plan.version < 1) {
      throw new PlatformAdministrationPolicyViolation("PLAN_VERSION_INVALID", "La versión debe ser un entero positivo.");
    }
    if (plan.displayName.trim().length < 2 || plan.displayName.trim().length > 128) {
      throw new PlatformAdministrationPolicyViolation("PLAN_NAME_INVALID", "El nombre debe tener entre 2 y 128 caracteres.");
    }
    if (plan.entitlements.length < 1 || plan.entitlements.length > 100) {
      throw new PlatformAdministrationPolicyViolation("PLAN_ENTITLEMENTS_INVALID", "El plan debe tener entre 1 y 100 entitlements.");
    }
    const seen = new Set<string>();
    for (const entry of plan.entitlements) {
      if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){1,7}$/.test(entry.featureKey)) {
        throw new PlatformAdministrationPolicyViolation("ENTITLEMENT_KEY_INVALID", "Un entitlement tiene un identificador inválido.");
      }
      if (seen.has(entry.featureKey)) {
        throw new PlatformAdministrationPolicyViolation("ENTITLEMENT_DUPLICATE", "No se permiten entitlements duplicados.");
      }
      seen.add(entry.featureKey);
      this.validateJson(entry.limits, 0);
    }
  }

  private validateJson(value: JsonValue, depth: number): void {
    if (depth > 5) throw new PlatformAdministrationPolicyViolation("ENTITLEMENT_LIMITS_TOO_DEEP", "Los límites exceden la profundidad permitida.");
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      throw new PlatformAdministrationPolicyViolation("ENTITLEMENT_LIMIT_INVALID", "Los límites numéricos deben ser finitos y no negativos.");
    }
    if (typeof value === "string" && value.length > 128) {
      throw new PlatformAdministrationPolicyViolation("ENTITLEMENT_LIMIT_INVALID", "Un valor supera 128 caracteres.");
    }
    if (Array.isArray(value)) {
      if (value.length > 64) throw new PlatformAdministrationPolicyViolation("ENTITLEMENT_LIMIT_INVALID", "La lista excede 64 elementos.");
      for (const item of value as readonly JsonValue[]) this.validateJson(item, depth + 1);
    } else if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length > 64) throw new PlatformAdministrationPolicyViolation("ENTITLEMENT_LIMIT_INVALID", "El objeto excede 64 propiedades.");
      for (const [key, item] of entries) {
        if (!/^[a-z][a-zA-Z0-9_.-]{0,63}$/.test(key)
          || ["__proto__", "prototype", "constructor"].includes(key)) {
          throw new PlatformAdministrationPolicyViolation("ENTITLEMENT_LIMIT_KEY_INVALID", "La clave del límite no está permitida.");
        }
        this.validateJson(item, depth + 1);
      }
    }
  }
}

export interface SupportGrantDefinition {
  readonly requestedByUserId: string;
  readonly approvedByUserId: string;
  readonly operatorUserId: string;
  readonly reason: string;
  readonly purpose: string;
  readonly scopes: readonly string[];
  readonly validFrom: string;
  readonly expiresAt: string;
  readonly stepUpAuthTime: string;
  readonly stepUpAcr?: string;
  readonly stepUpAmr: readonly string[];
}

export class SupportGrantPolicy {
  validate(grant: SupportGrantDefinition, maxDurationMinutes: number): void {
    if (grant.requestedByUserId === grant.approvedByUserId
      || grant.operatorUserId === grant.requestedByUserId
      || grant.operatorUserId === grant.approvedByUserId) {
      throw new PlatformAdministrationPolicyViolation("SUPPORT_SEPARATION_OF_DUTIES_REQUIRED", "Solicitante, aprobador y operador deben ser personas distintas.");
    }
    if (grant.reason.trim().length < 20 || grant.reason.trim().length > 1000) {
      throw new PlatformAdministrationPolicyViolation("SUPPORT_REASON_INVALID", "La justificación debe tener entre 20 y 1000 caracteres.");
    }
    if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){2,7}$/.test(grant.purpose)) {
      throw new PlatformAdministrationPolicyViolation("SUPPORT_PURPOSE_INVALID", "El propósito no es válido.");
    }
    if (grant.scopes.length < 1 || grant.scopes.length > 16
      || new Set(grant.scopes).size !== grant.scopes.length
      || grant.scopes.some((scope) => !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){1,7}$/.test(scope))) {
      throw new PlatformAdministrationPolicyViolation("SUPPORT_SCOPES_INVALID", "Los alcances deben ser entre 1 y 16 identificadores únicos explícitos.");
    }
    const start = Date.parse(grant.validFrom);
    const end = Date.parse(grant.expiresAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new PlatformAdministrationPolicyViolation("SUPPORT_WINDOW_INVALID", "La ventana temporal no es válida.");
    }
    if (!Number.isSafeInteger(maxDurationMinutes) || maxDurationMinutes < 1 || maxDurationMinutes > 60) {
      throw new PlatformAdministrationPolicyViolation("SUPPORT_MAX_DURATION_INVALID", "La duración máxima debe estar entre 1 y 60 minutos.");
    }
    if (end - start > maxDurationMinutes * 60_000) {
      throw new PlatformAdministrationPolicyViolation("SUPPORT_WINDOW_TOO_LONG", "El acceso de soporte supera la duración máxima.");
    }
    const stepUpTime = Date.parse(grant.stepUpAuthTime);
    const now = Date.now();
    if (!Number.isFinite(stepUpTime) || stepUpTime > now + 30_000 || stepUpTime < now - 5 * 60_000
      || ((!grant.stepUpAcr || grant.stepUpAcr.trim().length === 0) && grant.stepUpAmr.length === 0)
      || grant.stepUpAmr.length > 10
      || grant.stepUpAmr.some((method) => typeof method !== "string" || method.trim().length < 1 || method.length > 64)) {
      throw new PlatformAdministrationPolicyViolation("SUPPORT_STEP_UP_REQUIRED", "La aprobación requiere evidencia OIDC step-up vigente y verificable.");
    }
  }
}

export interface UsageEntryDefinition {
  readonly category: UsageCategory;
  readonly metricKey: string;
  readonly unit: string;
  readonly quantity: string;
  readonly costAmount?: string;
  readonly currency?: string;
  readonly evidenceType: UsageEvidenceType;
  readonly sourceReference: string;
  readonly idempotencyKey: string;
  readonly observedAt: string;
}

const DECIMAL = /^\d{1,16}(?:\.\d{1,8})?$/;
export class UsageEntryPolicy {
  validate(entry: UsageEntryDefinition): void {
    if (!["meta", "infrastructure", "ai"].includes(entry.category)) {
      throw new PlatformAdministrationPolicyViolation("USAGE_CATEGORY_INVALID", "La categoría debe ser meta, infrastructure o ai.");
    }
    if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){1,7}$/.test(entry.metricKey)) {
      throw new PlatformAdministrationPolicyViolation("USAGE_METRIC_INVALID", "La métrica no es válida.");
    }
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(entry.unit)) {
      throw new PlatformAdministrationPolicyViolation("USAGE_UNIT_INVALID", "La unidad no es válida.");
    }
    if (!DECIMAL.test(entry.quantity) || Number(entry.quantity) <= 0) {
      throw new PlatformAdministrationPolicyViolation("USAGE_QUANTITY_INVALID", "La cantidad debe ser decimal positiva.");
    }
    if (entry.costAmount !== undefined) {
      if (!DECIMAL.test(entry.costAmount) || !entry.currency || !/^[A-Z]{3}$/.test(entry.currency)) {
        throw new PlatformAdministrationPolicyViolation("USAGE_COST_INVALID", "El coste requiere un decimal no negativo y moneda ISO 4217.");
      }
    } else if (entry.currency !== undefined) {
      throw new PlatformAdministrationPolicyViolation("USAGE_CURRENCY_WITHOUT_COST", "No se admite moneda sin coste.");
    }
    if (!["measured", "provider_reported", "estimated"].includes(entry.evidenceType)) {
      throw new PlatformAdministrationPolicyViolation("USAGE_EVIDENCE_INVALID", "La evidencia de consumo no es válida.");
    }
    if (entry.sourceReference.trim().length < 1 || entry.sourceReference.length > 255
      || entry.idempotencyKey.trim().length < 16 || entry.idempotencyKey.length > 255
      || !Number.isFinite(Date.parse(entry.observedAt))) {
      throw new PlatformAdministrationPolicyViolation("USAGE_METADATA_INVALID", "La referencia, idempotencia o fecha de consumo no es válida.");
    }
  }
}
