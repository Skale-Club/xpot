-- Tags › Production: print by quantity, by hand (docs/PRINT_EXECUTION_PLAN.md §15). An admin (or an AI session) asks
-- for N pieces of a model; the request is split into plates of at most one bed each, the last one possibly partial
-- (10 Stands on a 4-up bed: 4 + 4 + 2). Each plate is a print order (print_jobs) with its own batch, files and status:
-- the admin downloads it, prints it in Bambu Studio and marks it printed. Nothing is sent to the printer any more:
-- the send-to-printer columns of 0060 stay, unused.
--   * print_requests: what was asked (model, version, bed, how many pieces, notes).
--   * print_jobs.request_id / plate_number: the request a plate belongs to and its place in it ("plate 2 of 3").
-- Every order made before this becomes a request of one plate (the request takes the order's id).
-- Adds a table and nullable columns. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS "print_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "model_id" uuid NOT NULL REFERENCES "print_models"("id") ON DELETE RESTRICT,
  "version_id" uuid NOT NULL REFERENCES "print_model_versions"("id") ON DELETE RESTRICT,
  "bed_label" text NOT NULL,
  "quantity" integer NOT NULL,
  "notes" text,
  "source" text NOT NULL DEFAULT 'admin',
  "requested_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "print_requests" ADD CONSTRAINT "print_requests_quantity_check" CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "print_requests_created_idx" ON "print_requests" ("created_at");

ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "request_id" uuid;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "plate_number" integer;

DO $$ BEGIN
  ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_request_fk"
    FOREIGN KEY ("request_id") REFERENCES "print_requests"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "print_jobs_request_idx" ON "print_jobs" ("request_id", "plate_number");

INSERT INTO "print_requests" ("id", "model_id", "version_id", "bed_label", "quantity", "notes", "source", "requested_by_user_id", "created_at")
SELECT j."id", j."model_id", j."version_id", j."bed_label", j."quantity", j."notes", 'admin', j."requested_by_user_id", j."created_at"
FROM "print_jobs" j
WHERE j."request_id" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "print_jobs" SET "request_id" = "id", "plate_number" = 1 WHERE "request_id" IS NULL;

ALTER TABLE "print_requests" ENABLE ROW LEVEL SECURITY;
