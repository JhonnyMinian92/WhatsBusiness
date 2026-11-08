import { parseAdsMoney, type AdsMoney } from "./ads-money.js";

export interface AdsObjectiveCatalogEvidence {
  readonly apiVersion: string;
  readonly source: string;
  readonly observedAt: string;
  readonly validUntil: string;
  readonly objectives: readonly string[];
}

export interface AdsPreflightEvidence {
  readonly adAccount: {
    readonly status: "available" | "unavailable" | "unknown";
    readonly currency: string | null;
    readonly observedAt: string | null;
    readonly validUntil: string | null;
  };
  readonly capability: {
    readonly status: "available" | "unavailable" | "unknown";
    readonly apiVersion: string | null;
    readonly observedAt: string | null;
    readonly validUntil: string | null;
  };
  readonly targetingStatus: "valid" | "invalid" | "unknown";
  readonly billingStatus: "ready" | "blocked" | "unknown";
  readonly creativeStatus: "ready" | "blocked" | "unknown";
}

export interface AdsCampaignDraftForValidation {
  readonly name: string;
  readonly objective: string;
  readonly dailyBudget: AdsMoney;
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
}

export interface AdsCampaignValidationIssue {
  readonly code: string;
  readonly severity: "error" | "unknown";
}

export interface AdsCampaignValidationResult {
  readonly status: "valid" | "invalid" | "requires_evidence";
  readonly issues: readonly AdsCampaignValidationIssue[];
  readonly apiVersion: string | null;
  readonly validatedAt: string;
}

const OBJECTIVE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const API_VERSION_PATTERN = /^v[0-9]+\.[0-9]+$/;

/**
 * Validation is fail-closed. Unknown account, objective, targeting, billing,
 * creative or capability evidence never turns a draft into a submit-ready
 * campaign.
 */
export function validateAdsCampaignDraft(
  input: AdsCampaignDraftForValidation,
  objectiveCatalog: AdsObjectiveCatalogEvidence | null,
  evidence: AdsPreflightEvidence,
  now: Date = new Date(),
): AdsCampaignValidationResult {
  const issues: AdsCampaignValidationIssue[] = [];
  const add = (code: string, severity: AdsCampaignValidationIssue["severity"]): void => {
    issues.push(Object.freeze({ code, severity }));
  };

  if (!Number.isFinite(now.getTime())) throw new Error("ADS_VALIDATION_TIME_INVALID");
  const validatedAt = now.toISOString();
  if (
    typeof input.name !== "string"
    || input.name.trim().length < 1
    || input.name.trim().length > 255
    || /[\u0000-\u001f\u007f]/.test(input.name)
  ) add("ADS_CAMPAIGN_NAME_INVALID", "error");
  if (typeof input.objective !== "string" || !OBJECTIVE_PATTERN.test(input.objective)) {
    add("ADS_CAMPAIGN_OBJECTIVE_INVALID", "error");
  }

  let budget: AdsMoney | null = null;
  try { budget = parseAdsMoney(input.dailyBudget); }
  catch { add("ADS_CAMPAIGN_BUDGET_INVALID", "error"); }

  if (input.startsAt !== undefined && input.startsAt !== null && !isIsoDate(input.startsAt)) {
    add("ADS_CAMPAIGN_START_TIME_INVALID", "error");
  }
  if (input.endsAt !== undefined && input.endsAt !== null && !isIsoDate(input.endsAt)) {
    add("ADS_CAMPAIGN_END_TIME_INVALID", "error");
  }
  if (input.startsAt && input.endsAt && isIsoDate(input.startsAt) && isIsoDate(input.endsAt)
      && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    add("ADS_CAMPAIGN_SCHEDULE_INVALID", "error");
  }

  const catalogFresh = objectiveCatalog !== null
    && API_VERSION_PATTERN.test(objectiveCatalog.apiVersion)
    && isNonEmpty(objectiveCatalog.source)
    && isIsoDate(objectiveCatalog.observedAt)
    && isIsoDate(objectiveCatalog.validUntil)
    && Date.parse(objectiveCatalog.observedAt) <= now.getTime()
    && Date.parse(objectiveCatalog.validUntil) > now.getTime();

  if (!catalogFresh) add("ADS_OBJECTIVE_CATALOG_UNKNOWN_OR_STALE", "unknown");
  else if (!objectiveCatalog || !objectiveCatalog.objectives.includes(input.objective)) {
    add("ADS_CAMPAIGN_OBJECTIVE_NOT_SUPPORTED", "error");
  }

  if (evidence.adAccount.status === "unavailable") {
    add("ADS_AD_ACCOUNT_UNAVAILABLE", "error");
  } else if (
    evidence.adAccount.status !== "available"
    || !evidence.adAccount.currency
    || !isFreshEvidence(evidence.adAccount.observedAt, evidence.adAccount.validUntil, now)
  ) {
    add("ADS_AD_ACCOUNT_EVIDENCE_UNKNOWN_OR_STALE", "unknown");
  } else if (budget && budget.currency !== evidence.adAccount.currency) {
    add("ADS_CAMPAIGN_CURRENCY_MISMATCH", "error");
  }

  if (evidence.capability.status === "unavailable") {
    add("ADS_MARKETING_API_CAPABILITY_UNAVAILABLE", "error");
  } else if (
    evidence.capability.status !== "available"
    || !evidence.capability.apiVersion
    || !API_VERSION_PATTERN.test(evidence.capability.apiVersion)
    || !isFreshEvidence(evidence.capability.observedAt, evidence.capability.validUntil, now)
    || (catalogFresh && objectiveCatalog !== null
      && objectiveCatalog.apiVersion !== evidence.capability.apiVersion)
  ) {
    add("ADS_MARKETING_API_CAPABILITY_UNKNOWN_OR_STALE", "unknown");
  }

  if (evidence.targetingStatus === "invalid") add("ADS_TARGETING_INVALID", "error");
  else if (evidence.targetingStatus === "unknown") add("ADS_TARGETING_NOT_VERIFIED", "unknown");
  if (evidence.billingStatus === "blocked") add("ADS_BILLING_NOT_READY", "error");
  else if (evidence.billingStatus === "unknown") add("ADS_BILLING_STATUS_UNKNOWN", "unknown");
  if (evidence.creativeStatus === "blocked") add("ADS_CREATIVE_NOT_READY", "error");
  else if (evidence.creativeStatus === "unknown") add("ADS_CREATIVE_STATUS_UNKNOWN", "unknown");

  const status = issues.some((issue) => issue.severity === "error")
    ? "invalid"
    : issues.length > 0
      ? "requires_evidence"
      : "valid";
  return Object.freeze({
    status,
    issues: Object.freeze(issues),
    apiVersion: evidence.capability.apiVersion,
    validatedAt,
  });
}

function isFreshEvidence(
  observedAt: string | null,
  validUntil: string | null,
  now: Date,
): boolean {
  return observedAt !== null
    && validUntil !== null
    && isIsoDate(observedAt)
    && isIsoDate(validUntil)
    && Date.parse(observedAt) <= now.getTime()
    && Date.parse(validUntil) > now.getTime();
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0 && value.length <= 2_048;
}
