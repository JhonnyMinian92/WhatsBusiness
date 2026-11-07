import assert from "node:assert/strict";
import test from "node:test";
import {
  TenantJobRuntimeApplication,
  type TenantJobRuntimeSession,
  type TenantJobRuntimeSessionFactory,
} from "./tenant-job-runtime.application.js";

class FakeSession implements TenantJobRuntimeSession {
  started = false;
  stopped = false;
  closed = false;
  private disconnectResolver: (() => void) | null = null;
  private disconnected = false;

  constructor(private readonly onStart: () => void = () => undefined) {}

  async start(): Promise<void> {
    this.started = true;
    this.onStart();
  }

  async run(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
  }

  waitForDisconnect(): Promise<void> {
    if (this.disconnected) return Promise.resolve();
    return new Promise((resolve) => { this.disconnectResolver = resolve; });
  }

  disconnect(): void {
    this.disconnected = true;
    this.disconnectResolver?.();
  }

  async stop(): Promise<void> { this.stopped = true; }
  async close(): Promise<void> { this.closed = true; }
}

test("reopens worker sessions after disconnect and closes every session", async () => {
  const calls: string[] = [];
  const sessions: FakeSession[] = [];
  const controller = new AbortController();
  const factory: TenantJobRuntimeSessionFactory = {
    async open() {
      calls.push("open");
      const session = sessions.length === 0
        ? new FakeSession(() => queueMicrotask(() => sessions[0]?.disconnect()))
        : new FakeSession(() => controller.abort());
      sessions.push(session);
      return session;
    },
  };
  const application = new TenantJobRuntimeApplication(
    factory,
    { next: () => 0 },
    {
      failed: (code) => calls.push("failed:" + code),
      reconnecting: (delay) => calls.push("reconnecting:" + delay),
    },
    {
      initialReconnectDelayMs: 100,
      maximumReconnectDelayMs: 100,
      reconnectMultiplier: 2,
      stableSessionDurationMs: 30_000,
    },
  );

  await application.run(controller.signal);

  assert.equal(sessions.length, 2);
  for (const session of sessions) {
    assert.equal(session.started, true);
    assert.equal(session.stopped, true);
    assert.equal(session.closed, true);
  }
  assert.equal(calls[0], "open");
  assert.equal(calls.includes("reconnecting:50"), true);
});

test("rejects unsafe reconnect settings", () => {
  assert.throws(() => new TenantJobRuntimeApplication(
    { async open() { throw new Error("unused"); } },
    { next: () => 0.5 },
    { failed() {}, reconnecting() {} },
    {
      initialReconnectDelayMs: 0,
      maximumReconnectDelayMs: 100,
      reconnectMultiplier: 2,
      stableSessionDurationMs: 30_000,
    },
  ));
});
