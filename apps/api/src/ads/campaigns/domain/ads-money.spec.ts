import assert from "node:assert/strict";
import test from "node:test";
import {
  addAdsMoney,
  compareAdsMoney,
  exceedsAdsMoneyBaselinePercent,
  isAdsMoneyIncreaseWithinPercent,
  parseAdsMoney,
} from "./ads-money.js";

test("Ads money uses exact decimal arithmetic without floating-point rounding", () => {
  const current = parseAdsMoney({ amount: "100.01", currency: "USD" });
  const requested = parseAdsMoney({ amount: "120.01", currency: "USD" });
  assert.equal(isAdsMoneyIncreaseWithinPercent(current, requested, 20), true);
  assert.equal(compareAdsMoney(addAdsMoney(current, parseAdsMoney({ amount: "0.01", currency: "USD" })), requested), -1);
});

test("Ads money rejects numbers, exponent notation, negative and excessive precision", () => {
  for (const value of [
    { amount: 100, currency: "USD" },
    { amount: "1e3", currency: "USD" },
    { amount: "-1", currency: "USD" },
    { amount: "1.0000001", currency: "USD" },
    { amount: "1.001", currency: "USD" },
    { amount: "1.01", currency: "JPY" },
    { amount: "01", currency: "USD" },
    { amount: "1", currency: "US" },
  ]) assert.throws(() => parseAdsMoney(value));
});

test("Ads money treats the operation boundary as inclusive and rejects the next minor currency unit", () => {
  const baseline = parseAdsMoney({ amount: "100", currency: "USD" });
  assert.equal(isAdsMoneyIncreaseWithinPercent(baseline, parseAdsMoney({ amount: "120", currency: "USD" }), 20), true);
  assert.equal(isAdsMoneyIncreaseWithinPercent(baseline, parseAdsMoney({ amount: "120.01", currency: "USD" }), 20), false);
  assert.equal(exceedsAdsMoneyBaselinePercent(baseline, parseAdsMoney({ amount: "120", currency: "USD" }), 20), false);
  assert.equal(exceedsAdsMoneyBaselinePercent(baseline, parseAdsMoney({ amount: "120.01", currency: "USD" }), 20), true);
});

test("Ads money respects each ISO 4217 currency minor-unit precision", () => {
  assert.equal(parseAdsMoney({ amount: "10", currency: "JPY" }).amount, "10");
  assert.equal(parseAdsMoney({ amount: "10.01", currency: "USD" }).amount, "10.01");
  assert.equal(parseAdsMoney({ amount: "10.001", currency: "KWD" }).amount, "10.001");
  assert.throws(
    () => parseAdsMoney({ amount: "10.01", currency: "JPY" }),
    (error: unknown) => error instanceof Error
      && (error as { code?: string }).code === "ADS_MONEY_CURRENCY_PRECISION_INVALID",
  );
});
