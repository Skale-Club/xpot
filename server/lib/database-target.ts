/** Select a database before opening connections or applying migrations. */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV !== "development") {
    const url = env.DATABASE_URL || env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL or POSTGRES_URL must be set");
    return url;
  }

  const url = env.DEV_DATABASE_URL;
  const project = env.DEV_SUPABASE_PROJECT_REF;
  if (!url || !project || !/^[a-z0-9]+$/.test(project)) {
    throw new Error("Development requires DEV_DATABASE_URL and DEV_SUPABASE_PROJECT_REF for the approved Supabase development database; production URL aliases are not used.");
  }

  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error("DEV_DATABASE_URL must be a PostgreSQL URL for the approved Supabase development project."); }

  const direct = parsed.hostname === `db.${project}.supabase.co`;
  const pooler = parsed.hostname.endsWith(".pooler.supabase.com") &&
    parsed.username === `postgres.${project}` && (!parsed.port || parsed.port === "5432");
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || (!direct && !pooler)) {
    throw new Error("Development database does not match DEV_SUPABASE_PROJECT_REF; refusing to connect or migrate.");
  }
  if (parsed.searchParams.get("sslmode") === "disable" || env.PGSSLMODE === "disable") {
    throw new Error("The Supabase development database requires TLS; remove sslmode=disable and PGSSLMODE=disable.");
  }
  return url;
}
