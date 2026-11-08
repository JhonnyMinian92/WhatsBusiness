export interface AdsMoney {
  readonly amount: string;
  readonly currency: string;
}

export class AdsMoneyValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AdsMoneyValidationError";
  }
}

const SCALE = 6;
const SCALE_FACTOR = 10n ** BigInt(SCALE);
const AMOUNT_PATTERN = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Parses budget values without ever converting money to a JavaScript float. */
export function parseAdsMoney(value: unknown): AdsMoney {
  if (!isPlainRecord(value) || Object.keys(value).some((key) => !["amount", "currency"].includes(key))) {
    throw new AdsMoneyValidationError("ADS_MONEY_INVALID");
  }
  const amount = value["amount"];
  const currency = value["currency"];
  if (typeof amount !== "string" || !AMOUNT_PATTERN.test(amount)) {
    throw new AdsMoneyValidationError("ADS_MONEY_AMOUNT_INVALID");
  }
  if (typeof currency !== "string" || !CURRENCY_PATTERN.test(currency)) {
    throw new AdsMoneyValidationError("ADS_MONEY_CURRENCY_INVALID");
  }
  const units = toUnits(amount);
  if (units <= 0n) throw new AdsMoneyValidationError("ADS_MONEY_MUST_BE_POSITIVE");
  return Object.freeze({ amount: fromUnits(units), currency });
}

export function compareAdsMoney(left: AdsMoney, right: AdsMoney): -1 | 0 | 1 {
  assertSameCurrency(left, right);
  const a = toUnits(left.amount);
  const b = toUnits(right.amount);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addAdsMoney(left: AdsMoney, right: AdsMoney): AdsMoney {
  assertSameCurrency(left, right);
  return Object.freeze({
    amount: fromUnits(toUnits(left.amount) + toUnits(right.amount)),
    currency: left.currency,
  });
}

export function subtractAdsMoney(left: AdsMoney, right: AdsMoney): AdsMoney {
  assertSameCurrency(left, right);
  const result = toUnits(left.amount) - toUnits(right.amount);
  if (result < 0n) throw new AdsMoneyValidationError("ADS_MONEY_NEGATIVE_RESULT");
  return Object.freeze({ amount: fromUnits(result), currency: left.currency });
}

export function isAdsMoneyIncreaseWithinPercent(
  current: AdsMoney,
  requested: AdsMoney,
  maximumPercent: number,
): boolean {
  assertSameCurrency(current, requested);
  if (!Number.isSafeInteger(maximumPercent) || maximumPercent < 0 || maximumPercent > 100) {
    throw new AdsMoneyValidationError("ADS_MONEY_PERCENT_INVALID");
  }
  const currentUnits = toUnits(current.amount);
  const requestedUnits = toUnits(requested.amount);
  if (requestedUnits <= currentUnits) return true;
  return (requestedUnits - currentUnits) * 100n <= currentUnits * BigInt(maximumPercent);
}

export function exceedsAdsMoneyBaselinePercent(
  baseline: AdsMoney,
  requested: AdsMoney,
  maximumPercent: number,
): boolean {
  assertSameCurrency(baseline, requested);
  if (!Number.isSafeInteger(maximumPercent) || maximumPercent < 0 || maximumPercent > 100) {
    throw new AdsMoneyValidationError("ADS_MONEY_PERCENT_INVALID");
  }
  const baselineUnits = toUnits(baseline.amount);
  const requestedUnits = toUnits(requested.amount);
  return requestedUnits > baselineUnits
    && (requestedUnits - baselineUnits) * 100n > baselineUnits * BigInt(maximumPercent);
}

export function isAdsMoneyEqual(left: AdsMoney, right: AdsMoney): boolean {
  return compareAdsMoney(left, right) === 0;
}

function assertSameCurrency(left: AdsMoney, right: AdsMoney): void {
  if (left.currency !== right.currency || !CURRENCY_PATTERN.test(left.currency)) {
    throw new AdsMoneyValidationError("ADS_MONEY_CURRENCY_MISMATCH");
  }
}

function toUnits(amount: string): bigint {
  if (!AMOUNT_PATTERN.test(amount)) throw new AdsMoneyValidationError("ADS_MONEY_AMOUNT_INVALID");
  const [integerPart, fractionalPart = ""] = amount.split(".");
  return BigInt(integerPart) * SCALE_FACTOR
    + BigInt((fractionalPart + "0".repeat(SCALE)).slice(0, SCALE));
}

function fromUnits(units: bigint): string {
  const integerPart = (units / SCALE_FACTOR).toString();
  const fractionalPart = (units % SCALE_FACTOR).toString().padStart(SCALE, "0").replace(/0+$/, "");
  return fractionalPart.length === 0 ? integerPart : integerPart + "." + fractionalPart;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
