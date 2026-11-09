import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Database } from "./database.js";

const configuration = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10)
}).parse(process.env);
const database = new Database({
  connectionString: configuration.DATABASE_URL,
  maxConnections: configuration.DATABASE_POOL_MAX
});

async function run(): Promise<void> {
  const directory = dirname(fileURLToPath(import.meta.url));
  const migrationPath = resolve(directory, "migrations/001_foundations.sql");
  const sql = await readFile(migrationPath, "utf8");
  try {
    await database.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    );
    const existing = await database.query<{ version: string }>(
      "SELECT version FROM schema_migrations WHERE version = $1",
      ["001_foundations"]
    );
    if (existing.rows.length > 0) {
      process.stdout.write("Migration 001_foundations already applied.\n");
      return;
    }
    await database.transaction(async (executor) => {
      await executor.query(sql);
      await executor.query("INSERT INTO schema_migrations (version) VALUES ($1)", ["001_foundations"]);
    });
    process.stdout.write("Migration 001_foundations applied successfully.\n");
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  process.stderr.write("Database migration failed: " + (error instanceof Error ? error.message : "unknown error") + "\n");
  process.exitCode = 1;
});
