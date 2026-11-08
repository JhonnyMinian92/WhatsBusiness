import assert from "node:assert/strict";
import test from "node:test";
import { createConversionMeasurementReport } from "./conversion-measurement-report.js";

const event = {
  datasetId: "dataset-42", eventName: "Purchase", eventId: "order-2026-00042",
  delivery: "not_submitted" as const, deduplication: "not_checked" as const,
};

test("reports match quality unavailable until a provider observation exists", () => {
  const report = createConversionMeasurementReport({
    ...event,
    matchQuality: { state: "unavailable", reason: "integration_not_configured" },
    attribution: { state: "not_reported" },
  });
  assert.deepEqual(report.matchQuality, { state: "unavailable", reason: "integration_not_configured" });
  assert.deepEqual(report.attribution, { state: "not_reported" });
});

test("preserves provider-reported match quality without estimating a local score", () => {
  const observedAt = new Date("2026-11-08T16:00:00.000Z");
  const report = createConversionMeasurementReport({
    ...event,
    matchQuality: { state: "provider_reported", provider: "meta", value: 6.5, observedAt },
    attribution: { state: "not_reported" },
  });
  assert.equal(report.matchQuality.state, "provider_reported");
  if (report.matchQuality.state === "provider_reported") {
    assert.equal(report.matchQuality.value, 6.5);
    assert.equal(report.matchQuality.observedAt, observedAt);
  }
});

test("keeps provider attribution separate from delivery and deduplication", () => {
  const report = createConversionMeasurementReport({
    ...event, delivery: "accepted_by_provider", deduplication: "unique_local",
    matchQuality: { state: "unavailable", reason: "not_reported" },
    attribution: {
      state: "provider_reported", provider: "meta", attributedConversions: 3,
      windowStart: new Date("2026-11-01T00:00:00Z"),
      windowEnd: new Date("2026-11-07T23:59:59Z"),
      observedAt: new Date("2026-11-08T16:00:00Z"),
    },
  });
  assert.equal(report.delivery, "accepted_by_provider");
  assert.equal(report.deduplication, "unique_local");
  assert.equal(report.attribution.state, "provider_reported");
  if (report.attribution.state === "provider_reported") assert.equal(report.attribution.attributedConversions, 3);
});

test("rejects malformed provider reports", () => {
  assert.throws(() => createConversionMeasurementReport({
    ...event,
    matchQuality: { state: "provider_reported", provider: "meta", value: Number.NaN, observedAt: new Date() },
    attribution: { state: "not_reported" },
  }));
  assert.throws(() => createConversionMeasurementReport({
    ...event, matchQuality: { state: "unavailable", reason: "not_reported" },
    attribution: {
      state: "provider_reported", provider: "meta", attributedConversions: -1,
      windowStart: new Date("2026-11-08T00:00:00Z"),
      windowEnd: new Date("2026-11-01T00:00:00Z"),
      observedAt: new Date("2026-11-08T16:00:00Z"),
    },
  }));
});
