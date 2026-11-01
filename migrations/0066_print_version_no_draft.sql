-- Tags › Production: a version is `current` or `superseded`, nothing else. `draft` was in the first CHECK
-- (0059_print_production.sql) but no code path ever writes it: a version is registered once its design builds and its
-- sample checks pass, and becomes current at once (shared/printProduction.ts PRINT_VERSION_STATUSES).
-- A leftover draft row (none expected) becomes superseded, then the CHECK drops the value. Idempotent.

UPDATE "print_model_versions" SET "status" = 'superseded' WHERE "status" = 'draft';

ALTER TABLE "print_model_versions" DROP CONSTRAINT IF EXISTS "print_model_versions_status_check";
ALTER TABLE "print_model_versions" ADD CONSTRAINT "print_model_versions_status_check" CHECK ("status" IN ('current', 'superseded'));
