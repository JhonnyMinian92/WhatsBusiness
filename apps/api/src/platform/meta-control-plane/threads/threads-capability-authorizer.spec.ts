import assert from "node:assert/strict";
import test from "node:test";
import { MetaCapabilityEvaluator } from "../domain/meta-capability-evaluator.js";
import type { MetaCapabilityEvidence, MetaEvidence } from "../domain/meta-capability.js";
import {
  EvaluatedThreadsCapabilityAuthorizer,
  type ThreadsCapabilityEvidenceProvider,
} from "./threads-capability-authorizer.js";

const now = new Date("2026-11-08T18:00:00.000Z");

function observed<T>(value: T): MetaEvidence<T> {
  return {
    state: "observed",
    value,
    source: "meta_api",
    observedAt: "2026-11-08T17:30:00.000Z",
    validUntil: "2026-11-08T19:00:00.000Z",
  };
}

function evidence(scopes: readonly string[]): MetaCapabilityEvidence {
  return {
    actorAuthorization: observed(true),
    tenantPolicy: observed(true),
    purpose: observed(true),
    assetGrant: observed(true),
    accountEligibility: observed(true),
    supportedApiVersions: observed(["v1.0"]),
    oauthScopes: observed(scopes),
    assetTasks: observed([]),
    entitlementKeys: observed([]),
    appMode: observed("live"),
    appReview: observed("approved"),
    accessTier: observed("full"),
    accountType: observed("business"),
    country: observed("EC"),
    consentAndLegalBasis: observed(true),
    explicitApproval: observed(true),
  };
}

class StubEvidence implements ThreadsCapabilityEvidenceProvider {
  current: MetaCapabilityEvidence = evidence(["threads_basic", "threads_content_publish"]);
  async load(): Promise<MetaCapabilityEvidence> {
    return this.current;
  }
}

test("maps Threads-specific OAuth scopes into the shared versioned Meta capability evaluator", async () => {
  const provider = new StubEvidence();
  const authorizer = new EvaluatedThreadsCapabilityAuthorizer(new MetaCapabilityEvaluator(), provider, "v1.0", () => now);
  const decision = await authorizer.authorize({
    tenantId: "11111111-1111-4111-8111-111111111111",
    profileId: "profile-1",
    capability: "posts.publish",
  });
  assert.equal(decision.state, "available");
  assert.equal(decision.apiVersion, "v1.0");
  assert.deepEqual(decision.reasonCodes, []);
});

test("denies a publishing capability when threads_content_publish is missing", async () => {
  const provider = new StubEvidence();
  provider.current = evidence(["threads_basic"]);
  const authorizer = new EvaluatedThreadsCapabilityAuthorizer(new MetaCapabilityEvaluator(), provider, "v1.0", () => now);
  const decision = await authorizer.authorize({
    tenantId: "11111111-1111-4111-8111-111111111111",
    profileId: "profile-1",
    capability: "posts.publish",
  });
  assert.equal(decision.state, "unavailable");
  assert.ok(decision.reasonCodes.includes("OAUTH_SCOPE_MISSING"));
});

test("keeps missing Threads consent evidence as unknown rather than allowing the operation", async () => {
  const provider = new StubEvidence();
  provider.current = { ...evidence(["threads_basic"]), consentAndLegalBasis: { state: "unknown" } };
  const authorizer = new EvaluatedThreadsCapabilityAuthorizer(new MetaCapabilityEvaluator(), provider, "v1.0", () => now);
  const decision = await authorizer.authorize({
    tenantId: "11111111-1111-4111-8111-111111111111",
    profileId: "profile-1",
    capability: "profile.read",
  });
  assert.equal(decision.state, "unknown");
  assert.ok(decision.reasonCodes.includes("CONSENT_EVIDENCE_UNKNOWN"));
});
