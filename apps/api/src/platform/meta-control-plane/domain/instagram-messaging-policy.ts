import type { MetaCapabilityDecision } from "./meta-capability.js";
import { getInstagramCapabilityProfile, type InstagramLoginMode } from "./instagram-capability-catalog.js";

export type InstagramConversationKind = "direct" | "group" | "unknown";
export type InstagramRecipientInitiation = "yes" | "no" | "unknown";
export type InstagramMessageContentKind = "text" | "shared_media";
export type InstagramMediaOwnershipEvidence = "owned" | "not_owned" | "unknown" | "not_applicable";
export type InstagramRequestVisibility =
  | "within_api_window" | "possibly_omitted_by_provider" | "not_applicable" | "unknown";

export interface InstagramDirectMessageInput {
  readonly loginMode: InstagramLoginMode;
  readonly capability: Pick<MetaCapabilityDecision, "product" | "operationKey" | "state" | "available">;
  readonly conversationKind: InstagramConversationKind;
  readonly recipientInitiated: InstagramRecipientInitiation;
  readonly contentKind: InstagramMessageContentKind;
  readonly mediaOwnership: InstagramMediaOwnershipEvidence;
  readonly idempotencyKey: string;
}
export interface InstagramDirectMessageIssue {
  readonly code: string;
  readonly certainty: "denied" | "unknown";
  readonly explanation: string;
}
export interface InstagramDirectMessageDecision {
  readonly allowed: boolean;
  readonly issues: readonly InstagramDirectMessageIssue[];
}

function issue(code: string, certainty: "denied" | "unknown", explanation: string): InstagramDirectMessageIssue {
  return Object.freeze({ code, certainty, explanation });
}

export function evaluateInstagramDirectMessage(
  input: InstagramDirectMessageInput,
): InstagramDirectMessageDecision {
  const issues: InstagramDirectMessageIssue[] = [];
  const profile = getInstagramCapabilityProfile(input.loginMode, "direct_messages");
  if (input.capability.product !== "instagram" || input.capability.operationKey !== "direct_messages") {
    issues.push(issue("INSTAGRAM_DM_CAPABILITY_MISMATCH", "denied",
      "La capability evaluada no corresponde a Instagram Direct."));
  } else if (input.capability.state !== "available" || input.capability.available !== true) {
    issues.push(issue("INSTAGRAM_DM_CAPABILITY_NOT_AVAILABLE",
      input.capability.state === "unknown" ? "unknown" : "denied",
      "No existe evidencia vigente que autorice el envío de mensajes Direct."));
  }

  if (!profile.groupMessagingSupported && input.conversationKind === "group") {
    issues.push(issue("INSTAGRAM_GROUP_MESSAGING_UNSUPPORTED", "denied",
      "Instagram Direct no permite enviar mensajes a conversaciones grupales."));
  } else if (input.conversationKind === "unknown") {
    issues.push(issue("INSTAGRAM_CONVERSATION_KIND_UNKNOWN", "unknown",
      "Debe verificarse que el destinatario pertenece a una conversación individual."));
  }

  if (profile.recipientMustInitiate && input.recipientInitiated === "no") {
    issues.push(issue("INSTAGRAM_RECIPIENT_MUST_INITIATE", "denied",
      "El destinatario debe iniciar la conversación; no se permiten mensajes proactivos."));
  } else if (profile.recipientMustInitiate && input.recipientInitiated === "unknown") {
    issues.push(issue("INSTAGRAM_RECIPIENT_INITIATION_UNKNOWN", "unknown",
      "No hay evidencia de que el destinatario haya iniciado la conversación."));
  }

  if (input.contentKind === "shared_media" && profile.outgoingSharedMediaMustBeOwned) {
    if (input.mediaOwnership === "not_owned") {
      issues.push(issue("INSTAGRAM_DM_MEDIA_NOT_OWNED", "denied",
        "Instagram Login solo permite compartir medios/posts que pertenezcan a la cuenta conectada."));
    } else if (input.mediaOwnership !== "owned") {
      issues.push(issue("INSTAGRAM_DM_MEDIA_OWNERSHIP_UNKNOWN", "unknown",
        "La propiedad del medio compartido no está acreditada."));
    }
  }
  if (input.idempotencyKey.trim().length < 16) {
    issues.push(issue("INSTAGRAM_DM_IDEMPOTENCY_KEY_INVALID", "denied",
      "Cada envío Direct requiere una clave de idempotencia estable para evitar duplicados."));
  }
  return Object.freeze({ allowed: issues.length === 0, issues: Object.freeze(issues) });
}

/**
 * The 30-day limitation is a provider visibility rule for Instagram Login,
 * not a message-send window or permission to contact a user proactively.
 */
export function evaluateInstagramRequestVisibility(
  loginMode: InstagramLoginMode,
  lastActivityAt: Date,
  evaluatedAt: Date,
): InstagramRequestVisibility {
  const limitDays = getInstagramCapabilityProfile(loginMode, "direct_messages").requestsInactivityLimitDays;
  if (limitDays === null) return "not_applicable";
  if (
    !(lastActivityAt instanceof Date) || !Number.isFinite(lastActivityAt.getTime())
    || !(evaluatedAt instanceof Date) || !Number.isFinite(evaluatedAt.getTime())
    || lastActivityAt.getTime() > evaluatedAt.getTime()
  ) return "unknown";
  const age = evaluatedAt.getTime() - lastActivityAt.getTime();
  return age >= limitDays * 24 * 60 * 60 * 1_000 ? "possibly_omitted_by_provider" : "within_api_window";
}
