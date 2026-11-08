import type { ThreadsCapabilityKey } from "../domain/threads-contracts.js";

export interface ThreadsCapabilityRequirement {
  readonly key: ThreadsCapabilityKey;
  readonly requiredOAuthScopes: readonly string[];
  readonly requiresExplicitApproval: boolean;
}

/**
 * Meta scopes are attached to individual product actions. These definitions
 * deliberately do not infer scopes from Instagram, Facebook Login or Graph API.
 */
export const THREADS_CAPABILITY_CATALOG: Readonly<Record<ThreadsCapabilityKey, ThreadsCapabilityRequirement>> =
  Object.freeze({
    "profile.read": Object.freeze({
      key: "profile.read",
      requiredOAuthScopes: Object.freeze(["threads_basic"]),
      requiresExplicitApproval: false,
    }),
    "posts.read": Object.freeze({
      key: "posts.read",
      requiredOAuthScopes: Object.freeze(["threads_basic"]),
      requiresExplicitApproval: false,
    }),
    "posts.publish": Object.freeze({
      key: "posts.publish",
      requiredOAuthScopes: Object.freeze(["threads_basic", "threads_content_publish"]),
      requiresExplicitApproval: true,
    }),
    "replies.read": Object.freeze({
      key: "replies.read",
      requiredOAuthScopes: Object.freeze(["threads_basic", "threads_read_replies"]),
      requiresExplicitApproval: false,
    }),
    "replies.publish": Object.freeze({
      key: "replies.publish",
      requiredOAuthScopes: Object.freeze(["threads_basic", "threads_content_publish"]),
      requiresExplicitApproval: true,
    }),
    "insights.read": Object.freeze({
      key: "insights.read",
      requiredOAuthScopes: Object.freeze(["threads_basic", "threads_manage_insights"]),
      requiresExplicitApproval: false,
    }),
  });

export function getThreadsCapabilityRequirement(
  key: ThreadsCapabilityKey,
): ThreadsCapabilityRequirement {
  return THREADS_CAPABILITY_CATALOG[key];
}
