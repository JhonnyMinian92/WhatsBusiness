import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAdsExternalExecution, type AdsExecutionEvidence } from "./ads-execution-guard.js";

const now = new Date("2026-11-08T17:00:00.000Z");
const evidence: AdsExecutionEvidence = {
  action: "publish",
  actorAuthorized: true,
  killSwitchActive: false,
  assetGrantStatus: "granted",
  capabilityStatus: "available",
  capabilityValidUntil: "2026-11-08T17:10:00.000Z",
  approvalStatus: "approved",
  approvalHashMatches: true,
  approvalExpiresAt: "2026-11-08T17:10:00.000Z",
  requesterId: "requester",
  approverIds: ["approver-one", "approver-two"],
  requiredApprovals: 2,
  now,
};

test("publishing requires verified actor, asset, capability and exact two-person approval", () => {
  assert.deepEqual(evaluateAdsExternalExecution(evidence), { allowed: true, reasons: [] });
});

test("kill switch blocks publishing but permits a verified pause command", () => {
  const blocked = evaluateAdsExternalExecution({ ...evidence, killSwitchActive: true });
  assert.ok(blocked.reasons.includes("ADS_KILL_SWITCH_ACTIVE"));
  const pause = evaluateAdsExternalExecution({
    ...evidence,
    action: "pause",
    killSwitchActive: true,
    approvalStatus: "unknown",
    approvalHashMatches: false,
    approvalExpiresAt: null,
    requesterId: null,
    approverIds: [],
    requiredApprovals: 0,
  });
  assert.equal(pause.allowed, true);
});

test("missing or stale asset/capability/approval evidence denies execution", () => {
  const result = evaluateAdsExternalExecution({
    ...evidence,
    assetGrantStatus: "unknown",
    capabilityValidUntil: "2026-11-08T16:59:59.000Z",
    approvalHashMatches: false,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("ADS_ASSET_GRANT_NOT_VERIFIED"));
  assert.ok(result.reasons.includes("ADS_CAPABILITY_NOT_CURRENTLY_AVAILABLE"));
  assert.ok(result.reasons.includes("ADS_APPROVAL_ACTION_BINDING_MISMATCH"));
});

test("requesters cannot approve their own campaign and approval quorum needs distinct actors", () => {
  const result = evaluateAdsExternalExecution({
    ...evidence,
    approverIds: ["requester", "approver-two"],
  });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("ADS_INDEPENDENT_APPROVAL_QUORUM_NOT_MET"));
});
