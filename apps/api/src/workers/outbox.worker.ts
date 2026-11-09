import "dotenv/config";
import { loadEnvironment } from "../platform/config/environment.js";
import { Database } from "../platform/database/database.js";
import { PostgresOutboxRepository } from "../platform/events/postgres-outbox.repository.js";
import { HttpEventPublisher, OutboxDispatcher } from "../platform/events/outbox-dispatcher.js";

const env = loadEnvironment();
if (!env.EVENT_BUS_HTTP_URL) throw new Error("EVENT_BUS_HTTP_URL is required to run the outbox worker.");
const database = new Database({ connectionString: env.DATABASE_URL, maxConnections: env.DATABASE_POOL_MAX });
const dispatcher = new OutboxDispatcher(
  new PostgresOutboxRepository(database),
  new HttpEventPublisher(env.EVENT_BUS_HTTP_URL, env.EVENT_BUS_HTTP_TOKEN)
);
let stopping = false;
let running = false;

const shutdown = async (): Promise<void> => {
  stopping = true;
  while (running) await new Promise((resolve) => setTimeout(resolve, 50));
  await database.close();
};
process.once("SIGINT", () => { void shutdown().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { void shutdown().finally(() => process.exit(0)); });

while (!stopping) {
  running = true;
  try {
    const result = await dispatcher.dispatchBatch(env.OUTBOX_BATCH_SIZE);
    if (result.published === 0 && result.failed === 0) {
      await new Promise((resolve) => setTimeout(resolve, env.OUTBOX_POLL_INTERVAL_MS));
    }
  } catch (error) {
    process.stderr.write("Outbox dispatch failed: " + (error instanceof Error ? error.message : "unknown error") + "\n");
    await new Promise((resolve) => setTimeout(resolve, Math.min(env.OUTBOX_POLL_INTERVAL_MS * 5, 30_000)));
  } finally {
    running = false;
  }
}
