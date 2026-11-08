import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedAdsCampaignCommands,
  transitionAdsCampaign,
} from "./campaign-lifecycle.js";

test("campaign lifecycle requires validation and independent approval before submission", () => {
  assert.equal(transitionAdsCampaign("draft", "validation_passed").to, "validated");
  assert.equal(transitionAdsCampaign("validated", "request_approval").to, "approval_pending");
  assert.equal(transitionAdsCampaign("approval_pending", "approval_granted").to, "approved");
  assert.equal(transitionAdsCampaign("approved", "queue_submission").to, "submission_queued");
});

test("campaign cannot bypass validation, approval or the durable submission stage", () => {
  assert.throws(() => transitionAdsCampaign("draft", "request_approval"));
  assert.throws(() => transitionAdsCampaign("validated", "queue_submission"));
  assert.throws(() => transitionAdsCampaign("approval_pending", "queue_submission"));
});

test("uncertain provider outcomes require reconciliation, not blind retry", () => {
  assert.equal(transitionAdsCampaign("submission_queued", "provider_unknown").to, "unknown");
  assert.equal(allowedAdsCampaignCommands("unknown").includes("queue_submission"), false);
  assert.equal(transitionAdsCampaign("unknown", "provider_active").to, "active");
});

test("pause is a separate auditable transition and resumption requires a fresh draft", () => {
  assert.equal(transitionAdsCampaign("active", "request_pause").to, "pause_requested");
  assert.equal(transitionAdsCampaign("pause_requested", "provider_paused").to, "paused");
  assert.equal(transitionAdsCampaign("paused", "revise_draft").to, "draft");
});
