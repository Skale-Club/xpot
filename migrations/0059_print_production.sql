-- Tags › Production (docs/PRINT_EXECUTION_PLAN.md): the catalog of what the house prints, the versions of each
-- recipe, and the queue of print orders with their files. Allowed values: shared/printProduction.ts.
--   * print_models: product × face × theme, or a part with no code (a Stand base, a G token).
--   * print_model_versions: the frozen recipe of a model; one `current` per model; an improvement is a new version.
--   * print_jobs: one order "print N of this version"; a serialized order owns the batch it issued.
--   * print_job_files: the order's .3mf, sliced file, serial map, report and preview, in the private file store.
--   * print_part_movements: the ledger behind a part's on-hand count.
-- Also: tag_batches.print_job_id (the order a batch came from) and tag_provisioning_devices.capabilities
-- (the same paired desktop app writes chips and, as the bench, builds print files).
-- Adds tables and nullable columns only. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS "print_models" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "product_type" text,
  "face" text,
  "theme" text,
  "sales_product_id" integer REFERENCES "sales_products"("id") ON DELETE SET NULL,
  "batch_prefix" text,
  "status" text NOT NULL DEFAULT 'design_needed',
  "current_version_id" uuid,
  "part_on_hand" integer NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "print_models_slug_unique" ON "print_models" ("slug");

DO $$ BEGIN
  ALTER TABLE "print_models" ADD CONSTRAINT "print_models_kind_check" CHECK ("kind" IN ('serialized', 'part'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "print_models" ADD CONSTRAINT "print_models_status_check" CHECK ("status" IN ('design_needed', 'ready', 'retired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "print_model_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "model_id" uuid NOT NULL REFERENCES "print_models"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'current',
  "builder" text,
  "params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recipe" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "beds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "consumes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "changelog" text,
  "fixes_batch_id" uuid REFERENCES "tag_batches"("id") ON DELETE SET NULL,
  "source" text NOT NULL DEFAULT 'admin',
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "print_model_versions_number_unique" ON "print_model_versions" ("model_id", "version");
-- One current recipe per model.
CREATE UNIQUE INDEX IF NOT EXISTS "print_model_versions_current_unique" ON "print_model_versions" ("model_id") WHERE "status" = 'current';

DO $$ BEGIN
  ALTER TABLE "print_model_versions" ADD CONSTRAINT "print_model_versions_status_check" CHECK ("status" IN ('draft', 'current', 'superseded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "print_model_versions" ADD CONSTRAINT "print_model_versions_source_check" CHECK ("source" IN ('admin', 'mcp', 'bench'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "print_models" ADD CONSTRAINT "print_models_current_version_fk"
    FOREIGN KEY ("current_version_id") REFERENCES "print_model_versions"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "print_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "model_id" uuid NOT NULL REFERENCES "print_models"("id") ON DELETE RESTRICT,
  "version_id" uuid NOT NULL REFERENCES "print_model_versions"("id") ON DELETE RESTRICT,
  "bed_label" text NOT NULL,
  "plates" integer NOT NULL DEFAULT 1,
  "quantity" integer NOT NULL,
  "batch_id" uuid REFERENCES "tag_batches"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'requested',
  "device_id" uuid REFERENCES "tag_provisioning_devices"("id") ON DELETE SET NULL,
  "report" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text,
  "error_code" text,
  "error_message" text,
  "requested_by_user_id" text,
  "claimed_at" timestamptz,
  "built_at" timestamptz,
  "printed_at" timestamptz,
  "last_event_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_status_check"
    CHECK ("status" IN ('requested', 'building', 'ready', 'printing', 'printed', 'failed', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_quantity_check" CHECK ("quantity" > 0 AND "plates" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "print_jobs_status_idx" ON "print_jobs" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "print_jobs_model_idx" ON "print_jobs" ("model_id", "created_at");
-- A batch belongs to one live order; a failed or cancelled order's batch can be printed again by a new one.
CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_batch_unique" ON "print_jobs" ("batch_id")
  WHERE "batch_id" IS NOT NULL AND "status" NOT IN ('failed', 'cancelled');

CREATE TABLE IF NOT EXISTS "print_job_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" uuid NOT NULL REFERENCES "print_jobs"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "file_ref" text NOT NULL,
  "filename" text NOT NULL,
  "bytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "print_job_files" ADD CONSTRAINT "print_job_files_kind_check"
    CHECK ("kind" IN ('3mf', 'gcode_3mf', 'serial_map', 'report', 'preview'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "print_job_files_job_idx" ON "print_job_files" ("job_id", "created_at");

CREATE TABLE IF NOT EXISTS "print_part_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "model_id" uuid NOT NULL REFERENCES "print_models"("id") ON DELETE CASCADE,
  "delta" integer NOT NULL,
  "reason" text NOT NULL,
  "job_id" uuid REFERENCES "print_jobs"("id") ON DELETE SET NULL,
  "batch_id" uuid REFERENCES "tag_batches"("id") ON DELETE SET NULL,
  "note" text,
  "actor_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "print_part_movements" ADD CONSTRAINT "print_part_movements_reason_check"
    CHECK ("reason" IN ('printed', 'assembled', 'used', 'adjustment'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "print_part_movements_model_idx" ON "print_part_movements" ("model_id", "created_at");

ALTER TABLE "tag_batches" ADD COLUMN IF NOT EXISTS "print_job_id" uuid;
DO $$ BEGIN
  ALTER TABLE "tag_batches" ADD CONSTRAINT "tag_batches_print_job_fk"
    FOREIGN KEY ("print_job_id") REFERENCES "print_jobs"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- What a paired desktop app does: 'nfc' (write chips, every app paired so far) and/or 'print' (the bench).
ALTER TABLE "tag_provisioning_devices" ADD COLUMN IF NOT EXISTS "capabilities" jsonb NOT NULL DEFAULT '["nfc"]'::jsonb;

ALTER TABLE "print_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_model_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_job_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_part_movements" ENABLE ROW LEVEL SECURITY;
