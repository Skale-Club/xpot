-- Enable Row Level Security on the remaining public tables.
--
-- These tables had RLS disabled while the public anon/authenticated roles held
-- DML grants, so the publicly-shipped Supabase anon key could read/write them
-- directly via PostgREST, bypassing the Express API. For chat_integrations and
-- integration_settings this is acute: both hold an `api_key` secret column that
-- was therefore readable by anyone holding the (public) anon key.
--
-- The app connects as the table owner (postgres, BYPASSRLS = true), so enabling
-- RLS does NOT affect application queries; it only blocks direct anon/authenticated
-- access (default-deny, no policies). This completes the coverage started for the
-- sales_ tables in 0004, so every public table is now RLS-protected.
--
-- _xpot_migrations is written only by scripts/migrate.ts, which also connects as
-- the owner, so the migration runner is unaffected.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_xpot_migrations" ENABLE ROW LEVEL SECURITY;
