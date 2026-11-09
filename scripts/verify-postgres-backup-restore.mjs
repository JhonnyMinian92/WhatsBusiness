import assert from "node:assert/strict";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Pool } from "pg";

const containerId = process.env["POSTGRES_CONTAINER_ID"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];
if (!containerId || !/^[a-f0-9]{12,64}$/i.test(containerId)) {
  throw new Error("POSTGRES_CONTAINER_ID must identify the PostgreSQL 18 CI service container.");
}
if (!migrationUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required for the restore verification.");
}

const sourceUrl = new URL(migrationUrl);
const sourceDatabase = decodeURIComponent(sourceUrl.pathname.replace(/^\/+/, ""));
if (!/^[a-zA-Z0-9_]{1,63}$/.test(sourceDatabase)) {
  throw new Error("MIGRATION_DATABASE_URL must use a simple PostgreSQL database name.");
}
const restoredDatabase = ("wb_restore_" + process.pid).slice(0, 63);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "whatsbusiness-pg-restore-"));
const encryptedDumpPath = join(temporaryDirectory, "database.dump.aes-gcm");
const key = randomBytes(32);
const nonce = randomBytes(12);
const aad = Buffer.from("whatsbusiness:postgres-backup:v1:" + sourceDatabase, "utf8");
const sourcePool = new Pool({ connectionString: migrationUrl, max: 1, connectionTimeoutMillis: 5_000 });
let restoredPool;
let destinationCreated = false;

function processCompletion(child, commandLabel) {
  const stderrChunks = [];
  let stderrBytes = 0;
  child.stderr?.on("data", (chunk) => {
    if (stderrBytes >= 16_384) return;
    const remaining = 16_384 - stderrBytes;
    const captured = chunk.subarray(0, remaining);
    stderrChunks.push(captured);
    stderrBytes += captured.length;
  });
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new Error(commandLabel + " could not start: " + error.message)));
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(new Error(commandLabel + " failed (exit=" + String(code) + ", signal=" + String(signal) + "): " + stderr));
    });
  });
}

function runDocker(argumentsList, label) {
  const child = spawn("docker", ["exec", containerId, ...argumentsList], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  return processCompletion(child, label);
}

function stripRedundantOuterParentheses(expression) {
  let value = expression.trim();
  while (value.startsWith("(") && value.endsWith(")")) {
    let depth = 0;
    let singleQuoted = false;
    let doubleQuoted = false;
    let wrapsWholeExpression = true;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      const next = value[index + 1];
      if (singleQuoted) {
        if (character === "'" && next === "'") { index += 1; continue; }
        if (character === "'") singleQuoted = false;
        continue;
      }
      if (doubleQuoted) {
        if (character === '"' && next === '"') { index += 1; continue; }
        if (character === '"') doubleQuoted = false;
        continue;
      }
      if (character === "'") { singleQuoted = true; continue; }
      if (character === '"') { doubleQuoted = true; continue; }
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth < 0) throw new Error("Unbalanced SQL expression parentheses.");
        if (depth === 0 && index !== value.length - 1) {
          wrapsWholeExpression = false;
          break;
        }
      }
    }
    if (!wrapsWholeExpression || depth !== 0 || singleQuoted || doubleQuoted) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function splitTopLevelAnd(expression) {
  const parts = [];
  let depth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let segmentStart = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    const next = expression[index + 1];
    if (singleQuoted) {
      if (character === "'" && next === "'") { index += 1; continue; }
      if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === '"' && next === '"') { index += 1; continue; }
      if (character === '"') doubleQuoted = false;
      continue;
    }
    if (character === "'") { singleQuoted = true; continue; }
    if (character === '"') { doubleQuoted = true; continue; }
    if (character === "(") { depth += 1; continue; }
    if (character === ")") {
      depth -= 1;
      if (depth < 0) throw new Error("Unbalanced SQL expression parentheses.");
      continue;
    }
    if (depth !== 0 || expression.slice(index, index + 3).toUpperCase() !== "AND") continue;
    const previous = expression[index - 1];
    const following = expression[index + 3];
    if (!previous || !following || !/\s/.test(previous) || !/\s/.test(following)) continue;
    parts.push(expression.slice(segmentStart, index).trim());
    index += 2;
    segmentStart = index + 1;
  }
  if (depth !== 0 || singleQuoted || doubleQuoted) {
    throw new Error("Malformed SQL expression while comparing restored constraints.");
  }
  if (parts.length === 0) return [expression.trim()];
  parts.push(expression.slice(segmentStart).trim());
  return parts;
}

function canonicalizeBooleanExpression(expression) {
  const value = stripRedundantOuterParentheses(expression).replace(/\s+/g, " ").trim();
  const conjunction = splitTopLevelAnd(value);
  if (conjunction.length > 1) {
    const terms = conjunction.map(canonicalizeBooleanExpression).sort();
    return "AND(" + terms.join(",") + ")";
  }
  return stripRedundantOuterParentheses(value).replace(/\s+/g, " ").trim();
}

function normalizeConstraintDefinition(definition) {
  const normalized = definition.replace(/\s+/g, " ").trim();
  const checkPrefix = "CHECK (";
  if (!normalized.startsWith(checkPrefix) || !normalized.endsWith(")")) return normalized;
  const expression = normalized.slice(checkPrefix.length, -1).trim();
  return "CHECK (" + canonicalizeBooleanExpression(expression) + ")";
}

// Regression fixtures: PostgreSQL may serialize the same associative AND
// expression with a nested left-associative tree or a flat conjunction.
assert.equal(
  normalizeConstraintDefinition("CHECK (((length(redirect_uri) >= 12) AND (length(redirect_uri) <= 2048)) AND (redirect_uri ~ '^https://'::text))"),
  normalizeConstraintDefinition("CHECK ((length(redirect_uri) >= 12) AND (length(redirect_uri) <= 2048) AND (redirect_uri ~ '^https://'::text))"),
  "Equivalent CHECK conjunctions must compare equal after restore.",
);
assert.notEqual(
  normalizeConstraintDefinition("CHECK ((length(redirect_uri) >= 12) AND (length(redirect_uri) <= 2048))"),
  normalizeConstraintDefinition("CHECK ((length(redirect_uri) >= 12) AND (length(redirect_uri) <= 2047))"),
  "Different CHECK bounds must remain distinguishable.",
);

async function captureCatalog(pool) {
  const [migrations, relations, policies, constraints, rls, privileges] = await Promise.all([
    pool.query("SELECT version FROM platform.schema_migrations ORDER BY version"),
    pool.query(
      "SELECT n.nspname AS schema_name,c.relname AS relation_name,c.relkind AS relation_kind " +
      "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname IN ('platform','public') AND c.relkind IN ('r','p','v','m','S') " +
      "ORDER BY n.nspname,c.relname,c.relkind",
    ),
    pool.query(
      "SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check " +
      "FROM pg_policies WHERE schemaname='platform' ORDER BY tablename,policyname",
    ),
    pool.query(
      "SELECT relation.relname AS relation_name,constraint_record.conname AS constraint_name," +
      "constraint_record.contype AS constraint_type,pg_get_constraintdef(constraint_record.oid) AS definition " +
      "FROM pg_constraint constraint_record " +
      "JOIN pg_class relation ON relation.oid=constraint_record.conrelid " +
      "JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace " +
      "WHERE namespace.nspname='platform' " +
      "ORDER BY relation.relname,constraint_record.conname",
    ),
    pool.query(
      "SELECT relation.relname AS relation_name,relation.relrowsecurity AS rls_enabled," +
      "relation.relforcerowsecurity AS rls_forced," +
      "(SELECT count(*)::int FROM pg_policies policy " +
      " WHERE policy.schemaname='platform' AND policy.tablename=relation.relname) AS policy_count " +
      "FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace " +
      "WHERE namespace.nspname='platform' AND relation.relname IN " +
      "('tenants','memberships','usage_ledger','meta_connections','meta_onboarding_sagas') " +
      "ORDER BY relation.relname",
    ),
    pool.query(
      "SELECT has_table_privilege('whatsbusiness_app','platform.usage_ledger','INSERT') AS api_can_insert, " +
      "to_regprocedure('platform.record_usage_entry(uuid,uuid,text,text,text,numeric,numeric,character,text,text,text,character,timestamptz)') " +
      "IS NOT NULL AS usage_ingestion_function_present",
    ),
  ]);
  return {
    migrations: migrations.rows,
    relations: relations.rows,
    policies: policies.rows,
    constraints: constraints.rows.map((row) => ({
      ...row,
      definition: normalizeConstraintDefinition(row.definition),
    })),
    rls: rls.rows,
    privileges: privileges.rows[0],
  };
}

try {
  const sourceCatalog = await captureCatalog(sourcePool);
  assert.ok(sourceCatalog.migrations.length >= 42, "The source database must contain the latest versioned migrations.");
  assert.ok(sourceCatalog.migrations.some((row) => row.version === "0042-meta-onboarding-progress-evidence"),
    "Migration 0042 must be present before creating the backup.");
  assert.equal(sourceCatalog.privileges?.api_can_insert, false,
    "The API runtime must not have a direct INSERT privilege on the usage ledger.");
  assert.equal(sourceCatalog.privileges?.usage_ingestion_function_present, true,
    "The guarded usage-ingestion function must be present in the source database.");

  // The key is ephemeral and held only in this process. This verifies the
  // encrypted backup/restore mechanism in CI, not production KMS custody.
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const dump = spawn("docker", [
    "exec", containerId, "pg_dump", "--username=postgres", "--no-password",
    "--format=custom", "--no-owner", "--dbname", sourceDatabase,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const dumpExit = processCompletion(dump, "PostgreSQL custom-format dump");
  const encryptedWrite = pipeline(dump.stdout, cipher, createWriteStream(encryptedDumpPath, { mode: 0o600 }));
  await Promise.all([dumpExit, encryptedWrite]);
  const authenticationTag = cipher.getAuthTag();
  const encryptedBytes = (await stat(encryptedDumpPath)).size;
  assert.ok(encryptedBytes > 0, "Encrypted database backup must not be empty.");

  await runDocker(["dropdb", "--username=postgres", "--no-password", "--if-exists", restoredDatabase],
    "Drop stale restore database");
  await runDocker(["createdb", "--username=postgres", "--no-password", restoredDatabase],
    "Create clean restore database");
  destinationCreated = true;

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(authenticationTag);
  const restore = spawn("docker", [
    "exec", "-i", containerId, "pg_restore", "--username=postgres", "--no-password",
    "--no-owner", "--exit-on-error", "--dbname", restoredDatabase,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  const restoreExit = processCompletion(restore, "PostgreSQL restore");
  const decryptedPipe = pipeline(createReadStream(encryptedDumpPath), decipher, restore.stdin);
  const startedAt = process.hrtime.bigint();
  await Promise.all([restoreExit, decryptedPipe]);
  const restoreDurationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);

  const restoredUrl = new URL(migrationUrl);
  restoredUrl.pathname = "/" + restoredDatabase;
  restoredPool = new Pool({
    connectionString: restoredUrl.toString(),
    max: 1,
    connectionTimeoutMillis: 5_000,
    application_name: "whatsbusiness-ci-restore-verification",
  });
  const restoredCatalog = await captureCatalog(restoredPool);
  assert.deepEqual(restoredCatalog, sourceCatalog,
    "The restored database must retain migrations, schema relations, RLS policies, constraints and critical privileges.");

  console.log(JSON.stringify({
    result: "PASS",
    sourceDatabase,
    restoredDatabase,
    migrationCount: sourceCatalog.migrations.length,
    relationCount: sourceCatalog.relations.length,
    policyCount: sourceCatalog.policies.length,
    constraintCount: sourceCatalog.constraints.length,
    encryptedBackupBytes: encryptedBytes,
    encryption: "AES-256-GCM (ephemeral CI-only key; production KMS not verified)",
    restoreDurationMs,
    rlsAndLeastPrivilege: "verified against restored catalog",
  }));
} finally {
  await restoredPool?.end();
  await sourcePool.end();
  if (destinationCreated) {
    try {
      await runDocker(["dropdb", "--username=postgres", "--no-password", "--if-exists", restoredDatabase],
        "Remove temporary restore database");
    } catch (error) {
      console.error("Unable to remove temporary restore database:", error instanceof Error ? error.message : "unknown error");
    }
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
  key.fill(0);
}
