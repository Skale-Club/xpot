import { resolveDatabaseUrl } from "../server/lib/database-target.js";

/**
 * The only Supabase project the fake dataset may be written to: Xpot's own
 * development project. Production lives on xpot-db (Coolify), and other
 * Skale Club Supabase projects (e.g. Skale Club's production) must never be
 * wiped by mistake — Xpot's dev once pointed at one of them.
 */
export const APPROVED_DEV_PROJECT = "swqxxeivetzakglaphil";

/** The database `npm run db:seed:dev` may wipe and refill, or an error explaining why not. */
export function seedDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV=production. The fake dataset is for the development database only.");
  }
  if (env.DEV_SUPABASE_PROJECT_REF !== APPROVED_DEV_PROJECT) {
    throw new Error(
      `Refusing to seed: DEV_SUPABASE_PROJECT_REF is "${env.DEV_SUPABASE_PROJECT_REF ?? ""}", ` +
        `but only Xpot's development project (${APPROVED_DEV_PROJECT}) may receive the fake dataset.`,
    );
  }
  // Same rules as `npm run dev`: a TLS URL to that exact Supabase project, never DATABASE_URL/POSTGRES_URL.
  return resolveDatabaseUrl({ ...env, NODE_ENV: "development" });
}
