import {
  addAdsMoney,
  compareAdsMoney,
  isAdsMoneyPositive,
  parseAdsMoney,
  type AdsMoney,
} from "../../campaigns/domain/ads-money.js";

export type CreativeExperimentAssignment = "control" | "variant";
export type CreativeExperimentAllocationMode = "meta_experiment" | "randomized_split" | "disjoint_audiences";
export type CreativeExperimentStatus =
  | "draft"
  | "simulated"
  | "approval_pending"
  | "approved"
  | "scheduled"
  | "running"
  | "completed"
  | "paused"
  | "cancelled";

export interface CreativeExperimentCell {
  readonly variantId: string;
  readonly assignment: CreativeExperimentAssignment;
  readonly budget: AdsMoney;
  readonly audiencePartitionReference: string;
}

export interface CreativeAudienceEvidence {
  readonly status: "disjoint" | "overlap" | "unknown";
  readonly source: string;
  readonly observedAt: string;
  readonly validUntil: string;
  readonly audienceReferences: readonly string[];
  readonly providerExperimentReference: string | null;
}

export interface CreativeExperimentDefinition {
  readonly name: string;
  readonly campaignId: string;
  readonly hypothesis: string;
  readonly primaryVariable: string;
  readonly primaryKpi: "qualified_leads" | "purchases" | "cost_per_result" | "outbound_ctr" | "revenue";
  readonly budget: AdsMoney;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly targetSampleSize: number;
  readonly minimumDetectableLiftPercent: number | null;
  readonly stopCriteria: {
    readonly maximumSpend: AdsMoney;
    readonly minimumSampleSize: number;
    readonly maximumDurationDays: number;
    readonly stopOnPolicyRestriction: boolean;
    readonly stopOnLearningInstability: boolean;
  };
  readonly allocationMode: CreativeExperimentAllocationMode;
  readonly audienceEvidence: CreativeAudienceEvidence;
  readonly cells: readonly CreativeExperimentCell[];
}

export interface CreativeExperimentReadiness {
  readonly ready: boolean;
  readonly reasons: readonly string[];
}

export class CreativeExperimentValidationError extends Error {
  constructor(readonly code: string, readonly field?: string) {
    super(code);
    this.name = "CreativeExperimentValidationError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSIGNMENTS: readonly CreativeExperimentAssignment[] = ["control", "variant"];
const MODES: readonly CreativeExperimentAllocationMode[] = ["meta_experiment", "randomized_split", "disjoint_audiences"];
const KPIS: readonly CreativeExperimentDefinition["primaryKpi"][] = [
  "qualified_leads", "purchases", "cost_per_result", "outbound_ctr", "revenue",
];

export function parseCreativeExperimentDefinition(value: unknown, now = new Date()): CreativeExperimentDefinition {
  const input = asRecord(value, "CREATIVE_EXPERIMENT_INVALID");
  const name = text(input["name"], "name", 1, 180);
  const campaignId = uuid(input["campaignId"], "campaignId");
  const hypothesis = text(input["hypothesis"], "hypothesis", 10, 1_000);
  const primaryVariable = text(input["primaryVariable"], "primaryVariable", 1, 128);
  const primaryKpi = enumeration(input["primaryKpi"], KPIS, "primaryKpi");
  const budget = parseMoney(input["budget"], "budget");
  const startsAt = iso(input["startsAt"], "startsAt");
  const endsAt = iso(input["endsAt"], "endsAt");
  if (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(startsAt) < now.getTime()) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_SCHEDULE_INVALID");
  }
  const targetSampleSize = positiveInt(input["targetSampleSize"], "targetSampleSize", 10_000_000);
  const lift = input["minimumDetectableLiftPercent"] === null
    ? null : numberBetween(input["minimumDetectableLiftPercent"], "minimumDetectableLiftPercent", 0.1, 100);
  const stop = asRecord(input["stopCriteria"], "CREATIVE_EXPERIMENT_STOP_CRITERIA_INVALID");
  const maximumSpend = parseMoney(stop["maximumSpend"], "stopCriteria.maximumSpend");
  const minimumSampleSize = positiveInt(stop["minimumSampleSize"], "stopCriteria.minimumSampleSize", 10_000_000);
  const maximumDurationDays = positiveInt(stop["maximumDurationDays"], "stopCriteria.maximumDurationDays", 90);
  const allocationMode = enumeration(input["allocationMode"], MODES, "allocationMode");
  const cells = parseCells(input["cells"]);
  const audienceEvidence = parseAudienceEvidence(input["audienceEvidence"]);
  if (cells.filter((cell) => cell.assignment === "control").length !== 1) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_REQUIRES_ONE_CONTROL_CELL");
  }
  if (cells.filter((cell) => cell.assignment === "variant").length < 1) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_REQUIRES_VARIANT_CELL");
  }
  if (new Set(cells.map((cell) => cell.variantId)).size !== cells.length) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_VARIANT_DUPLICATE");
  }
  if (!sameCurrency(budget, maximumSpend) || compareAdsMoney(maximumSpend, budget) > 0) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_STOP_SPEND_EXCEEDS_BUDGET");
  }
  const cellBudget = cells.reduce((total, cell) => addAdsMoney(total, cell.budget), { amount: "0", currency: budget.currency });
  if (compareAdsMoney(cellBudget, budget) !== 0 || cells.some((cell) => !sameCurrency(cell.budget, budget))) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_CELL_BUDGET_MISMATCH");
  }
  const duration = (Date.parse(endsAt) - Date.parse(startsAt)) / 86_400_000;
  if (duration > maximumDurationDays) throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_DURATION_EXCEEDS_STOP_RULE");
  if (minimumSampleSize > targetSampleSize) throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_SAMPLE_RULE_INVALID");

  return Object.freeze({
    name,
    campaignId,
    hypothesis,
    primaryVariable,
    primaryKpi,
    budget,
    startsAt,
    endsAt,
    targetSampleSize,
    minimumDetectableLiftPercent: lift,
    stopCriteria: Object.freeze({
      maximumSpend,
      minimumSampleSize,
      maximumDurationDays,
      stopOnPolicyRestriction: inputBoolean(stop["stopOnPolicyRestriction"], "stopCriteria.stopOnPolicyRestriction"),
      stopOnLearningInstability: inputBoolean(stop["stopOnLearningInstability"], "stopCriteria.stopOnLearningInstability"),
    }),
    allocationMode,
    audienceEvidence,
    cells,
  });
}

export function evaluateCreativeExperimentReadiness(
  definition: CreativeExperimentDefinition,
  now = new Date(),
): CreativeExperimentReadiness {
  const reasons: string[] = [];
  if (!Number.isFinite(now.getTime())) throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_CLOCK_INVALID");
  const evidence = definition.audienceEvidence;
  if (evidence.status === "overlap") reasons.push("CREATIVE_EXPERIMENT_AUDIENCE_OVERLAP");
  else if (evidence.status !== "disjoint") reasons.push("CREATIVE_EXPERIMENT_AUDIENCE_DISJOINTNESS_UNKNOWN");
  if (!evidence.source.trim() || !isTimestamp(evidence.observedAt)
    || !isTimestamp(evidence.validUntil) || Date.parse(evidence.observedAt) > now.getTime()
    || Date.parse(evidence.validUntil) <= now.getTime()) {
    reasons.push("CREATIVE_EXPERIMENT_AUDIENCE_EVIDENCE_STALE_OR_INVALID");
  }
  if (evidence.audienceReferences.length !== definition.cells.length) {
    reasons.push("CREATIVE_EXPERIMENT_AUDIENCE_EVIDENCE_INCOMPLETE");
  }
  if (definition.allocationMode === "meta_experiment" && !evidence.providerExperimentReference) {
    reasons.push("CREATIVE_EXPERIMENT_META_REFERENCE_MISSING");
  }
  if (definition.cells.some((cell) => !isAdsMoneyPositive(cell.budget))) {
    reasons.push("CREATIVE_EXPERIMENT_CELL_BUDGET_NOT_POSITIVE");
  }
  return Object.freeze({ ready: reasons.length === 0, reasons: Object.freeze([...new Set(reasons)]) });
}

export function transitionCreativeExperiment(
  current: CreativeExperimentStatus,
  target: CreativeExperimentStatus,
  approval: { readonly approved: boolean; readonly snapshotMatches: boolean } = { approved: false, snapshotMatches: false },
): CreativeExperimentStatus {
  const transitions: Readonly<Record<CreativeExperimentStatus, readonly CreativeExperimentStatus[]>> = {
    draft: ["simulated", "cancelled"],
    simulated: ["draft", "approval_pending", "cancelled"],
    approval_pending: ["approved", "simulated", "cancelled"],
    approved: ["scheduled", "cancelled"],
    scheduled: ["running", "paused", "cancelled"],
    running: ["completed", "paused"],
    completed: [],
    paused: ["running", "cancelled"],
    cancelled: [],
  };
  if (!transitions[current].includes(target)) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_TRANSITION_NOT_ALLOWED");
  }
  if ((target === "approved" || target === "scheduled" || target === "running")
    && (!approval.approved || !approval.snapshotMatches)) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_APPROVAL_REQUIRED");
  }
  return target;
}

function parseCells(value: unknown): readonly CreativeExperimentCell[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_CELLS_INVALID");
  }
  return Object.freeze(value.map((entry) => {
    const cell = asRecord(entry, "CREATIVE_EXPERIMENT_CELL_INVALID");
    return Object.freeze({
      variantId: uuid(cell["variantId"], "cells.variantId"),
      assignment: enumeration(cell["assignment"], ASSIGNMENTS, "cells.assignment"),
      budget: parseMoney(cell["budget"], "cells.budget"),
      audiencePartitionReference: text(cell["audiencePartitionReference"], "cells.audiencePartitionReference", 1, 256),
    });
  }));
}

function parseAudienceEvidence(value: unknown): CreativeAudienceEvidence {
  const input = asRecord(value, "CREATIVE_EXPERIMENT_AUDIENCE_EVIDENCE_INVALID");
  const status = enumeration(input["status"], ["disjoint", "overlap", "unknown"] as const, "audienceEvidence.status");
  const audienceReferences = stringArray(input["audienceReferences"], "audienceEvidence.audienceReferences", 10);
  return Object.freeze({
    status,
    source: text(input["source"], "audienceEvidence.source", 1, 256),
    observedAt: iso(input["observedAt"], "audienceEvidence.observedAt"),
    validUntil: iso(input["validUntil"], "audienceEvidence.validUntil"),
    audienceReferences,
    providerExperimentReference: input["providerExperimentReference"] === null
      ? null : text(input["providerExperimentReference"], "audienceEvidence.providerExperimentReference", 1, 256),
  });
}

function parseMoney(value: unknown, field: string): AdsMoney {
  try {
    const money = parseAdsMoney(value);
    if (!isAdsMoneyPositive(money)) throw new Error("not positive");
    return money;
  } catch {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_MONEY_INVALID", field);
  }
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new CreativeExperimentValidationError(code);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.trim().length < min || value.length > max
    || /[\u0000-\u001f\u007f]/.test(value)) throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_FIELD_INVALID", field);
  return value.trim();
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_UUID_INVALID", field);
  return value.toLowerCase();
}

function iso(value: unknown, field: string): string {
  if (typeof value !== "string" || !isTimestamp(value)) throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_TIMESTAMP_INVALID", field);
  return new Date(value).toISOString();
}

function isTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function positiveInt(value: unknown, field: string, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_INTEGER_INVALID", field);
  }
  return value as number;
}

function numberBetween(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_NUMBER_INVALID", field);
  }
  return value;
}

function enumeration<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_ENUM_INVALID", field);
  return value as T[number];
}

function inputBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_BOOLEAN_INVALID", field);
  return value;
}

function stringArray(value: unknown, field: string, max: number): readonly string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > max) throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_ARRAY_INVALID", field);
  const items = value.map((entry) => text(entry, field, 1, 256));
  if (new Set(items).size !== items.length) throw new CreativeExperimentValidationError("CREATIVE_EXPERIMENT_ARRAY_DUPLICATE", field);
  return Object.freeze(items);
}

function sameCurrency(left: AdsMoney, right: AdsMoney): boolean {
  return left.currency === right.currency;
}
