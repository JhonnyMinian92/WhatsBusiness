import assert from "node:assert/strict";
import test from "node:test";
import { RabbitMqPrometheusTenantJobQueueMetricsReader } from "../rabbitmq/rabbitmq-prometheus-tenant-job-queue-metrics.reader.js";

const workerQueue = "whatsbusiness.jobs.worker+v1";
const deadLetterQueue = "whatsbusiness.jobs.dlq.v1";
const options = {
  endpoint: "https://rabbitmq.internal:15692",
  username: "whatsbusiness_metrics",
  password: "test-rabbit-prometheus-password-32-bytes",
  virtualHost: "/",
  workerQueue,
  deadLetterQueue,
};

function exposition(worker: { ready: string; unacked: string; consumers: string }, dead: { ready: string; unacked: string; consumers: string }): string {
  return [
    "# HELP rabbitmq_detailed_queue_messages_ready Messages ready to be delivered to consumers.",
    "# TYPE rabbitmq_detailed_queue_messages_ready gauge",
    'rabbitmq_detailed_queue_messages_ready{vhost="/",queue="' + workerQueue + '",node="rabbit@node"} ' + worker.ready,
    'rabbitmq_detailed_queue_messages_unacked{vhost="/",queue="' + workerQueue + '",node="rabbit@node"} ' + worker.unacked,
    'rabbitmq_detailed_queue_consumers{vhost="/",queue="' + workerQueue + '",node="rabbit@node"} ' + worker.consumers,
    'rabbitmq_detailed_queue_messages_ready{queue="' + deadLetterQueue + '",node="rabbit@node",vhost="/"} ' + dead.ready,
    'rabbitmq_detailed_queue_messages_unacked{queue="' + deadLetterQueue + '",node="rabbit@node",vhost="/"} ' + dead.unacked,
    'rabbitmq_detailed_queue_consumers{queue="' + deadLetterQueue + '",node="rabbit@node",vhost="/"} ' + dead.consumers,
  ].join("\n");
}

test("reads only the configured worker and DLQ counters from RabbitMQ detailed metrics", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const reader = new RabbitMqPrometheusTenantJobQueueMetricsReader({
    ...options,
    fetcher: async (input, init) => {
      requests.push({ url: new URL(String(input)), init });
      return new Response(exposition(
        { ready: "7", unacked: "3", consumers: "4" },
        { ready: "2", unacked: "1", consumers: "0" },
      ), { status: 200, headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" } });
    },
  });

  assert.deepEqual(await reader.readSnapshot(), {
    rabbitMqWorkerQueueReadyMessages: 7,
    rabbitMqWorkerQueueUnacknowledgedMessages: 3,
    rabbitMqWorkerQueueConsumers: 4,
    rabbitMqDeadLetterQueueReadyMessages: 2,
    rabbitMqDeadLetterQueueUnacknowledgedMessages: 1,
    rabbitMqDeadLetterQueueConsumers: 0,
  });

  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.init?.method, "GET");
  assert.equal(request.init?.redirect, "error");
  assert.equal(request.init?.cache, "no-store");
  assert.equal((request.init?.headers as Record<string, string>).authorization,
    "Basic " + Buffer.from(options.username + ":" + options.password).toString("base64"));
  assert.equal(request.url.pathname, "/metrics/detailed");
  assert.deepEqual(request.url.searchParams.getAll("family"), ["queue_coarse_metrics", "queue_consumer_count"]);
  assert.equal(request.url.searchParams.get("vhost"), "/");
  assert.equal(request.url.searchParams.get("queue"), "^(?:whatsbusiness\\.jobs\\.worker\\+v1|whatsbusiness\\.jobs\\.dlq\\.v1)$");
});

test("rejects unsafe endpoints, incomplete basic authentication and invalid bounds", () => {
  assert.throws(() => new RabbitMqPrometheusTenantJobQueueMetricsReader({
    ...options, endpoint: "http://rabbitmq.internal:15692",
  }), /HTTPS outside loopback/);
  assert.throws(() => new RabbitMqPrometheusTenantJobQueueMetricsReader({
    ...options, endpoint: "https://user:pass@rabbitmq.internal:15692",
  }), /URL credentials or parameters/);
  assert.throws(() => new RabbitMqPrometheusTenantJobQueueMetricsReader({
    ...options, username: "whatsbusiness_metrics", password: undefined,
  }), /requires both username and password/);
  assert.throws(() => new RabbitMqPrometheusTenantJobQueueMetricsReader({
    ...options, timeoutMs: 10_001,
  }), /timeout must be between/);
  assert.throws(() => new RabbitMqPrometheusTenantJobQueueMetricsReader({
    ...options, maximumResponseBytes: 512,
  }), /response limit/);
});

test("rejects negative, fractional, missing and duplicate metric samples", async () => {
  const invalidValues = [
    exposition({ ready: "-1", unacked: "0", consumers: "1" }, { ready: "0", unacked: "0", consumers: "0" }),
    exposition({ ready: "1.5", unacked: "0", consumers: "1" }, { ready: "0", unacked: "0", consumers: "0" }),
    exposition({ ready: "NaN", unacked: "0", consumers: "1" }, { ready: "0", unacked: "0", consumers: "0" }),
    exposition({ ready: "1", unacked: "0", consumers: "1" }, { ready: "0", unacked: "0", consumers: "0" })
      .split("\n").filter(line => !line.includes("queue_messages_unacked{vhost")).join("\n"),
    exposition({ ready: "1", unacked: "0", consumers: "1" }, { ready: "0", unacked: "0", consumers: "0" })
      + '\nrabbitmq_detailed_queue_messages_ready{vhost="/",queue="' + workerQueue + '"} 1',
  ];
  const expectedErrors = [
    /invalid queue metric: rabbitmq_detailed_queue_messages_ready/,
    /invalid queue metric: rabbitmq_detailed_queue_messages_ready/,
    /invalid queue metric: rabbitmq_detailed_queue_messages_ready/,
    /RABBITMQ_PROMETHEUS_METRICS_INCOMPLETE: worker queue statistics/,
    /duplicate queue metric/,
  ];
  for (let index = 0; index < invalidValues.length; index += 1) {
    const reader = new RabbitMqPrometheusTenantJobQueueMetricsReader({
      ...options,
      fetcher: async () => new Response(invalidValues[index] as string, { status: 200 }),
    });
    await assert.rejects(reader.readSnapshot(), expectedErrors[index]);
  }
});

test("rejects oversized responses and hides HTTP response bodies", async () => {
  const oversized = new RabbitMqPrometheusTenantJobQueueMetricsReader({
    ...options,
    maximumResponseBytes: 1_024,
    fetcher: async () => new Response("x".repeat(2_000), { status: 200 }),
  });
  await assert.rejects(oversized.readSnapshot(), /exceeded the configured size limit/);

  const unavailable = new RabbitMqPrometheusTenantJobQueueMetricsReader({
    ...options,
    fetcher: async () => new Response("sensitive broker detail", { status: 503 }),
  });
  await assert.rejects(unavailable.readSnapshot(), error => {
    assert.match(String(error), /unsuccessful response \(HTTP 503\)/);
    assert.doesNotMatch(String(error), /sensitive broker detail/);
    return true;
  });
});

test("decodes Prometheus label escapes before matching the configured virtual host and queues", async () => {
  const escapedQueue = "queue\\\"name";
  const reader = new RabbitMqPrometheusTenantJobQueueMetricsReader({
    ...options,
    workerQueue: escapedQueue,
    fetcher: async () => new Response([
      'rabbitmq_detailed_queue_messages_ready{vhost="/",queue="queue\\\\\\"name"} 3',
      'rabbitmq_detailed_queue_messages_unacked{vhost="/",queue="queue\\\\\\"name"} 0',
      'rabbitmq_detailed_queue_consumers{vhost="/",queue="queue\\\\\\"name"} 1',
      'rabbitmq_detailed_queue_messages_ready{vhost="/",queue="' + deadLetterQueue + '"} 0',
      'rabbitmq_detailed_queue_messages_unacked{vhost="/",queue="' + deadLetterQueue + '"} 0',
      'rabbitmq_detailed_queue_consumers{vhost="/",queue="' + deadLetterQueue + '"} 0',
    ].join("\n"), { status: 200 }),
  });
  const snapshot = await reader.readSnapshot();
  assert.equal(snapshot.rabbitMqWorkerQueueReadyMessages, 3);
  assert.equal(snapshot.rabbitMqDeadLetterQueueConsumers, 0);
});
