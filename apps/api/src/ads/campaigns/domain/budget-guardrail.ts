import {
  compareAdsMoney,
  exceedsAdsMoneyBaselinePercent,
  isAdsMoneyEqual,
  isAdsMoneyIncreaseWithinPercent,
  parseAdsMoney,
  type AdsMoney,
} from "./ads-money.js";

export const ADS_BUDGET_CHANGE_LIMIT_PERCENT = 20;
export const ADS_BUDGET_WINDOW_DURATION_MS = 24 * 60 * 60 * 1_000;

export interface AdsBudgetWindow {
  /** Immutable budget observed when the rolling 24-hour window began. */
  readonly baseline: AdsMoney;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly observedAt: string;
}

export type AdsBudgetGuardrailReason =
  | "ADS_BUDGET_KILL_SWITCH_ACTIVE"
  | "ADS_BUDGET_CURRENCY_MISMATCH"
  | "ADS_BUDGET_WINDOW_INVALID"
  | "ADS_BUDGET_WINDOW_EXPIRED"
  | "ADS_BUDGET_NO_CHANGE"
  | "ADS_BUDGET_OPERATION_LIMIT_EXCEEDED"
  | "ADS_BUDGET_ROLLING_WINDOW_LIMIT_EXCEEDED";

export interface AdsBudgetGuardrailInput {
  readonly current: AdsMoney;
  readonly requested: AdsMoney;
  readonly window: AdsBudgetWindow;
  readonly now: Date;
  readonly killSwitchActive: boolean;
}

export interface AdsBudgetGuardrailDecision {
  readonly allowed: boolean;
  readonly direction: "increase" | "decrease" | "unchanged";
  readonly reason: AdsBudgetGuardrailReason | null;
  readonly operationLimitPercent: 20;
  readonly rollingWindowLimitPercent: 20;
}

/**
 * Applies PD-024 using integer decimal arithmetic. The rolling baseline remains
 * fixed for its complete 24-hour window; clients cannot reset it by splitting
 * an increase into smaller requests.
 */
export function evaluateAdsBudgetChange(
  input: AdsBudgetGuardrailInput,
): AdsBudgetGuardrailDecision {
  const current = parseAdsMoney(input.current);
  const requested = parseAdsMoney(input.requested);
  if (current.currency !== requested.currency) {
    return decision(false, "unchanged", "ADS_BUDGET_CURRENCY_MISMATCH");
  }
  const comparison = compareAdsMoney(requested, current);
  if (comparison === 0) {
    return decision(true, "unchanged", "ADS_BUDGET_NO_CHANGE");
  }
  if (comparison < 0) {
    // Risk-reducing actions remain available even if increase evidence expired.
    return decision(true, "decrease", null);
  }
  if (input.killSwitchActive) {
    return decision(false, "increase", "ADS_BUDGET_KILL_SWITCH_ACTIVE");
  }

  const baseline = parseAdsMoney(input.window.baseline);
  if (current.currency !== baseline.currency) {
    return decision(false, "increase", "ADS_BUDGET_CURRENCY_MISMATCH");
  }

  const now = input.now.getTime();
  const startedAt = Date.parse(input.window.startedAt);
  const expiresAt = Date.parse(input.window.expiresAt);
  const observedAt = Date.parse(input.window.observedAt);
  if (
    !Number.isFinite(now)
    || !Number.isFinite(startedAt)
    || !Number.isFinite(expiresAt)
    || !Number.isFinite(observedAt)
    || expiresAt - startedAt !== ADS_BUDGET_WINDOW_DURATION_MS
    || observedAt > now
    || startedAt > now
    || observedAt > startedAt
  ) {
    return decision(false, "unchanged", "ADS_BUDGET_WINDOW_INVALID");
  }
  if (now >= expiresAt) {
    return decision(false, "unchanged", "ADS_BUDGET_WINDOW_EXPIRED");
  }
  if (!isAdsMoneyIncreaseWithinPercent(current, requested, ADS_BUDGET_CHANGE_LIMIT_PERCENT)) {
    return decision(false, "increase", "ADS_BUDGET_OPERATION_LIMIT_EXCEEDED");
  }
  if (exceedsAdsMoneyBaselinePercent(baseline, requested, ADS_BUDGET_CHANGE_LIMIT_PERCENT)) {
    return decision(false, "increase", "ADS_BUDGET_ROLLING_WINDOW_LIMIT_EXCEEDED");
  }
  return decision(true, "increase", null);
}

function decision(
  allowed: boolean,
  direction: AdsBudgetGuardrailDecision["direction"],
  reason: AdsBudgetGuardrailReason | null,
): AdsBudgetGuardrailDecision {
  return Object.freeze({
    allowed,
    direction,
    reason,
    operationLimitPercent: ADS_BUDGET_CHANGE_LIMIT_PERCENT,
    rollingWindowLimitPercent: ADS_BUDGET_CHANGE_LIMIT_PERCENT,
  });
}
