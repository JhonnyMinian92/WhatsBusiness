import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAdsCampaignIdempotencyKey,
  hashAdsCampaignDraftCommand,
  parseAdsCampaignDraftCommand,
} from "./campaign-draft-command.js";

const valid = () => ({
  name: "  Quito Leads  ",
  objective: "OUTCOME_LEADS",
  dailyBudget: { amount: "125.00", currency: "USD" },
  startsAt: "2026-11-09T00:00:00-05:00",
  endsAt: "2026-11-16T00:00:00-05:00",
  configuration: { targeting: { countries: ["EC"] }, creativeReference: "creative-01" },
});

test("campaign draft command normalizes user input into immutable canonical values", () => {
  const command = parseAdsCampaignDraftCommand(valid());
  assert.equal(command.name, "Quito Leads");
  assert.equal(command.dailyBudget.amount, "125");
  assert.equal(command.dailyBudget.currency, "USD");
  assert.equal(command.startsAt, "2026-11-09T05:00:00.000Z");
  assert.equal(command.configuration["creativeReference"], "creative-01");
  assert.ok(Object.isFrozen(command));
});

test("campaign draft command requires positive supported-currency budget", () => {
  assert.throws(
    () => parseAdsCampaignDraftCommand({ ...valid(), dailyBudget: { amount: "0", currency: "USD" } }),
    (error: unknown) => error instanceof Error
      && (error as { response?: { code?: string } }).response?.code === "ADS_CAMPAIGN_BUDGET_MUST_BE_POSITIVE",
  );
  assert.throws(
    () => parseAdsCampaignDraftCommand({ ...valid(), dailyBudget: { amount: "1.01", currency: "JPY" } }),
  );
});

test("campaign draft command rejects unknown keys and invalid objectives", () => {
  assert.throws(() => parseAdsCampaignDraftCommand({ ...valid(), providerCampaignId: "forged-id" }));
  assert.throws(() => parseAdsCampaignDraftCommand({ ...valid(), objective: "fake objective" }));
});

test("campaign draft command rejects invalid time windows and non-object configuration", () => {
  assert.throws(() => parseAdsCampaignDraftCommand({
    ...valid(),
    startsAt: "2026-11-16T00:00:00.000Z",
    endsAt: "2026-11-09T00:00:00.000Z",
  }));
  assert.throws(() => parseAdsCampaignDraftCommand({ ...valid(), configuration: ["not", "an", "object"] }));
});

test("campaign draft command caps configuration payload size", () => {
  assert.throws(() => parseAdsCampaignDraftCommand({
    ...valid(),
    configuration: { note: "x".repeat(33_000) },
  }));
});

test("equivalent normalized inputs produce a stable idempotency request hash", () => {
  const first = parseAdsCampaignDraftCommand(valid());
  const second = parseAdsCampaignDraftCommand({ ...valid(), name: "Quito Leads" });
  assert.equal(hashAdsCampaignDraftCommand(first), hashAdsCampaignDraftCommand(second));
});

test("idempotency keys accept printable ASCII and reject short or control-character values", () => {
  assertAdsCampaignIdempotencyKey("ads-request-0000001");
  assert.throws(() => assertAdsCampaignIdempotencyKey("short"));
  assert.throws(() => assertAdsCampaignIdempotencyKey("ads-request-0000001\n"));
});
