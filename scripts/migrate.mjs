import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env["MIGRATION_DATABASE_URL"];
if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL is required to apply database migrations.");
  process.exit(1);
}

const migrationDirectories = [
  new URL("../apps/api/migrations/", import.meta.url),
  new URL("../microservices-meta-ecuapp/migrations/", import.meta.url),
];

const migrations = [];
for (const directory of migrationDirectories) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/^\d{4}-[a-z0-9-]+\.sql$/.test(entry.name)) continue;
    migrations.push({
      version: entry.name.replace(/\.sql$/, ""),
      fileName: entry.name,
      url: new URL(entry.name, directory),
    });
  }
}

migrations.sort((left, right) => left.version.localeCompare(right.version));
for (let index = 1; index < migrations.length; index += 1) {
  if (migrations[index - 1].version === migrations[index].version) {
    throw new Error("Duplicate database migration version: " + migrations[index].version);
  }
}
if (migrations.length === 0) {
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

  for (const migration of migrations) {
    const migrationSql = await readFile(migration.url, "utf8");

    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(784639201)");
      const applied = await client.query(
        "SELECT version FROM platform.schema_migrations WHERE version = $1",
        [migration.version],
      );

      if (applied.rowCount === 0) {
        await client.query(migrationSql);
        await client.query("INSERT INTO platform.schema_migrations (version) VALUES ($1)", [migration.version]);
        await client.query("COMMIT");
        console.log("Applied database migration " + migration.version + ".");
      } else {
        await client.query("COMMIT");
        console.log("Database migration " + migration.version + " is already applied.");
      }
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the migration failure. */ }
      throw error;
    }
  }
} catch (error) {
  console.error("Database migration failed. Check the migration role and database logs.");
  if (error instanceof Error) {
    const databaseError = error;
    console.error("Migration error:", databaseError.message);
    const diagnostic = databaseError as Error & {
      code?: string; position?: string; schema?: string; table?: string; column?: string; constraint?: string;
    };
    for (const [key, value] of Object.entries({
      code: diagnostic.code,
      position: diagnostic.position,
      schema: diagnostic.schema,
      table: diagnostic.table,
      column: diagnostic.column,
      constraint: diagnostic.constraint,
    })) {
      if (value !== undefined) console.error(`  ${key}: ${value}`);
    }
  }
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
