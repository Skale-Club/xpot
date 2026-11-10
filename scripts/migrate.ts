// Idempotent migration runner — applies every .sql file in ./migrations
// in lexical order. Tracks applied migrations in a `_xpot_migrations` table.
//
// Usage: npm run migrate          (from the repo root, with POSTGRES_URL set)
//        node dist/migrate.cjs    (inside the Docker image, before the server starts)
//
// Each file runs in its own transaction on one dedicated connection, and the
// whole run holds a Postgres advisory lock, so two containers starting at once
// (a rolling deploy) never apply the same migration twice.

import dotenv from "dotenv";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import pg from "pg";
import { inferLegacySalesBaseline, type SchemaColumn } from "./migration-baseline.js";
import { describeDatabaseTarget, ignoredDatabaseOverride, resolveDatabaseUrl } from "../server/lib/database-target.js";

const { Client } = pg;

/** Arbitrary constant: the advisory-lock key every Xpot migration run shares. */
const MIGRATION_LOCK_KEY = 72_110_001;

// What the shell set for this run, before .env fills in the rest (dotenv never overrides it).
const shellEnv = { ...process.env };
dotenv.config();

// A database typed in the shell that development would ignore: refuse, never migrate the development database by surprise.
const ignored = ignoredDatabaseOverride(shellEnv);
if (ignored) {
  console.error(
    `${ignored} is set in the shell, but NODE_ENV=development (from .env) migrates DEV_DATABASE_URL and ignores it, ` +
    `so nothing was applied. For a disposable database run with NODE_ENV=test as well; ` +
    `for the development database, unset ${ignored} (or use npm run migrate:dev).`,
  );
  process.exit(1);
}

const rawUrl = resolveDatabaseUrl();
if (!rawUrl) {
  console.error("DATABASE_URL or POSTGRES_URL must be set");
  process.exit(1);
}
const target = describeDatabaseTarget(rawUrl);

const useSsl =
  !rawUrl.includes("sslmode=disable") &&
  (rawUrl.includes(".supabase.") || rawUrl.includes("sslmode=") || process.env.PGSSLMODE === "require");

// Repo root in development, /app in the Docker image: both run from there.
const MIGRATIONS_DIR = resolve(process.env.MIGRATIONS_DIR || join(process.cwd(), "migrations"));

async function main() {
  const client = new Client({
    connectionString: useSsl ? rawUrl!.replace(/[?&]sslmode=[^&]*/g, (m) => (m.startsWith("?") ? "?" : "")) : rawUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  // An inspection must never create the ledger, acquire the migration lock or
  // execute migration SQL. This is safe against a shared development schema.
  if (process.argv.includes("--plan")) {
    try {
      await client.query("BEGIN READ ONLY");
      const ledger = (await client.query("SELECT to_regclass('public._xpot_migrations') AS ledger")).rows[0].ledger;
      const applied = new Set<string>(ledger ? (await client.query<{ name: string }>("SELECT name FROM _xpot_migrations")).rows.map(row => row.name) : []);
      const files = readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith(".sql")).sort();
      console.log(JSON.stringify({ mode: "read-only-plan", database: target, applied: applied.size, pending: files.filter(file => !applied.has(file)) }, null, 2));
      await client.query("COMMIT");
    } finally { await client.end(); }
    return;
  }
  console.log(`Database: ${target}`);
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_xpot_migrations" (
        "name" TEXT PRIMARY KEY,
        "applied_at" TIMESTAMP DEFAULT NOW()
      )
    `);

    // Read after taking the lock: another runner may have just applied some.
    const applied = new Set(
      (await client.query<{ name: string }>(`SELECT name FROM "_xpot_migrations"`)).rows.map((r) => r.name),
    );

    // The first Xpot development database inherited already-converted sales
    // tables from Skale Club but not their pre-ledger migration records. Never
    // replay the destructive account→lead conversion over that populated DB.
    const schemaColumns = (await client.query<SchemaColumn>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name LIKE 'sales_%'
    `)).rows;
    const baseline = inferLegacySalesBaseline(schemaColumns, applied);
    if (baseline.length) {
      await client.query("BEGIN");
      try {
        for (const name of baseline) {
          await client.query(`INSERT INTO "_xpot_migrations" ("name") VALUES ($1) ON CONFLICT DO NOTHING`, [name]);
          applied.add(name);
        }
        await client.query("COMMIT");
        console.log(`✓ recognized legacy leads schema; baselined ${baseline.join(", ")}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`→ applying ${file} ...`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(`INSERT INTO "_xpot_migrations" ("name") VALUES ($1)`, [file]);
        await client.query("COMMIT");
        appliedCount += 1;
        console.log(`✓ ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`✗ ${file} failed:`, err);
        process.exitCode = 1;
        return;
      }
    }

    console.log(`Migrations: ${appliedCount} applied, ${files.length - appliedCount} already in place.`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
