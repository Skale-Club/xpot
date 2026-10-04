// Idempotent migration runner — applies every .sql file in ./migrations
// in lexical order. Tracks applied migrations in a `_xpot_migrations` table.
//
// Usage: npm run migrate          (from the repo root, with POSTGRES_URL set)
//        node dist/migrate.cjs    (inside the Docker image, before the server starts)
//
// Each file runs in its own transaction on one dedicated connection, and the
// whole run holds a Postgres advisory lock, so two containers starting at once
// (a rolling deploy) never apply the same migration twice.

import "dotenv/config";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import pg from "pg";

const { Client } = pg;

/** Arbitrary constant: the advisory-lock key every Xpot migration run shares. */
const MIGRATION_LOCK_KEY = 72_110_001;

const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!rawUrl) {
  console.error("DATABASE_URL or POSTGRES_URL must be set");
  process.exit(1);
}

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
