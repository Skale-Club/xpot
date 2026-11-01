-- A partner prints only our models (docs/PROFILES_EXECUTION_PLAN.md, D2). What differs is the material, so each model
-- says what it needs, and each organization says which models it may print.
--   * print_models.materials: [{ kind: 'nfc_sticker' | 'filament' | 'other', name, spec?, supplier?, url?, note? }],
--     written by the platform only. The partner reads it as "What you need" before ordering.
--   * organizations.released_print_models: the models (slugs) an organization may request, generate and print;
--     NULL = every model (the company and every organization that existed before), an empty list = none. Written by
--     the platform only; the server refuses any other model (print_model_not_released).
-- Backfill: no supplier or link is invented. A model whose current version already uses the 10 x 20 NFC sticker pocket
-- (params.nfc_mount sticker_10x20 / rear_sticker_10x20*, or it consumes the nfc-sticker-10x20 part) gets that sticker;
-- every other model stays empty for the platform to fill in.
-- Idempotent: safe to run more than once. Recovery: drop the two columns.

ALTER TABLE "print_models" ADD COLUMN IF NOT EXISTS "materials" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "released_print_models" text[];

UPDATE "print_models" m
SET "materials" = '[{"kind": "nfc_sticker", "name": "NFC sticker", "spec": "10 x 20 mm"}]'::jsonb
FROM "print_model_versions" v
WHERE v."id" = m."current_version_id"
  AND m."kind" = 'serialized'
  AND m."materials" = '[]'::jsonb
  AND (
    v."params"->>'nfc_mount' ~ 'sticker_10x20'
    OR v."consumes" @> '[{"part": "nfc-sticker-10x20"}]'::jsonb
  );
