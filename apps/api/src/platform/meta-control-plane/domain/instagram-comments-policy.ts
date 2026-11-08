import type { MetaCapabilityDecision } from "./meta-capability.js";
import type { InstagramLoginMode } from "./instagram-capability-catalog.js";

export type InstagramCommentAction = "reply" | "hide" | "unhide" | "delete";
export type InstagramCommentState = "visible" | "hidden" | "deleted" | "unknown";
export type InstagramMediaOwnership = "owned" | "not_owned" | "unknown";

export interface InstagramCommentActionInput {
  readonly loginMode: InstagramLoginMode;
  readonly action: InstagramCommentAction;
  readonly capability: Pick<MetaCapabilityDecision, "capabilityKey" | "product" | "operationKey" | "state" | "available">;
  readonly mediaOwnership: InstagramMediaOwnership;
  readonly commentState: InstagramCommentState;
  readonly replyText?: string;
  readonly idempotencyKey: string;
  readonly humanApproved: boolean;
}

export interface InstagramCommentPolicyIssue {
  readonly code: string;
  readonly certainty: "denied" | "unknown";
  readonly explanation: string;
}

export interface InstagramCommentPolicyDecision {
  readonly allowed: boolean;
  readonly noOp: boolean;
  readonly issues: readonly InstagramCommentPolicyIssue[];
}

function issue(code: string, certainty: "denied" | "unknown", explanation: string): InstagramCommentPolicyIssue {
  return Object.freeze({ code, certainty, explanation });
}

/** Domain preflight; transport must map the action to a versioned Meta endpoint. */
export function evaluateInstagramCommentAction(
  input: InstagramCommentActionInput,
): InstagramCommentPolicyDecision {
  const issues: InstagramCommentPolicyIssue[] = [];
  if (input.capability.capabilityKey !== "instagram.comments_manage." + input.loginMode
    || input.capability.product !== "instagram" || input.capability.operationKey !== "comments_manage") {
    issues.push(issue("INSTAGRAM_COMMENT_CAPABILITY_MISMATCH", "denied",
      "La capability evaluada no corresponde a la gestión de comentarios."));
  } else if (input.capability.state !== "available" || input.capability.available !== true) {
    issues.push(issue("INSTAGRAM_COMMENT_CAPABILITY_NOT_AVAILABLE",
      input.capability.state === "unknown" ? "unknown" : "denied",
      "No existe evidencia vigente que autorice la gestión de comentarios."));
  }

  if (input.mediaOwnership === "not_owned") {
    issues.push(issue("INSTAGRAM_COMMENT_MEDIA_NOT_OWNED", "denied",
      "La cuenta conectada no acredita propiedad del media al que pertenece el comentario."));
  } else if (input.mediaOwnership === "unknown") {
    issues.push(issue("INSTAGRAM_COMMENT_MEDIA_OWNERSHIP_UNKNOWN", "unknown",
      "Debe verificarse la propiedad del media antes de modificar sus comentarios."));
  }

  if (input.idempotencyKey.trim().length < 16) {
    issues.push(issue("INSTAGRAM_COMMENT_IDEMPOTENCY_KEY_INVALID", "denied",
      "Toda mutación de comentarios requiere una clave de idempotencia estable."));
  }

  if (input.action === "delete" && !input.humanApproved) {
    issues.push(issue("INSTAGRAM_COMMENT_DELETE_APPROVAL_REQUIRED", "denied",
      "Eliminar un comentario requiere aprobación humana explícita."));
  }
  if (input.commentState === "deleted" && input.action === "delete") {
    return Object.freeze({ allowed: issues.length === 0, noOp: true, issues: Object.freeze(issues) });
  }
  if (input.commentState === "deleted") {
    issues.push(issue("INSTAGRAM_COMMENT_ALREADY_DELETED", "denied",
      "Un comentario eliminado es terminal y no puede volver a modificarse."));
  } else if (input.commentState === "unknown") {
    issues.push(issue("INSTAGRAM_COMMENT_STATE_UNKNOWN", "unknown",
      "Debe consultarse el estado actual del comentario antes de modificarlo."));
  } else if (input.action === "reply") {
    if (input.commentState !== "visible") {
      issues.push(issue("INSTAGRAM_COMMENT_REPLY_REQUIRES_VISIBLE_COMMENT", "denied",
        "Solo se puede responder a un comentario visible y vigente."));
    }
    if (typeof input.replyText !== "string" || input.replyText.trim().length === 0) {
      issues.push(issue("INSTAGRAM_COMMENT_REPLY_TEXT_REQUIRED", "denied",
        "La respuesta al comentario no puede estar vacía."));
    }
  } else if (input.action === "hide" && input.commentState === "hidden") {
    return Object.freeze({ allowed: issues.length === 0, noOp: true, issues: Object.freeze(issues) });
  } else if (input.action === "unhide" && input.commentState === "visible") {
    return Object.freeze({ allowed: issues.length === 0, noOp: true, issues: Object.freeze(issues) });
  }

  return Object.freeze({ allowed: issues.length === 0, noOp: false, issues: Object.freeze(issues) });
}

export type InstagramCommentModerationEvent = "hide_succeeded" | "unhide_succeeded" | "delete_succeeded";
const COMMENT_TRANSITIONS: Readonly<Record<InstagramCommentState, Readonly<Record<string, InstagramCommentState>>>> = {
  visible: { hide_succeeded: "hidden", delete_succeeded: "deleted" },
  hidden: { unhide_succeeded: "visible", delete_succeeded: "deleted" },
  deleted: {},
  unknown: {},
};

export function transitionInstagramCommentState(
  current: InstagramCommentState,
  event: InstagramCommentModerationEvent,
): InstagramCommentState {
  const next = COMMENT_TRANSITIONS[current][event];
  if (!next) throw new Error("INSTAGRAM_COMMENT_TRANSITION_NOT_ALLOWED");
  return next;
}
