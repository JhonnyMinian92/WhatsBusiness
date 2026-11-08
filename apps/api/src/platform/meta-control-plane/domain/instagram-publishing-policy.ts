import type { MetaCapabilityDecision } from "./meta-capability.js";

export type InstagramMediaKind = "feed" | "story" | "reel" | "carousel";
export type InstagramAccountKind = "business" | "creator" | "consumer";
export type InstagramContainerStatus = "not_created" | "in_progress" | "finished" | "error" | "expired" | "unknown";
export type InstagramPublicationState =
  | "draft" | "container_processing" | "ready" | "publishing"
  | "published" | "failed" | "outcome_unknown";

export interface InstagramPublicationPreflight {
  readonly mediaKind: InstagramMediaKind;
  readonly accountType: InstagramAccountKind;
  readonly state: InstagramPublicationState;
  readonly containerStatus: InstagramContainerStatus;
  readonly capability: Pick<MetaCapabilityDecision, "product" | "operationKey" | "state" | "available">;
  readonly humanApproved: boolean;
  readonly idempotencyKey: string;
}
export interface InstagramPublicationIssue {
  readonly code: string;
  readonly explanation: string;
  readonly certainty: "denied" | "unknown";
}
export interface InstagramPublicationDecision {
  readonly allowed: boolean;
  readonly issues: readonly InstagramPublicationIssue[];
}

export function evaluateInstagramPublication(input: InstagramPublicationPreflight): InstagramPublicationDecision {
  const issues: InstagramPublicationIssue[] = [];
  const requiredOperation = input.mediaKind === "story" ? "stories_publish" : "media_publish";
  if (input.accountType === "consumer") {
    issues.push({
      code: "INSTAGRAM_PROFESSIONAL_ACCOUNT_REQUIRED",
      explanation: "La publicación requiere una cuenta Instagram Professional Business o Creator.",
      certainty: "denied",
    });
  }
  if (input.mediaKind === "story" && input.accountType !== "business") {
    issues.push({
      code: "INSTAGRAM_STORY_PUBLISH_REQUIRES_BUSINESS",
      explanation: "Meta limita la publicación de Stories a cuentas Business.",
      certainty: "denied",
    });
  }
  if (input.capability.product !== "instagram" || input.capability.operationKey !== requiredOperation) {
    issues.push({
      code: "INSTAGRAM_PUBLICATION_CAPABILITY_MISMATCH",
      explanation: "La capacidad evaluada no corresponde al tipo de publicación solicitado.",
      certainty: "denied",
    });
  } else if (input.capability.state !== "available" || input.capability.available !== true) {
    issues.push({
      code: "INSTAGRAM_PUBLICATION_CAPABILITY_NOT_AVAILABLE",
      explanation: "La publicación requiere evidencia vigente de todos los permisos y gates de Meta.",
      certainty: input.capability.state === "unknown" ? "unknown" : "denied",
    });
  }
  if (!input.humanApproved) {
    issues.push({
      code: "INSTAGRAM_PUBLICATION_APPROVAL_REQUIRED",
      explanation: "La publicación externa requiere una aprobación humana explícita.",
      certainty: "denied",
    });
  }
  if (input.idempotencyKey.trim().length < 16) {
    issues.push({
      code: "INSTAGRAM_PUBLICATION_IDEMPOTENCY_KEY_INVALID",
      explanation: "La publicación requiere una clave de idempotencia de al menos 16 caracteres.",
      certainty: "denied",
    });
  }
  if (input.state === "outcome_unknown") {
    issues.push({
      code: "INSTAGRAM_PUBLICATION_RECONCILIATION_REQUIRED",
      explanation: "El resultado remoto es desconocido; consulta Meta antes de intentar otra publicación.",
      certainty: "unknown",
    });
  } else if (input.state !== "ready") {
    issues.push({
      code: "INSTAGRAM_PUBLICATION_STATE_NOT_READY",
      explanation: "Solo un contenedor listo y no publicado puede pasar al comando de publicación.",
      certainty: "denied",
    });
  }
  if (input.containerStatus !== "finished") {
    const pending = input.containerStatus === "unknown" || input.containerStatus === "in_progress";
    issues.push({
      code: pending ? "INSTAGRAM_CONTAINER_STATUS_UNKNOWN_OR_PENDING" : "INSTAGRAM_CONTAINER_NOT_PUBLISHABLE",
      explanation: "Meta debe confirmar que el contenedor terminó su procesamiento antes de publicar.",
      certainty: pending ? "unknown" : "denied",
    });
  }
  return Object.freeze({ allowed: issues.length === 0, issues: Object.freeze(issues) });
}

export type InstagramPublicationEvent =
  | "container_created" | "container_ready" | "container_failed"
  | "publish_started" | "publish_succeeded" | "publish_rejected" | "publish_timed_out"
  | "reconciliation_found_published" | "reconciliation_confirmed_absent";

const TRANSITIONS: Readonly<Record<InstagramPublicationState, Readonly<Record<string, InstagramPublicationState>>>> = {
  draft: { container_created: "container_processing" },
  container_processing: { container_ready: "ready", container_failed: "failed" },
  ready: { publish_started: "publishing" },
  publishing: {
    publish_succeeded: "published",
    publish_rejected: "failed",
    publish_timed_out: "outcome_unknown",
  },
  outcome_unknown: {
    reconciliation_found_published: "published",
    reconciliation_confirmed_absent: "ready",
  },
  published: {},
  failed: {},
};

export function transitionInstagramPublication(
  current: InstagramPublicationState,
  event: InstagramPublicationEvent,
): InstagramPublicationState {
  const next = TRANSITIONS[current][event];
  if (!next) throw new Error("INSTAGRAM_PUBLICATION_TRANSITION_NOT_ALLOWED");
  return next;
}

export interface InstagramReelMetadata {
  readonly container: "mp4" | "mov" | "other";
  readonly videoCodec: "h264" | "hevc" | "other";
  readonly audioCodec: "aac" | "other";
  readonly audioSampleRateHz: number;
  readonly frameRate: number;
  readonly widthPixels: number;
  readonly durationSeconds: number;
  readonly fileSizeBytes: number;
  readonly videoBitrateMbps: number;
  readonly audioBitrateKbps: number;
}

export function validateInstagramReelMetadata(metadata: InstagramReelMetadata): readonly string[] {
  const issues: string[] = [];
  if (metadata.container !== "mp4" && metadata.container !== "mov") issues.push("REEL_CONTAINER_UNSUPPORTED");
  if (metadata.videoCodec !== "h264" && metadata.videoCodec !== "hevc") issues.push("REEL_VIDEO_CODEC_UNSUPPORTED");
  if (metadata.audioCodec !== "aac") issues.push("REEL_AUDIO_CODEC_UNSUPPORTED");
  if (metadata.audioSampleRateHz !== 48_000) issues.push("REEL_AUDIO_SAMPLE_RATE_INVALID");
  if (metadata.frameRate < 23 || metadata.frameRate > 60) issues.push("REEL_FRAME_RATE_OUT_OF_RANGE");
  if (metadata.widthPixels <= 0 || metadata.widthPixels > 1_920) issues.push("REEL_WIDTH_OUT_OF_RANGE");
  if (metadata.durationSeconds < 3 || metadata.durationSeconds > 900) issues.push("REEL_DURATION_OUT_OF_RANGE");
  if (metadata.fileSizeBytes <= 0 || metadata.fileSizeBytes > 1_000_000_000) issues.push("REEL_FILE_SIZE_OUT_OF_RANGE");
  if (metadata.videoBitrateMbps <= 0 || metadata.videoBitrateMbps > 25) issues.push("REEL_VIDEO_BITRATE_OUT_OF_RANGE");
  if (metadata.audioBitrateKbps <= 0 || metadata.audioBitrateKbps > 128) issues.push("REEL_AUDIO_BITRATE_OUT_OF_RANGE");
  return Object.freeze(issues);
}
