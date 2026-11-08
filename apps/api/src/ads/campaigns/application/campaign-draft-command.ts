import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { isAdsMoneyPositive, parseAdsMoney, type AdsMoney } from "../domain/ads-money.js";
import type { JsonSnapshot } from "../../../platform/identity/approvals/approval-request-hash.js";

export interface AdsCampaignDraftCommand {
  readonly name: string;
  readonly objective: string;
  readonly dailyBudget: AdsMoney;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly configuration: Readonly<Record<string, JsonSnapshot>>;
}

export function parseAdsCampaignDraftCommand(value: unknown): AdsCampaignDraftCommand {
  if (!isPlainRecord(value)) throw invalid("ADS_CAMPAIGN_DRAFT_INVALID");
  const allowed = new Set(["name", "objective", "dailyBudget", "startsAt", "endsAt", "configuration"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw invalid("ADS_CAMPAIGN_DRAFT_UNKNOWN_FIELD");

  const name = value["name"];
  const objective = value["objective"];
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 255
      || /[\u0000-\u001f\u007f]/.test(name)) throw invalid("ADS_CAMPAIGN_NAME_INVALID");
  if (typeof objective !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(objective)) {
    throw invalid("ADS_CAMPAIGN_OBJECTIVE_INVALID");
  }

  let dailyBudget: AdsMoney;
  try {
    dailyBudget = parseAdsMoney(value["dailyBudget"]);
    if (!isAdsMoneyPositive(dailyBudget)) throw invalid("ADS_CAMPAIGN_BUDGET_MUST_BE_POSITIVE");
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw invalid("ADS_CAMPAIGN_BUDGET_INVALID");
  }

  const startsAt = parseOptionalDate(value["startsAt"], "ADS_CAMPAIGN_START_TIME_INVALID");
  const endsAt = parseOptionalDate(value["endsAt"], "ADS_CAMPAIGN_END_TIME_INVALID");
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw invalid("ADS_CAMPAIGN_SCHEDULE_INVALID");
  }

  const configuration = normalizeConfiguration(value["configuration"]);
  return Object.freeze({
    name: name.trim().normalize("NFC"),
    objective,
    dailyBudget,
    startsAt,
    endsAt,
    configuration,
  });
}

export function hashAdsCampaignDraftCommand(command: AdsCampaignDraftCommand): string {
  return createHash("sha256").update(JSON.stringify(command), "utf8").digest("hex");
}

export function assertAdsCampaignIdempotencyKey(value: string): void {
  if (typeof value !== "string" || value.length < 16 || value.length > 255
      || !/^[\x21-\x7e]+$/.test(value)) {
    throw invalid("ADS_CAMPAIGN_IDEMPOTENCY_KEY_INVALID");
  }
}

function parseOptionalDate(value: unknown, code: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !Number.isFinite(Date.parse(value))) throw invalid(code);
  return new Date(value).toISOString();
}

function normalizeConfiguration(value: unknown): Readonly<Record<string, JsonSnapshot>> {
  if (value === undefined || value === null) return Object.freeze({});
  if (!isPlainRecord(value)) throw invalid("ADS_CAMPAIGN_CONFIGURATION_INVALID");
  let serialized: string | undefined;
  try { serialized = JSON.stringify(value); }
  catch { throw invalid("ADS_CAMPAIGN_CONFIGURATION_INVALID"); }
  if (!serialized || Buffer.byteLength(serialized, "utf8") > 32_768) {
    throw invalid("ADS_CAMPAIGN_CONFIGURATION_TOO_LARGE");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); }
  catch { throw invalid("ADS_CAMPAIGN_CONFIGURATION_INVALID"); }
  if (!isPlainRecord(parsed)) throw invalid("ADS_CAMPAIGN_CONFIGURATION_INVALID");
  assertJsonTree(parsed);
  return Object.freeze(parsed as Record<string, JsonSnapshot>);
}

function assertJsonTree(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalid("ADS_CAMPAIGN_CONFIGURATION_INVALID");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertJsonTree(item);
    return;
  }
  if (isPlainRecord(value)) {
    for (const item of Object.values(value)) assertJsonTree(item);
    return;
  }
  throw invalid("ADS_CAMPAIGN_CONFIGURATION_INVALID");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(code: string): BadRequestException {
  return new BadRequestException({ code, detail: "La solicitud de campaña no cumple las reglas del dominio." });
}
