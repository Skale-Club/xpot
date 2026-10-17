-- Errors and warnings the app records about itself (server/observability/events.ts),
-- read by the admin's System health screen. One row per occurrence; the
-- fingerprint groups repeats of the same problem. Rows older than 30 days are
-- pruned by the app. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS "system_events" (
  "id" serial PRIMARY KEY,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "level" text NOT NULL,
  "source" text NOT NULL,
  "message" text NOT NULL,
  "detail" text,
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "rep_id" integer,
  "fingerprint" text NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "system_events"
    ADD CONSTRAINT "system_events_level_check" CHECK ("level" IN ('error', 'warn'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "system_events_created_at_idx" ON "system_events" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "system_events_source_created_at_idx" ON "system_events" ("source", "created_at" DESC);

-- Same default-deny as every other public table (0007): only the app's owner role reads it.
ALTER TABLE "system_events" ENABLE ROW LEVEL SECURITY;
