import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env["MIGRATION_DATABASE_URL"];
if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL is required to apply database migrations.");
  process.exit(1);
}

const version = "0001-platform-identity";
const migrationUrl = new URL("../apps/api/migrations/0001-platform-identity.sql", import.meta.url);
const migrationSql = await readFile(migrationUrl, "utf8");
const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5_000,
  application_name: "whatsbusiness-migrations",
});

let client;
try {
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(784639201)");
  await client.query("CREATE SCHEMA IF NOT EXISTS platform");
  await client.query(
    "CREATE TABLE IF NOT EXISTS platform.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );

  const applied = await client.query(
    "SELECT version FROM platform.schema_migrations WHERE version = $1",
    [version],
  );

  if (applied.rowCount === 0) {
    await client.query(migrationSql);
    await client.query("INSERT INTO platform.schema_migrations (version) VALUES ($1)", [version]);
    await client.query("COMMIT");
    console.log("Applied database migration " + version + ".");
  } else {
    await client.query("COMMIT");
    console.log("Database migration " + version + " is already applied.");
  }
} catch {
  if (client) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve the migration failure. */ }
  }
  console.error("Database migration failed. Check the migration role and database logs.");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
