-- Which NFC goes inside a piece, chosen when a print is asked for (docs/NFC_MOUNT_EXECUTION_PLAN.md). Each type is a
-- different print file, so one version now holds one variant per type it was built and checked with:
--   print_model_versions.nfc_variants = { "<mount>": { pause: { z, text }, consumes: [...], material?: {...} } }
--   print_requests.nfc_mount, print_jobs.nfc_mount = the type chosen.
-- Old versions have no variants and old requests no type (NULL): they keep printing what their version says.
-- Idempotent: safe to run more than once.
-- Recovery: alter table print_jobs drop column nfc_mount; alter table print_requests drop column nfc_mount;
--           alter table print_model_versions drop column nfc_variants.

ALTER TABLE "print_model_versions" ADD COLUMN IF NOT EXISTS "nfc_variants" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "print_requests" ADD COLUMN IF NOT EXISTS "nfc_mount" text;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "nfc_mount" text;
