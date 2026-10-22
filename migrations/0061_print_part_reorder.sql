-- Tags › Production, phase 4 (docs/PRINT_EXECUTION_PLAN.md §5.4-5.5): a part's reorder point. When its count falls
-- below it, the catalog says so (print more bases before a Stand order needs them). Null: no alert.
-- Adds a nullable column only. Idempotent.

ALTER TABLE "print_models" ADD COLUMN IF NOT EXISTS "part_reorder_at" integer;

DO $$ BEGIN
  ALTER TABLE "print_models" ADD CONSTRAINT "print_models_part_reorder_check" CHECK ("part_reorder_at" IS NULL OR "part_reorder_at" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
