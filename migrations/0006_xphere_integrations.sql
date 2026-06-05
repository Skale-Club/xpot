-- Per-user (tenant) Xphere integration config.
--
-- Each user/email is a tenant with its own Xphere credentials (instead of global
-- env vars): an inbound key that identifies the tenant on POST /api/xpot/inbound/
-- prospects, plus an outbound xph_ token + base URL used to sync visit outcomes
-- back. Managed per user in the app panel.
--
-- RLS enabled (consistent with the sales_ tables): the app connects as the owner
-- (postgres, BYPASSRLS), so app queries are unaffected; direct anon/authenticated
-- access is blocked (these are secrets).

CREATE TABLE IF NOT EXISTS "xphere_integrations" (
  "id" SERIAL PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id"),
  "inbound_api_key" TEXT,
  "api_key" TEXT,
  "api_url" TEXT DEFAULT 'https://xphere.app',
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "xphere_integrations_user_idx" ON "xphere_integrations" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "xphere_integrations_inbound_key_idx" ON "xphere_integrations" ("inbound_api_key");

ALTER TABLE "xphere_integrations" ENABLE ROW LEVEL SECURITY;
