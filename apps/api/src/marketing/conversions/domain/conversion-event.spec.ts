import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERSION_CONSENT_PURPOSE, createConversionDeduplicationIdentity,
  hasSameConversionDeduplicationIdentity, toUnixEventTime, validateConversionEvent,
  type ConversionConsentEvidence, type ConversionEventCandidate,
} from "./conversion-event.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const occurredAt = new Date("2026-11-08T15:00:00.000Z");
const evaluatedAt = new Date("2026-11-08T16:00:00.000Z");
const consent: ConversionConsentEvidence = {
  status: "granted", tenantId, subjectRef: "lead-123",
  purpose: CONVERSION_CONSENT_PURPOSE, evidenceId: "consent-evidence-123",
  policyVersion: "privacy-policy.v1",
  effectiveAt: new Date("2026-11-01T00:00:00.000Z"), expiresAt: null, revokedAt: null,
};
const validEvent: ConversionEventCandidate = {
  tenantId, datasetId: "dataset-42", subjectRef: "lead-123",
  eventName: "Purchase", eventId: "order-2026-00042", occurredAt,
  actionSource: "website", eventSourceUrl: "https://shop.example.com/checkout/complete",
  clientUserAgent: "SyntheticBrowser/1.0",
};

test("allows only matching, effective and currently granted consent evidence", () => {
  const result = validateConversionEvent(validEvent, consent, evaluatedAt);
  assert.equal(result.allowed, true);
  if (!result.allowed) return;
  assert.equal(result.event.actionSource, "website");
  assert.equal(result.event.consentEvidenceId, consent.evidenceId);
  assert.deepEqual(result.event.deduplicationIdentity, {
    datasetId: "dataset-42", eventName: "Purchase", eventId: "order-2026-00042",
  });
});

test("requires a stable event id supplied by the originating action", () => {
  const result = validateConversionEvent({ ...validEvent, eventId: "" }, consent, evaluatedAt);
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.ok(result.reasons.includes("EVENT_ID_INVALID"));
});

test("matches browser and server copies by exact dataset, event name and event id", () => {
  const browser = createConversionDeduplicationIdentity({ datasetId: "dataset-42", eventName: "Purchase", eventId: "order-2026-00042" });
  const server = createConversionDeduplicationIdentity({ datasetId: "dataset-42", eventName: "Purchase", eventId: "order-2026-00042" });
  const otherDataset = createConversionDeduplicationIdentity({ datasetId: "dataset-99", eventName: "Purchase", eventId: "order-2026-00042" });
  const otherEvent = createConversionDeduplicationIdentity({ datasetId: "dataset-42", eventName: "Lead", eventId: "order-2026-00042" });
  assert.equal(hasSameConversionDeduplicationIdentity(browser, server), true);
  assert.equal(hasSameConversionDeduplicationIdentity(browser, otherDataset), false);
  assert.equal(hasSameConversionDeduplicationIdentity(browser, otherEvent), false);
});

test("rejects unknown action sources", () => {
  const result = validateConversionEvent({ ...validEvent, actionSource: "crm_magic" }, consent, evaluatedAt);
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.ok(result.reasons.includes("ACTION_SOURCE_INVALID"));
});

test("requires HTTPS URL and user-agent for website events", () => {
  const missing = validateConversionEvent({ ...validEvent, eventSourceUrl: undefined, clientUserAgent: undefined }, consent, evaluatedAt);
  assert.equal(missing.allowed, false);
  if (!missing.allowed) {
    assert.ok(missing.reasons.includes("EVENT_SOURCE_URL_REQUIRED"));
    assert.ok(missing.reasons.includes("CLIENT_USER_AGENT_REQUIRED"));
  }
  for (const eventSourceUrl of ["http://shop.example.com/checkout", "https://user:secret@shop.example.com/checkout", "not a url"]) {
    const result = validateConversionEvent({ ...validEvent, eventSourceUrl }, consent, evaluatedAt);
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.ok(result.reasons.includes("EVENT_SOURCE_URL_INVALID"));
  }
});

test("fails closed when consent is absent, denied or unknown", () => {
  for (const evidence of [null, { ...consent, status: "denied" as const }, { ...consent, status: "unknown" as const }]) {
    const result = validateConversionEvent(validEvent, evidence, evaluatedAt);
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.ok(result.reasons.includes(evidence === null ? "CONSENT_EVIDENCE_INVALID" : "CONSENT_NOT_GRANTED"));
  }
});

test("rejects evidence scoped to another tenant, subject or purpose", () => {
  for (const evidence of [
    { ...consent, tenantId: "22222222-2222-4222-8222-222222222222" },
    { ...consent, subjectRef: "another-subject" },
    { ...consent, purpose: "crm.contact_management" },
  ]) {
    const result = validateConversionEvent(validEvent, evidence, evaluatedAt);
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.ok(result.reasons.includes("CONSENT_SCOPE_MISMATCH"));
  }
});

test("rejects future-effective consent for a conversion that occurred before consent", () => {
  const result = validateConversionEvent(
    validEvent, { ...consent, effectiveAt: new Date("2026-11-09T00:00:00Z") }, evaluatedAt,
  );
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.ok(result.reasons.includes("CONSENT_NOT_EFFECTIVE"));
});

test("rejects consent that expired after the event but before server dispatch", () => {
  const result = validateConversionEvent(
    validEvent, { ...consent, expiresAt: new Date("2026-11-08T15:30:00Z") }, evaluatedAt,
  );
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.ok(result.reasons.includes("CONSENT_EXPIRED"));
});

test("rejects consent revoked after the event but before server dispatch", () => {
  const result = validateConversionEvent(
    validEvent, { ...consent, revokedAt: new Date("2026-11-08T15:30:00Z") }, evaluatedAt,
  );
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.ok(result.reasons.includes("CONSENT_REVOKED"));
});

test("rejects future event times and invalid evaluation clocks", () => {
  const futureEvent = validateConversionEvent(
    { ...validEvent, occurredAt: new Date("2026-11-08T17:00:00Z") }, consent, evaluatedAt,
  );
  assert.equal(futureEvent.allowed, false);
  if (!futureEvent.allowed) assert.ok(futureEvent.reasons.includes("EVENT_TIME_IN_FUTURE"));

  const invalidClock = validateConversionEvent(validEvent, consent, new Date(Number.NaN));
  assert.equal(invalidClock.allowed, false);
  if (!invalidClock.allowed) assert.ok(invalidClock.reasons.includes("VALIDATION_TIME_INVALID"));
});

test("converts event time to Unix seconds", () => {
  assert.equal(toUnixEventTime(occurredAt), 1_794_150_000);
  assert.throws(() => toUnixEventTime(new Date(Number.NaN)));
});
