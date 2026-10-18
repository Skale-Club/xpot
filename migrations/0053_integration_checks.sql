-- The last "Test" result of each provider in Admin › Integrations, so the card
-- (and Status) can say "last tested OK 2 h ago" instead of forgetting it on
-- reload. One row per provider of shared/integrations-registry.ts, kept apart
-- from chat_integrations/integration_settings so a test never creates or edits
-- a provider's settings row. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS "integration_checks" (
  "provider" text PRIMARY KEY,
  "ok" boolean NOT NULL,
  "message" text NOT NULL,
  "checked_at" timestamptz NOT NULL DEFAULT now(),
  "last_ok_at" timestamptz
);

-- Same default-deny as every other public table (0007): only the app's owner role reads it.
ALTER TABLE "integration_checks" ENABLE ROW LEVEL SECURITY;
