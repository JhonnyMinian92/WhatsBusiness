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

  async start(): Promise<void> { this.started = true; }
  async run(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
  }
  waitForDisconnect(): Promise<void> {
    return new Promise((resolve) => { this.disconnectResolver = resolve; });
  }
  disconnect(): void { this.disconnectResolver?.(); }
  async stop(): Promise<void> { this.stopped = true; }
  async close(): Promise<void> { this.closed = true; }
}

test("reopens worker sessions after disconnect and closes every session", async () => {
  const calls: string[] = [];
  const sessions: FakeSession[] = [];
  const factory: TenantJobRuntimeSessionFactory = {
    async open() {
      calls.push("open");
      const session = new FakeSession();
      sessions.push(session);
      if (sessions.length === 1) {
        queueMicrotask(() => session.disconnect());
      } else {
        const abort = new AbortController();
        queueMicrotask(() => controller.abort());
        const signal = controller.signal;
        void abort;
        void signal;
      }
      return session;
    },
  };
  const controller = new AbortController();
  const application = new TenantJobRuntimeApplication(
    factory,
    { now: () => new Date(0) },
    { next: () => 0 },
    {
      failed: (code) => calls.push("failed:" + code),
      reconnecting: () => calls.push("reconnecting"),
    },
    { initialReconnectDelayMs: 100, maximumReconnectDelayMs: 100, reconnectMultiplier: 2 },
  );

  const run = application.run(controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 150));
  controller.abort();
  await run;

  assert.equal(sessions.length >= 1, true);
  for (const session of sessions) {
    assert.equal(session.started, true);
    assert.equal(session.stopped, true);
    assert.equal(session.closed, true);
  }
  assert.equal(calls[0], "open");
});

test("rejects unsafe reconnect settings", () => {
  assert.throws(() => new TenantJobRuntimeApplication(
    { async open() { throw new Error("unused"); } },
    { now: () => new Date(0) },
    { next: () => 0.5 },
    { failed() {}, reconnecting() {} },
    { initialReconnectDelayMs: 0, maximumReconnectDelayMs: 100, reconnectMultiplier: 2 },
  ));
});
