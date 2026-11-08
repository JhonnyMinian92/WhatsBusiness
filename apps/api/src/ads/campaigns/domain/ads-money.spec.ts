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
  const current = parseAdsMoney({ amount: "100.000001", currency: "USD" });
  const requested = parseAdsMoney({ amount: "120.000001", currency: "USD" });
  assert.equal(isAdsMoneyIncreaseWithinPercent(current, requested, 20), true);
  assert.equal(compareAdsMoney(addAdsMoney(current, parseAdsMoney({ amount: "0.000001", currency: "USD" })), requested), -1);
});

test("Ads money rejects numbers, exponent notation, negative and excessive precision", () => {
  for (const value of [
    { amount: 100, currency: "USD" },
    { amount: "1e3", currency: "USD" },
    { amount: "-1", currency: "USD" },
    { amount: "1.0000001", currency: "USD" },
    { amount: "01", currency: "USD" },
    { amount: "1", currency: "US" },
  ]) assert.throws(() => parseAdsMoney(value));
});

test("Ads money treats the operation boundary as inclusive and rejects the next micro-unit", () => {
  const baseline = parseAdsMoney({ amount: "100", currency: "USD" });
  assert.equal(isAdsMoneyIncreaseWithinPercent(baseline, parseAdsMoney({ amount: "120", currency: "USD" }), 20), true);
  assert.equal(isAdsMoneyIncreaseWithinPercent(baseline, parseAdsMoney({ amount: "120.000001", currency: "USD" }), 20), false);
  assert.equal(exceedsAdsMoneyBaselinePercent(baseline, parseAdsMoney({ amount: "120", currency: "USD" }), 20), false);
  assert.equal(exceedsAdsMoneyBaselinePercent(baseline, parseAdsMoney({ amount: "120.000001", currency: "USD" }), 20), true);
});
