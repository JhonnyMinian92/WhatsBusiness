import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateInstagramCommentAction,
  transitionInstagramCommentState,
  type InstagramCommentActionInput,
} from "./instagram-comments-policy.js";
import type { MetaCapabilityDecision } from "./meta-capability.js";

const capability: MetaCapabilityDecision = {
  capabilityKey: "instagram.comments_manage.instagram_login",
  product: "instagram", operationKey: "comments_manage", apiVersion: "v27.0",
  state: "available", available: true, evaluatedAt: "2026-11-08T16:00:00.000Z", reasons: [],
};
function input(overrides: Partial<InstagramCommentActionInput> = {}): InstagramCommentActionInput {
  return {
    loginMode: "instagram_login", action: "reply", capability,
    mediaOwnership: "owned", commentState: "visible",
    replyText: "Gracias por tu comentario.",
    idempotencyKey: "instagram-comment-123456", humanApproved: false, ...overrides,
  };
}

test("permite responder a un comentario visible del media propio con capability disponible", () => {
  const result = evaluateInstagramCommentAction(input());
  assert.equal(result.allowed, true);
  assert.equal(result.noOp, false);
  assert.deepEqual(result.issues, []);
});
test("bloquea una capability desconocida y una cuenta sin permisos", () => {
  const unknown = evaluateInstagramCommentAction(input({
    capability: { ...capability, state: "unknown", available: false },
  }));
  assert.equal(unknown.allowed, false);
  assert.ok(unknown.issues.some(item => item.certainty === "unknown"));
  const denied = evaluateInstagramCommentAction(input({
    capability: { ...capability, state: "unavailable", available: false },
  }));
  assert.equal(denied.allowed, false);
});
test("falla cerrado si la propiedad del media es ajena o desconocida", () => {
  const foreign = evaluateInstagramCommentAction(input({ mediaOwnership: "not_owned" }));
  assert.ok(foreign.issues.some(item => item.code === "INSTAGRAM_COMMENT_MEDIA_NOT_OWNED"));
  const unknown = evaluateInstagramCommentAction(input({ mediaOwnership: "unknown" }));
  assert.equal(unknown.allowed, false);
  assert.ok(unknown.issues.some(item => item.certainty === "unknown"));
});
test("oculta y restaura comentarios solo desde el estado opuesto", () => {
  assert.equal(evaluateInstagramCommentAction(input({ action: "hide" })).allowed, true);
  assert.equal(evaluateInstagramCommentAction(input({ action: "unhide", commentState: "hidden" })).allowed, true);
});
test("repetir una transición ya alcanzada se convierte en no-op idempotente", () => {
  const hide = evaluateInstagramCommentAction(input({ action: "hide", commentState: "hidden" }));
  const unhide = evaluateInstagramCommentAction(input({ action: "unhide", commentState: "visible" }));
  assert.equal(hide.allowed, true); assert.equal(hide.noOp, true);
  assert.equal(unhide.allowed, true); assert.equal(unhide.noOp, true);
});
test("requiere texto para responder y no altera comentarios eliminados", () => {
  const empty = evaluateInstagramCommentAction(input({ replyText: "  " }));
  assert.ok(empty.issues.some(item => item.code === "INSTAGRAM_COMMENT_REPLY_TEXT_REQUIRED"));
  const deleted = evaluateInstagramCommentAction(input({ commentState: "deleted" }));
  assert.equal(deleted.allowed, false);
  assert.ok(deleted.issues.some(item => item.code === "INSTAGRAM_COMMENT_ALREADY_DELETED"));
});
test("toda mutación exige idempotency key y estado conocido", () => {
  const shortKey = evaluateInstagramCommentAction(input({ idempotencyKey: "short" }));
  assert.ok(shortKey.issues.some(item => item.code === "INSTAGRAM_COMMENT_IDEMPOTENCY_KEY_INVALID"));
  const unknownState = evaluateInstagramCommentAction(input({ commentState: "unknown" }));
  assert.ok(unknownState.issues.some(item => item.code === "INSTAGRAM_COMMENT_STATE_UNKNOWN"));
});
test("la máquina de estados evita revivir comentarios eliminados", () => {
  assert.equal(transitionInstagramCommentState("visible", "hide_succeeded"), "hidden");
  assert.equal(transitionInstagramCommentState("hidden", "unhide_succeeded"), "visible");
  assert.equal(transitionInstagramCommentState("hidden", "delete_succeeded"), "deleted");
  assert.throws(() => transitionInstagramCommentState("deleted", "unhide_succeeded"),
    { message: "INSTAGRAM_COMMENT_TRANSITION_NOT_ALLOWED" });
});


test("no acepta una decisión de capability correspondiente a otro login mode", () => {
  const mismatch = evaluateInstagramCommentAction(input({ loginMode: "facebook_login" }));
  assert.equal(mismatch.allowed, false);
  assert.ok(mismatch.issues.some(item => item.code === "INSTAGRAM_COMMENT_CAPABILITY_MISMATCH"));
});

test("eliminar un comentario exige aprobación humana e idempotencia", () => {
  const blocked = evaluateInstagramCommentAction(input({ action: "delete" }));
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.issues.some(item => item.code === "INSTAGRAM_COMMENT_DELETE_APPROVAL_REQUIRED"));
  const approved = evaluateInstagramCommentAction(input({ action: "delete", humanApproved: true }));
  assert.equal(approved.allowed, true);
  assert.equal(transitionInstagramCommentState("visible", "delete_succeeded"), "deleted");
});
