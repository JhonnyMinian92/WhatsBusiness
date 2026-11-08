import assert from "node:assert/strict";
import test from "node:test";
import { ThreadsApiAdapter } from "./threads-api.adapter.js";
import {
  ThreadsApiError,
  type ThreadsApiRequest,
  type ThreadsApiTransport,
  type ThreadsAccessTokenProvider,
  type ThreadsCapabilityAuthorizer,
} from "./threads-api.ports.js";
import { ThreadsApiVersionPolicy } from "../domain/threads-api-version-policy.js";
import type { ThreadsCapabilityKey } from "../domain/threads-contracts.js";

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  profileId: "threads-profile-1",
};
const version = "v1.0";

class StubTransport implements ThreadsApiTransport {
  readonly calls: ThreadsApiRequest[] = [];
  readonly responses: unknown[] = [];
  failureAt: number | null = null;
  failure: unknown = null;

  async request(input: ThreadsApiRequest): Promise<unknown> {
    this.calls.push(input);
    if (this.failureAt === this.calls.length) throw this.failure;
    const value = this.responses.shift();
    if (value === undefined) throw new Error("No stub response configured.");
    return value;
  }
}

class StubTokens implements ThreadsAccessTokenProvider {
  calls = 0;
  async resolve(): Promise<{ value: string }> {
    this.calls += 1;
    return { value: "synthetic-token-never-log" };
  }
}

class StubCapabilities implements ThreadsCapabilityAuthorizer {
  readonly calls: ThreadsCapabilityKey[] = [];
  state: "available" | "unavailable" | "unknown" = "available";
  apiVersion = version;

  async authorize(input: {
    readonly tenantId: string;
    readonly profileId: string;
    readonly capability: ThreadsCapabilityKey;
  }): Promise<{
    state: "available" | "unavailable" | "unknown";
    apiVersion: string;
    reasonCodes: readonly string[];
  }> {
    this.calls.push(input.capability);
    return { state: this.state, apiVersion: this.apiVersion, reasonCodes: ["TEST_EVIDENCE"] };
  }
}

function createAdapter(
  transport = new StubTransport(),
  tokens = new StubTokens(),
  capabilities = new StubCapabilities(),
) {
  const policy = new ThreadsApiVersionPolicy({
    apiVersion: version,
    apiBaseUrl: "https://graph.threads.net",
    supportedVersions: [version],
    checkedAt: "2026-11-08T17:00:00.000Z",
    sourceUrl: "https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api",
  }, new Date("2026-11-08T18:00:00.000Z"));
  const adapter = new ThreadsApiAdapter(
    transport,
    policy,
    tokens,
    capabilities,
    () => new Date("2026-11-08T18:00:00.000Z"),
  );
  return { adapter, transport, tokens, capabilities };
}

test("reads the authenticated Threads profile with least-scope capability and typed mapping", async () => {
  const { adapter, transport, capabilities } = createAdapter();
  transport.responses.push({
    id: "profile-1",
    username: "business_ec",
    name: "Business EC",
    threads_biography: "Cuenta de prueba",
    threads_profile_picture_url: "https://example.com/avatar.jpg",
  });
  const profile = await adapter.getAuthenticatedProfile(context);
  assert.equal(profile.id, "profile-1");
  assert.equal(profile.username, "business_ec");
  assert.equal(profile.biography, "Cuenta de prueba");
  assert.equal(transport.calls[0]?.path, "/me");
  assert.deepEqual(capabilities.calls, ["profile.read"]);
});

test("lists posts with bounded cursor pagination", async () => {
  const { adapter, transport } = createAdapter();
  transport.responses.push({
    data: [{ id: "post-1", media_type: "TEXT_POST", username: "business_ec", has_replies: true }],
    paging: { cursors: { after: "cursor-2" } },
  });
  const page = await adapter.listOwnPosts(context, { limit: 10, after: "cursor-1" });
  assert.equal(page.data[0]?.id, "post-1");
  assert.equal(page.cursors?.after, "cursor-2");
  assert.equal(transport.calls[0]?.path, "/me/threads");
  assert.equal(transport.calls[0]?.query["after"], "cursor-1");
  await assert.rejects(adapter.listOwnPosts(context, { before: "a", after: "b" }), {
    code: "THREADS_PAGINATION_CURSOR_CONFLICT",
  });
});

test("reads replies and insights only through their own capabilities", async () => {
  const { adapter, transport, capabilities } = createAdapter();
  transport.responses.push(
    { data: [{ id: "reply-1", text: "Gracias", is_reply: true, replied_to: { id: "post-1" } }] },
    { data: [{ name: "likes", period: "lifetime", total_value: { value: 7 } }] },
    { data: [{ name: "followers_count", period: "day", values: [{ value: 23 }] }] },
  );
  const replies = await adapter.listReplies(context, "post-1");
  const postInsights = await adapter.getPostInsights(context, "post-1", ["likes"]);
  const profileInsights = await adapter.getProfileInsights(context, ["followers_count"]);
  assert.equal(replies.data[0]?.repliedToId, "post-1");
  assert.equal(postInsights.data[0]?.totalValue, 7);
  assert.equal(profileInsights.data[0]?.values?.[0]?.value, 23);
  assert.deepEqual(capabilities.calls, ["replies.read", "insights.read", "insights.read"]);
});

test("publication creates a media container then publishes it", async () => {
  const { adapter, transport } = createAdapter();
  transport.responses.push({ id: "container-1" }, { id: "published-post-1" });
  const receipt = await adapter.publishTextPost(context, { text: "Hola Threads" });
  assert.equal(receipt.containerId, "container-1");
  assert.equal(receipt.postId, "published-post-1");
  assert.equal(receipt.apiVersion, version);
  assert.equal(transport.calls.length, 2);
  assert.equal(transport.calls[0]?.path, "/me/threads");
  assert.equal(transport.calls[1]?.path, "/me/threads_publish");
  assert.equal(transport.calls[1]?.query["creation_id"], "container-1");
});

test("replies use content-publish permission and native reply_to_id linkage", async () => {
  const { adapter, transport, capabilities } = createAdapter();
  transport.responses.push({ id: "reply-container" }, { id: "reply-post" });
  const result = await adapter.publishReply(context, { postId: "parent-post", text: "Respuesta" });
  assert.equal(result.postId, "reply-post");
  assert.equal(transport.calls[0]?.query["reply_to_id"], "parent-post");
  assert.deepEqual(capabilities.calls, ["replies.publish"]);
});

test("denies unknown capability evidence before reading credentials or calling Meta", async () => {
  const transport = new StubTransport();
  const tokens = new StubTokens();
  const capabilities = new StubCapabilities();
  capabilities.state = "unknown";
  const { adapter } = createAdapter(transport, tokens, capabilities);
  await assert.rejects(adapter.getAuthenticatedProfile(context), { code: "THREADS_CAPABILITY_UNKNOWN" });
  assert.equal(tokens.calls, 0);
  assert.equal(transport.calls.length, 0);
});

test("fails closed when capability evidence refers to a different API version", async () => {
  const transport = new StubTransport();
  const capabilities = new StubCapabilities();
  capabilities.apiVersion = "v2.0";
  const { adapter, tokens } = createAdapter(transport, undefined, capabilities);
  await assert.rejects(adapter.getAuthenticatedProfile(context), {
    code: "THREADS_CAPABILITY_VERSION_MISMATCH",
  });
  assert.equal(tokens.calls, 0);
  assert.equal(transport.calls.length, 0);
});

test("never blindly retries a publish whose provider outcome is ambiguous", async () => {
  const { adapter, transport } = createAdapter();
  transport.responses.push({ id: "container-ambiguous" });
  transport.failureAt = 2;
  transport.failure = new ThreadsApiError("THREADS_REQUEST_OUTCOME_UNKNOWN", false, "unknown");
  await assert.rejects(adapter.publishTextPost(context, { text: "No repetir sin reconciliar" }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: string }).code, "THREADS_PUBLICATION_PUBLISH_UNKNOWN");
    assert.equal((error as { stage?: string }).stage, "publish");
    assert.equal((error as { containerId?: string }).containerId, "container-ambiguous");
    assert.equal((error as { outcome?: string }).outcome, "unknown");
    assert.equal((error as { reasonCode?: string }).reasonCode, "THREADS_REQUEST_OUTCOME_UNKNOWN");
    return true;
  });
  assert.equal(transport.calls.length, 2);
});

test("rejects malformed identifiers, metrics and pagination before provider calls", async () => {
  const { adapter, transport } = createAdapter();
  await assert.rejects(adapter.getPost(context, "../other"));
  await assert.rejects(adapter.getPostInsights(context, "post-1", ["Likes"]));
  await assert.rejects(adapter.listOwnPosts(context, { limit: 101 }));
  assert.equal(transport.calls.length, 0);
});
