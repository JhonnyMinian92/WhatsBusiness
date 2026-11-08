import type {
  ThreadsConnectionContext,
  ThreadsInsight,
  ThreadsInsights,
  ThreadsPage,
  ThreadsPagination,
  ThreadsPost,
  ThreadsProfile,
  ThreadsPublicationReceipt,
  ThreadsReply,
  ThreadsCapabilityKey,
} from "../domain/threads-contracts.js";
import { ThreadsApiVersionPolicy } from "../domain/threads-api-version-policy.js";
import {
  ThreadsApiError,
  ThreadsCapabilityDeniedError,
  ThreadsPublicationError,
  type ThreadsAccessTokenProvider,
  type ThreadsApiTransport,
  type ThreadsCapabilityAuthorizer,
} from "./threads-api.ports.js";

const PROFILE_FIELDS = "id,username,name,threads_profile_picture_url,threads_biography";
const POST_FIELDS = "id,media_product_type,media_type,permalink,owner,username,text,timestamp,shortcode,has_replies";
const REPLY_FIELDS = "id,text,timestamp,media_product_type,media_type,permalink,shortcode,username,is_reply,is_reply_owned_by_me,root_post,replied_to";
const THREADS_TENANT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^[A-Za-z0-9._:-]{1,512}$/;
const METRIC_NAME = /^[a-z][a-z0-9_]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2_048) {
    throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > 8_192) {
    throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
  }
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
  return value;
}

function validateContext(context: ThreadsConnectionContext): void {
  if (
    !THREADS_TENANT_UUID.test(context.tenantId)
    || typeof context.profileId !== "string"
    || !PROVIDER_ID.test(context.profileId)
  ) {
    throw new ThreadsApiError("THREADS_CONTEXT_INVALID", false, "rejected");
  }
}

function validateProviderId(value: string, code = "THREADS_RESOURCE_ID_INVALID"): string {
  if (typeof value !== "string" || !PROVIDER_ID.test(value)) throw new ThreadsApiError(code, false, "rejected");
  return value;
}

function paginationQuery(pagination: ThreadsPagination = {}): Record<string, string> {
  const { limit = 25, before, after, since, until, reverse } = pagination;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ThreadsApiError("THREADS_PAGINATION_LIMIT_INVALID", false, "rejected");
  }
  if (before && after) throw new ThreadsApiError("THREADS_PAGINATION_CURSOR_CONFLICT", false, "rejected");
  const result: Record<string, string> = { limit: String(limit) };
  for (const [key, value] of Object.entries({ before, after, since, until })) {
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length < 1 || value.length > 512 || /[\u0000-\u001f]/.test(value)) {
      throw new ThreadsApiError("THREADS_PAGINATION_CURSOR_INVALID", false, "rejected");
    }
    result[key] = value;
  }
  if (reverse !== undefined) result["reverse"] = String(reverse);
  return result;
}

function mapProfile(value: unknown): ThreadsProfile {
  if (!isRecord(value)) throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
  return Object.freeze({
    id: requiredString(value, "id"),
    username: requiredString(value, "username"),
    name: optionalString(value, "name"),
    biography: optionalString(value, "threads_biography"),
    profilePictureUrl: optionalString(value, "threads_profile_picture_url"),
    isVerified: optionalBoolean(value, "is_verified"),
  });
}

function mapPost(value: unknown): ThreadsPost {
  if (!isRecord(value)) throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
  const owner = isRecord(value["owner"]) ? value["owner"] : undefined;
  return Object.freeze({
    id: requiredString(value, "id"),
    mediaType: optionalString(value, "media_type"),
    permalink: optionalString(value, "permalink"),
    username: optionalString(value, "username"),
    text: optionalString(value, "text"),
    timestamp: optionalString(value, "timestamp"),
    hasReplies: optionalBoolean(value, "has_replies"),
    ownerId: owner ? optionalString(owner, "id") : undefined,
  });
}

function mapReply(value: unknown): ThreadsReply {
  if (!isRecord(value)) throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
  const base = mapPost(value);
  const rootPost = isRecord(value["root_post"]) ? value["root_post"] : undefined;
  const repliedTo = isRecord(value["replied_to"]) ? value["replied_to"] : undefined;
  return Object.freeze({
    ...base,
    isReply: optionalBoolean(value, "is_reply"),
    isReplyOwnedByMe: optionalBoolean(value, "is_reply_owned_by_me"),
    rootPostId: rootPost ? optionalString(rootPost, "id") : undefined,
    repliedToId: repliedTo ? optionalString(repliedTo, "id") : undefined,
  });
}

function mapPage<T>(
  value: unknown,
  mapper: (item: unknown) => T,
): ThreadsPage<T> {
  if (!isRecord(value) || !Array.isArray(value["data"])) {
    throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
  }
  if (value["data"].length > 1_000) throw new ThreadsApiError("THREADS_RESPONSE_LIMIT_EXCEEDED", false, "unknown");
  const paging = isRecord(value["paging"]) ? value["paging"] : undefined;
  const cursors = paging && isRecord(paging["cursors"]) ? paging["cursors"] : undefined;
  return Object.freeze({
    data: Object.freeze(value["data"].map(mapper)),
    cursors: cursors ? Object.freeze({
      before: optionalString(cursors, "before"),
      after: optionalString(cursors, "after"),
    }) : undefined,
  });
}

function mapInsights(value: unknown): ThreadsInsights {
  if (!isRecord(value) || !Array.isArray(value["data"]) || value["data"].length > 500) {
    throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
  }
  const data: ThreadsInsight[] = value["data"].map((candidate) => {
    if (!isRecord(candidate)) throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
    const values = candidate["values"];
    let mappedValues: ThreadsInsight["values"];
    if (values !== undefined && values !== null) {
      if (!Array.isArray(values) || values.length > 2_000) {
        throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
      }
      mappedValues = Object.freeze(values.map((entry) => {
        if (!isRecord(entry) || typeof entry["value"] !== "number" && !isRecord(entry["value"])) {
          throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
        }
        return Object.freeze({
          value: entry["value"] as number | Readonly<Record<string, unknown>>,
          endTime: optionalString(entry, "end_time"),
        });
      }));
    }
    const total = candidate["total_value"];
    let totalValue: ThreadsInsight["totalValue"];
    if (total !== undefined && total !== null) {
      if (!isRecord(total) || typeof total["value"] !== "number" && !isRecord(total["value"])) {
        throw new ThreadsApiError("THREADS_RESPONSE_SHAPE_INVALID", false, "unknown");
      }
      totalValue = total["value"] as number | Readonly<Record<string, unknown>>;
    }
    return Object.freeze({
      name: requiredString(candidate, "name"),
      period: requiredString(candidate, "period"),
      values: mappedValues,
      totalValue,
      title: optionalString(candidate, "title"),
      description: optionalString(candidate, "description"),
    });
  });
  return Object.freeze({ data: Object.freeze(data) });
}

function validateMetrics(metrics: readonly string[]): string {
  if (
    metrics.length < 1
    || metrics.length > 20
    || new Set(metrics).size !== metrics.length
    || metrics.some((metric) => !METRIC_NAME.test(metric))
  ) {
    throw new ThreadsApiError("THREADS_INSIGHT_METRICS_INVALID", false, "rejected");
  }
  return metrics.join(",");
}

/**
 * Threads provider adapter. It consumes capability and credential ports so the
 * API implementation cannot bypass tenant authorization or account evidence.
 */
export class ThreadsApiAdapter {
  constructor(
    private readonly transport: ThreadsApiTransport,
    private readonly versionPolicy: ThreadsApiVersionPolicy,
    private readonly tokens: ThreadsAccessTokenProvider,
    private readonly capabilities: ThreadsCapabilityAuthorizer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getAuthenticatedProfile(context: ThreadsConnectionContext): Promise<ThreadsProfile> {
    return this.withAuthorizedToken(context, "profile.read", async (accessToken) => {
      const value = await this.request("GET", "/me", { fields: PROFILE_FIELDS }, accessToken);
      return mapProfile(value);
    });
  }

  async listOwnPosts(
    context: ThreadsConnectionContext,
    pagination: ThreadsPagination = {},
  ): Promise<ThreadsPage<ThreadsPost>> {
    return this.withAuthorizedToken(context, "posts.read", async (accessToken) => {
      const query = { fields: POST_FIELDS, ...paginationQuery(pagination) };
      return mapPage(await this.request("GET", "/me/threads", query, accessToken), mapPost);
    });
  }

  async getPost(context: ThreadsConnectionContext, postId: string): Promise<ThreadsPost> {
    const id = validateProviderId(postId);
    return this.withAuthorizedToken(context, "posts.read", async (accessToken) => {
      return mapPost(await this.request("GET", "/" + encodeURIComponent(id), { fields: POST_FIELDS }, accessToken));
    });
  }

  async listReplies(
    context: ThreadsConnectionContext,
    postId: string,
    pagination: ThreadsPagination = {},
  ): Promise<ThreadsPage<ThreadsReply>> {
    const id = validateProviderId(postId);
    return this.withAuthorizedToken(context, "replies.read", async (accessToken) => {
      const query = { fields: REPLY_FIELDS, ...paginationQuery({ ...pagination, reverse: pagination.reverse ?? false }) };
      return mapPage(await this.request("GET", "/" + encodeURIComponent(id) + "/replies", query, accessToken), mapReply);
    });
  }

  async getPostInsights(
    context: ThreadsConnectionContext,
    postId: string,
    metrics: readonly string[],
  ): Promise<ThreadsInsights> {
    const id = validateProviderId(postId);
    const metric = validateMetrics(metrics);
    return this.withAuthorizedToken(context, "insights.read", async (accessToken) => {
      return mapInsights(await this.request("GET", "/" + encodeURIComponent(id) + "/insights", { metric }, accessToken));
    });
  }

  async getProfileInsights(
    context: ThreadsConnectionContext,
    metrics: readonly string[],
  ): Promise<ThreadsInsights> {
    const metric = validateMetrics(metrics);
    return this.withAuthorizedToken(context, "insights.read", async (accessToken) => {
      return mapInsights(await this.request("GET", "/me/threads_insights", { metric }, accessToken));
    });
  }

  async publishTextPost(
    context: ThreadsConnectionContext,
    input: { readonly text: string },
  ): Promise<ThreadsPublicationReceipt> {
    return this.publishText(context, input, "posts.publish");
  }

  async publishReply(
    context: ThreadsConnectionContext,
    input: { readonly postId: string; readonly text: string },
  ): Promise<ThreadsPublicationReceipt> {
    const postId = validateProviderId(input.postId);
    return this.publishText(context, { text: input.text, replyToId: postId }, "replies.publish");
  }

  private async publishText(
    context: ThreadsConnectionContext,
    input: { readonly text: string; readonly replyToId?: string },
    capability: "posts.publish" | "replies.publish",
  ): Promise<ThreadsPublicationReceipt> {
    if (typeof input.text !== "string" || input.text.trim().length === 0 || input.text.length > 20_000) {
      throw new ThreadsApiError("THREADS_POST_TEXT_INVALID", false, "rejected");
    }
    return this.withAuthorizedToken(context, capability, async (accessToken) => {
      let container: unknown;
      try {
        container = await this.request("POST", "/me/threads", {
          media_type: "TEXT",
          text: input.text,
          ...(input.replyToId ? { reply_to_id: input.replyToId } : {}),
        }, accessToken);
      } catch (error) {
        throw new ThreadsPublicationError("container", null, outcomeOf(error), codeOf(error));
      }
      if (!isRecord(container) || typeof container["id"] !== "string" || !PROVIDER_ID.test(container["id"])) {
        throw new ThreadsPublicationError("container", null, "unknown", "THREADS_CONTAINER_RESPONSE_INVALID");
      }

      const containerId = container["id"];
      let published: unknown;
      try {
        published = await this.request("POST", "/me/threads_publish", { creation_id: containerId }, accessToken);
      } catch (error) {
        // Publishing POSTs are never retried blindly: the provider may have
        // accepted the post even when the HTTP outcome is ambiguous.
        throw new ThreadsPublicationError("publish", containerId, outcomeOf(error), codeOf(error));
      }
      if (!isRecord(published) || typeof published["id"] !== "string" || !PROVIDER_ID.test(published["id"])) {
        throw new ThreadsPublicationError("publish", containerId, "unknown", "THREADS_PUBLISH_RESPONSE_INVALID");
      }
      return Object.freeze({
        containerId,
        postId: published["id"],
        apiVersion: this.versionPolicy.apiVersion,
      });
    });
  }

  private async withAuthorizedToken<T>(
    context: ThreadsConnectionContext,
    capability: ThreadsCapabilityKey,
    action: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    validateContext(context);
    const decision = await this.capabilities.authorize({
      tenantId: context.tenantId,
      profileId: context.profileId,
      capability,
    });
    if (decision.state !== "available") {
      throw new ThreadsCapabilityDeniedError(capability, decision.state, decision.reasonCodes);
    }
    if (decision.apiVersion !== this.versionPolicy.apiVersion) {
      throw new ThreadsApiError("THREADS_CAPABILITY_VERSION_MISMATCH", false, "rejected");
    }

    const credential = await this.tokens.resolve({
      tenantId: context.tenantId,
      profileId: context.profileId,
    });
    if (!credential || typeof credential.value !== "string" || credential.value.length < 1 || credential.value.length > 8_192) {
      throw new ThreadsApiError("THREADS_CREDENTIAL_UNAVAILABLE", false, "rejected");
    }
    if (credential.expiresAt !== undefined && credential.expiresAt !== null) {
      const expiration = Date.parse(credential.expiresAt);
      if (!Number.isFinite(expiration) || expiration <= this.now().getTime()) {
        throw new ThreadsApiError("THREADS_CREDENTIAL_EXPIRED", false, "rejected");
      }
    }
    return action(credential.value);
  }

  private request(
    method: "GET" | "POST",
    path: string,
    query: Readonly<Record<string, string>>,
    accessToken: string,
  ): Promise<unknown> {
    return this.transport.request({
      method,
      path,
      query,
      accessToken,
      apiVersion: this.versionPolicy.apiVersion,
    });
  }
}

function outcomeOf(error: unknown): "rejected" | "unknown" {
  return error instanceof ThreadsApiError && error.outcome === "rejected" ? "rejected" : "unknown";
}

function codeOf(error: unknown): string {
  return error instanceof ThreadsApiError ? error.code : "THREADS_PROVIDER_OUTCOME_UNKNOWN";
}
