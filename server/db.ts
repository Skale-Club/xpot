import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "#shared/schema.js";

const { Pool } = pg;

const rawDatabaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!rawDatabaseUrl) {
  throw new Error(
    "DATABASE_URL or POSTGRES_URL must be set. Did you forget to provision a database?",
  );
}

const sslExplicitlyDisabled =
  rawDatabaseUrl.includes('sslmode=disable') ||
  process.env.PGSSLMODE === "disable";
const isCloudDb =
  rawDatabaseUrl.includes('.supabase.') ||
  rawDatabaseUrl.includes('.neon.') ||
  (rawDatabaseUrl.includes('sslmode=') && !rawDatabaseUrl.includes('sslmode=disable'));
export const shouldUseSsl =
  !sslExplicitlyDisabled &&
  (isCloudDb ||
  process.env.PGSSLMODE === "require" ||
  process.env.POSTGRES_SSL === "true");

// Strip sslmode from URL so pg doesn't override our ssl config
export const databaseUrl = shouldUseSsl
  ? rawDatabaseUrl.replace(/[?&]sslmode=[^&]*/g, (match) =>
      match.startsWith('?') ? '?' : '')
    .replace(/\?$/, '')
    .replace(/\?&/, '?')
  : rawDatabaseUrl;

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: shouldUseSsl
    ? {
        rejectUnauthorized: false,
        // Managed Postgres (Supabase pooler etc.) presents certificates pg can't verify.
        checkServerIdentity: () => undefined,
      }
    : false,
  max: 20,
});
export const db = drizzle(pool, { schema });
