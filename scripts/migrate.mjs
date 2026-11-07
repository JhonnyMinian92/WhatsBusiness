import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env["MIGRATION_DATABASE_URL"];
if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL is required to apply database migrations.");
  process.exit(1);
}

const migrationDirectory = new URL("../apps/api/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /^\d{4}-[a-z0-9-]+\.sql$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

if (migrationFiles.length === 0) {
  throw new Error("No versioned SQL migrations were found.");
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5_000,
  application_name: "whatsbusiness-migrations",
});

let client;
try {
  client = await pool.connect();
  await client.query("CREATE SCHEMA IF NOT EXISTS platform");
  await client.query(
    "CREATE TABLE IF NOT EXISTS platform.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );

  for (const fileName of migrationFiles) {
    const version = fileName.replace(/\.sql$/, "");
    const migrationSql = await readFile(new URL(fileName, migrationDirectory), "utf8");

    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(784639201)");
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
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the migration failure. */ }
      throw error;
    }
  }
} catch {
  console.error("Database migration failed. Check the migration role and database logs.");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
