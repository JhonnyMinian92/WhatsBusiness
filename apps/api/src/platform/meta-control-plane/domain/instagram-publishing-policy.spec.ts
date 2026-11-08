import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateInstagramPublication,
  transitionInstagramPublication,
  validateInstagramReelMetadata,
  type InstagramPublicationPreflight,
  type InstagramPublicationState,
  type InstagramReelMetadata,
} from "./instagram-publishing-policy.js";
import type { MetaCapabilityDecision } from "./meta-capability.js";

const capability: MetaCapabilityDecision = {
  capabilityKey: "instagram.media_publish.instagram_login",
  product: "instagram", operationKey: "media_publish", apiVersion: "v27.0",
  state: "available", available: true, evaluatedAt: "2026-11-08T16:00:00.000Z", reasons: [],
};
function preflight(overrides: Partial<InstagramPublicationPreflight> = {}): InstagramPublicationPreflight {
  return {
    mediaKind: "feed", accountType: "business", state: "ready", containerStatus: "finished",
    capability, humanApproved: true, idempotencyKey: "instagram-publish-123456", ...overrides,
  };
}

test("permite solo container terminado, capability disponible y aprobación humana", () => {
  assert.deepEqual(evaluateInstagramPublication(preflight()), { allowed: true, issues: [] });
});
test("no publica si la capability está desconocida", () => {
  const unknown = { ...capability, state: "unknown" as const, available: false };
  const result = evaluateInstagramPublication(preflight({ capability: unknown }));
  assert.equal(result.allowed, false);
  assert.ok(result.issues.some((issue) => issue.certainty === "unknown"));
});
test("Stories requieren Business y operación específica", () => {
  const creator = evaluateInstagramPublication(preflight({
    mediaKind: "story", accountType: "creator",
    capability: { ...capability, operationKey: "stories_publish" },
  }));
  assert.ok(creator.issues.some((issue) => issue.code === "INSTAGRAM_STORY_PUBLISH_REQUIRES_BUSINESS"));
  const business = evaluateInstagramPublication(preflight({
    mediaKind: "story", capability: { ...capability, operationKey: "stories_publish" },
  }));
  assert.equal(business.allowed, true);
});
test("no publica mientras Meta procesa el container", () => {
  const result = evaluateInstagramPublication(preflight({ state: "container_processing", containerStatus: "in_progress" }));
  assert.ok(result.issues.some((issue) => issue.code === "INSTAGRAM_CONTAINER_STATUS_UNKNOWN_OR_PENDING"));
});
test("requiere Idempotency-Key y aprobación", () => {
  const result = evaluateInstagramPublication(preflight({ humanApproved: false, idempotencyKey: "short" }));
  assert.ok(result.issues.some((issue) => issue.code === "INSTAGRAM_PUBLICATION_APPROVAL_REQUIRED"));
  assert.ok(result.issues.some((issue) => issue.code === "INSTAGRAM_PUBLICATION_IDEMPOTENCY_KEY_INVALID"));
});
test("un timeout pasa a outcome_unknown y requiere reconciliación", () => {
  const state = transitionInstagramPublication("publishing", "publish_timed_out");
  assert.equal(state, "outcome_unknown");
  assert.ok(evaluateInstagramPublication(preflight({ state })).issues.some((issue) => issue.code === "INSTAGRAM_PUBLICATION_RECONCILIATION_REQUIRED"));
});
test("solo la reconciliación explícita puede confirmar el resultado remoto", () => {
  assert.equal(transitionInstagramPublication("outcome_unknown", "reconciliation_confirmed_absent"), "ready");
  assert.equal(transitionInstagramPublication("outcome_unknown", "reconciliation_found_published"), "published");
  assert.throws(
    () => transitionInstagramPublication("outcome_unknown", "publish_started" as never),
    { message: "INSTAGRAM_PUBLICATION_TRANSITION_NOT_ALLOWED" },
  );
});
test("separa el ciclo del container del comando publish y bloquea mutaciones terminales", () => {
  assert.equal(transitionInstagramPublication("draft", "container_created"), "container_processing");
  assert.equal(transitionInstagramPublication("container_processing", "container_ready"), "ready");
  assert.equal(transitionInstagramPublication("ready", "publish_started"), "publishing");
  assert.equal(transitionInstagramPublication("publishing", "publish_succeeded"), "published");
  assert.throws(
    () => transitionInstagramPublication("published", "publish_started"),
    { message: "INSTAGRAM_PUBLICATION_TRANSITION_NOT_ALLOWED" },
  );
});
test("valida los límites de metadatos Reels de la colección oficial", () => {
  const valid: InstagramReelMetadata = {
    container: "mp4", videoCodec: "h264", audioCodec: "aac", audioSampleRateHz: 48_000,
    frameRate: 30, widthPixels: 1_080, durationSeconds: 60, fileSizeBytes: 100_000_000,
    videoBitrateMbps: 10, audioBitrateKbps: 128,
  };
  assert.deepEqual(validateInstagramReelMetadata(valid), []);
  const invalid = validateInstagramReelMetadata({
    ...valid, container: "other", frameRate: 10, durationSeconds: 1_000, fileSizeBytes: 1_500_000_000,
  });
  assert.ok(invalid.includes("REEL_CONTAINER_UNSUPPORTED"));
  assert.ok(invalid.includes("REEL_FRAME_RATE_OUT_OF_RANGE"));
  assert.ok(invalid.includes("REEL_DURATION_OUT_OF_RANGE"));
  assert.ok(invalid.includes("REEL_FILE_SIZE_OUT_OF_RANGE"));
});
