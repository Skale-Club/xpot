// Idempotent migration runner — applies every .sql file in ./migrations
// in lexical order. Tracks applied migrations in a `_xpot_migrations` table.
//
// Usage: npm run migrate

import "dotenv/config";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!rawUrl) {
  console.error("DATABASE_URL or POSTGRES_URL must be set");
  process.exit(1);
}

const useSsl =
  !rawUrl.includes("sslmode=disable") &&
  (rawUrl.includes(".supabase.") || rawUrl.includes("sslmode=") || process.env.PGSSLMODE === "require");

const pool = new Pool({
  connectionString: useSsl ? rawUrl.replace(/[?&]sslmode=[^&]*/g, (m) => (m.startsWith("?") ? "?" : "")) : rawUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "..", "migrations");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_xpot_migrations" (
      "name" TEXT PRIMARY KEY,
      "applied_at" TIMESTAMP DEFAULT NOW()
    )
  `);

  const applied = new Set(
    (await pool.query<{ name: string }>(`SELECT name FROM "_xpot_migrations"`)).rows.map((r) => r.name)
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`→ applying ${file} ...`);
    try {
      await pool.query("BEGIN");
      await pool.query(sql);
      await pool.query(`INSERT INTO "_xpot_migrations" ("name") VALUES ($1)`, [file]);
      await pool.query("COMMIT");
      appliedCount += 1;
      console.log(`✓ ${file}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error(`✗ ${file} failed:`, err);
      process.exit(1);
    }
  }

  console.log(`\nDone. ${appliedCount} migration(s) applied, ${files.length - appliedCount} skipped.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
