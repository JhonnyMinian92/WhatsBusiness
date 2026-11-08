import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAdsBudgetChange, type AdsBudgetWindow } from "./budget-guardrail.js";
import type { AdsMoney } from "./ads-money.js";

const now = new Date("2026-11-08T17:00:00.000Z");
const money = (amount: string, currency = "USD"): AdsMoney => ({ amount, currency });
const windowFor = (baseline: string, startedAt = "2026-11-08T00:00:00.000Z"): AdsBudgetWindow => ({
  baseline: money(baseline),
  startedAt,
  expiresAt: new Date(Date.parse(startedAt) + 24 * 60 * 60 * 1_000).toISOString(),
  observedAt: startedAt,
});

test("allows exactly +20% in a single operation and over the fixed rolling baseline", () => {
  const result = evaluateAdsBudgetChange({
    current: money("100"),
    requested: money("120"),
    window: windowFor("100"),
    now,
    killSwitchActive: false,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.direction, "increase");
  assert.equal(result.reason, null);
});

test("rejects an individual increase greater than 20%", () => {
  const result = evaluateAdsBudgetChange({
    current: money("100"),
    requested: money("120.01"),
    window: windowFor("100"),
    now,
    killSwitchActive: false,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "ADS_BUDGET_OPERATION_LIMIT_EXCEEDED");
});

test("rejects cumulative +20% bypass across multiple small changes", () => {
  const result = evaluateAdsBudgetChange({
    current: money("119"),
    requested: money("125"),
    window: windowFor("100"),
    now,
    killSwitchActive: false,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "ADS_BUDGET_ROLLING_WINDOW_LIMIT_EXCEEDED");
});

test("compares decimal amounts numerically rather than lexicographically", () => {
  const result = evaluateAdsBudgetChange({
    current: money("9"),
    requested: money("10"),
    window: windowFor("9"),
    now,
    killSwitchActive: false,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.direction, "increase");
});

test("permits budget reduction during kill switch even when baseline cap was exceeded", () => {
  const result = evaluateAdsBudgetChange({
    current: money("125"),
    requested: money("110"),
    window: windowFor("100"),
    now,
    killSwitchActive: true,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.direction, "decrease");
});

test("rejects increases during kill switch and rejects mixed currencies", () => {
  const blocked = evaluateAdsBudgetChange({
    current: money("100"),
    requested: money("101"),
    window: windowFor("100"),
    now,
    killSwitchActive: true,
  });
  assert.equal(blocked.reason, "ADS_BUDGET_KILL_SWITCH_ACTIVE");
  const currency = evaluateAdsBudgetChange({
    current: money("100", "USD"),
    requested: money("101", "EUR"),
    window: windowFor("100"),
    now,
    killSwitchActive: false,
  });
  assert.equal(currency.reason, "ADS_BUDGET_CURRENCY_MISMATCH");
});

test("requires reconciliation after an expired or malformed 24-hour window", () => {
  const expired = evaluateAdsBudgetChange({
    current: money("100"),
    requested: money("101"),
    window: windowFor("100", "2026-11-07T00:00:00.000Z"),
    now,
    killSwitchActive: false,
  });
  assert.equal(expired.reason, "ADS_BUDGET_WINDOW_EXPIRED");

  const malformed = evaluateAdsBudgetChange({
    current: money("100"),
    requested: money("101"),
    window: { ...windowFor("100"), expiresAt: "2026-11-09T00:00:01.000Z" },
    now,
    killSwitchActive: false,
  });
  assert.equal(malformed.reason, "ADS_BUDGET_WINDOW_INVALID");
});

test("does not schedule a provider mutation for an unchanged budget", () => {
  const result = evaluateAdsBudgetChange({
    current: money("100.00"),
    requested: money("100"),
    window: windowFor("100"),
    now,
    killSwitchActive: false,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.direction, "unchanged");
  assert.equal(result.reason, "ADS_BUDGET_NO_CHANGE");
});

test("permits a budget decrease after the increase window expires", () => {
  const result = evaluateAdsBudgetChange({
    current: money("125"),
    requested: money("110"),
    window: windowFor("100", "2026-11-07T00:00:00.000Z"),
    now,
    killSwitchActive: false,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.direction, "decrease");
  assert.equal(result.reason, null);
});

test("rejects zero budget requests instead of treating them as a pause", () => {
  const result = evaluateAdsBudgetChange({
    current: money("100"),
    requested: money("0"),
    window: windowFor("100"),
    now,
    killSwitchActive: false,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "ADS_BUDGET_AMOUNT_INVALID");
});
