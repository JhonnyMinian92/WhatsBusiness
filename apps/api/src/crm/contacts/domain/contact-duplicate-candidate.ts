import type { ContactRecord } from "./contact.js";
import type { ContactIdentityRecord } from "./contact-identity.js";
import { isContactUuid } from "./contact.js";

export interface ContactDedupeProfile {
  readonly contact: ContactRecord;
  readonly identities: readonly ContactIdentityRecord[];
}

export type ContactDuplicateCandidateReason =
  | "SAME_NAMESPACED_PROVIDER_IDENTITY"
  | "SAME_SOURCE_REFERENCE"
  | "EXACT_NORMALIZED_NAME";

export type ContactDuplicateConfidence = "low" | "medium" | "high";

export interface ContactDuplicateCandidate {
  readonly contactId: string;
  readonly contactVersion: number;
  readonly score: number;
  readonly confidence: ContactDuplicateConfidence;
  readonly reasons: readonly ContactDuplicateCandidateReason[];
  readonly resolution: "manual_review_required";
}

export interface ContactDuplicateDetectionOptions {
  readonly minimumScore?: number;
  readonly limit?: number;
}

export interface ContactDuplicateSignalStrategy {
  readonly reason: ContactDuplicateCandidateReason;
  score(source: ContactDedupeProfile, candidate: ContactDedupeProfile): number;
}

export class ContactDuplicateDetectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ContactDuplicateDetectionError";
  }
}

/** Exact provider identity is a collision signal, never an automatic merge command. */
export class SameNamespacedProviderIdentityStrategy implements ContactDuplicateSignalStrategy {
  readonly reason = "SAME_NAMESPACED_PROVIDER_IDENTITY" as const;

  score(source: ContactDedupeProfile, candidate: ContactDedupeProfile): number {
    const candidateKeys = new Set(candidate.identities.map(identityKey));
    return source.identities.some(identity => candidateKeys.has(identityKey(identity))) ? 100 : 0;
  }
}

/** Equal source references can identify repeated imports of the same business event. */
export class SameSourceReferenceStrategy implements ContactDuplicateSignalStrategy {
  readonly reason = "SAME_SOURCE_REFERENCE" as const;

  score(source: ContactDedupeProfile, candidate: ContactDedupeProfile): number {
    const left = source.contact;
    const right = candidate.contact;
    return left.sourceReference !== null
      && right.sourceReference !== null
      && left.sourceType === right.sourceType
      && left.sourceReference === right.sourceReference
      ? 75
      : 0;
  }
}

/** Name equality is intentionally weak; common names alone do not pass the default threshold. */
export class ExactNormalizedNameStrategy implements ContactDuplicateSignalStrategy {
  readonly reason = "EXACT_NORMALIZED_NAME" as const;

  score(source: ContactDedupeProfile, candidate: ContactDedupeProfile): number {
    const left = normalizeName(source.contact.displayName);
    const right = normalizeName(candidate.contact.displayName);
    return left !== null && left === right ? 35 : 0;
  }
}

/**
 * Pure and deterministic candidate ranking. Strategies are replaceable/extensible;
 * the caller must supply tenant-scoped profiles from its repository adapter.
 */
export class ContactDuplicateCandidateDetector {
  private readonly strategies: readonly ContactDuplicateSignalStrategy[];

  constructor(strategies?: readonly ContactDuplicateSignalStrategy[]) {
    this.strategies = Object.freeze([
      ...(strategies ?? [
        new SameNamespacedProviderIdentityStrategy(),
        new SameSourceReferenceStrategy(),
        new ExactNormalizedNameStrategy(),
      ]),
    ]);
    if (this.strategies.length === 0) {
      throw new ContactDuplicateDetectionError("CRM_DUPLICATE_STRATEGIES_REQUIRED");
    }
    const reasons = this.strategies.map(strategy => strategy.reason);
    if (new Set(reasons).size !== reasons.length) {
      throw new ContactDuplicateDetectionError("CRM_DUPLICATE_STRATEGY_REASON_DUPLICATED");
    }
  }

  findCandidates(
    source: ContactDedupeProfile,
    candidates: readonly ContactDedupeProfile[],
    options: ContactDuplicateDetectionOptions = {},
  ): readonly ContactDuplicateCandidate[] {
    const minimumScore = options.minimumScore ?? 70;
    const limit = options.limit ?? 25;
    if (!Number.isSafeInteger(minimumScore) || minimumScore < 1 || minimumScore > 100) {
      throw new ContactDuplicateDetectionError("CRM_DUPLICATE_MINIMUM_SCORE_INVALID");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new ContactDuplicateDetectionError("CRM_DUPLICATE_LIMIT_INVALID");
    }
    if (candidates.length > 10_000) {
      throw new ContactDuplicateDetectionError("CRM_DUPLICATE_CANDIDATE_BATCH_TOO_LARGE");
    }

    validateProfile(source);
    const seenContactIds = new Set<string>([source.contact.id]);
    for (const profile of candidates) {
      validateProfile(profile);
      if (profile.contact.tenantId !== source.contact.tenantId) {
        throw new ContactDuplicateDetectionError("CRM_DUPLICATE_TENANT_SCOPE_MISMATCH");
      }
      if (seenContactIds.has(profile.contact.id)) {
        throw new ContactDuplicateDetectionError("CRM_DUPLICATE_CONTACT_REPEATED");
      }
      seenContactIds.add(profile.contact.id);
    }

    const matches: ContactDuplicateCandidate[] = [];
    for (const candidate of candidates) {
      if (
        candidate.contact.status !== "active"
        || source.contact.status !== "active"
        || candidate.contact.contactType !== source.contact.contactType
      ) continue;

      const reasons: ContactDuplicateCandidateReason[] = [];
      let score = 0;
      for (const strategy of this.strategies) {
        const contribution = strategy.score(source, candidate);
        if (!Number.isSafeInteger(contribution) || contribution < 0 || contribution > 100) {
          throw new ContactDuplicateDetectionError("CRM_DUPLICATE_STRATEGY_SCORE_INVALID");
        }
        if (contribution === 0) continue;
        score = Math.min(100, score + contribution);
        reasons.push(strategy.reason);
      }
      if (score < minimumScore || reasons.length === 0) continue;

      matches.push(Object.freeze({
        contactId: candidate.contact.id,
        contactVersion: candidate.contact.version,
        score,
        confidence: score >= 90 ? "high" : score >= 75 ? "medium" : "low",
        reasons: Object.freeze(reasons),
        resolution: "manual_review_required",
      }));
    }

    matches.sort((left, right) =>
      right.score - left.score
        || (left.contactId < right.contactId ? -1 : left.contactId > right.contactId ? 1 : 0),
    );
    return Object.freeze(matches.slice(0, limit));
  }
}

function identityKey(identity: ContactIdentityRecord): string {
  // Provider identifiers are opaque and case-sensitive; namespace is part of identity.
  return JSON.stringify([
    identity.provider, identity.product, identity.channel,
    identity.identifierType, identity.externalId,
  ]);
}

function validateProfile(profile: ContactDedupeProfile): void {
  const contact = profile?.contact;
  if (
    !contact
    || !isContactUuid(contact.id)
    || !isContactUuid(contact.tenantId)
    || !Number.isSafeInteger(contact.version)
    || contact.version < 1
    || !Array.isArray(profile.identities)
  ) {
    throw new ContactDuplicateDetectionError("CRM_DUPLICATE_PROFILE_INVALID");
  }
  for (const identity of profile.identities) {
    if (
      identity.tenantId !== contact.tenantId
      || identity.contactId !== contact.id
      || typeof identity.externalId !== "string"
      || identity.externalId.length === 0
    ) {
      throw new ContactDuplicateDetectionError("CRM_DUPLICATE_IDENTITY_SCOPE_INVALID");
    }
  }
}

function normalizeName(value: string): string | null {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized.replace(/[\s\p{P}\p{S}]/gu, "").length >= 3 ? normalized : null;
}
