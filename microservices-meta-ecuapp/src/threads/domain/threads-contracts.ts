export interface ThreadsConnectionContext {
  readonly tenantId: string;
  readonly profileId: string;
}

export interface ThreadsProfile {
  readonly id: string;
  readonly username: string;
  readonly name?: string;
  readonly biography?: string;
  readonly profilePictureUrl?: string;
  readonly isVerified?: boolean;
}

export interface ThreadsPost {
  readonly id: string;
  readonly mediaType?: string;
  readonly permalink?: string;
  readonly username?: string;
  readonly text?: string;
  readonly timestamp?: string;
  readonly hasReplies?: boolean;
  readonly ownerId?: string;
}

export interface ThreadsReply extends ThreadsPost {
  readonly isReply?: boolean;
  readonly isReplyOwnedByMe?: boolean;
  readonly rootPostId?: string;
  readonly repliedToId?: string;
}

export interface ThreadsPage<T> {
  readonly data: readonly T[];
  readonly cursors?: {
    readonly before?: string;
    readonly after?: string;
  };
}

export interface ThreadsPagination {
  readonly limit?: number;
  readonly before?: string;
  readonly after?: string;
  readonly since?: string;
  readonly until?: string;
  readonly reverse?: boolean;
}

export interface ThreadsInsightValue {
  readonly value: number | Readonly<Record<string, unknown>>;
  readonly endTime?: string;
}

export interface ThreadsInsight {
  readonly name: string;
  readonly period: string;
  readonly values?: readonly ThreadsInsightValue[];
  readonly totalValue?: number | Readonly<Record<string, unknown>>;
  readonly title?: string;
  readonly description?: string;
}

export interface ThreadsInsights {
  readonly data: readonly ThreadsInsight[];
}

export interface ThreadsPublicationReceipt {
  readonly containerId: string;
  readonly postId: string;
  readonly apiVersion: string;
}

export type ThreadsCapabilityKey =
  | "profile.read"
  | "posts.read"
  | "posts.publish"
  | "replies.read"
  | "replies.publish"
  | "insights.read";
