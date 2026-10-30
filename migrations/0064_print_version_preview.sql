-- Tags › Production: a version's 3D preview, one sample piece as a GLB (print-pipeline/preview.py) that the model and
-- plate pages show as a rotatable model. { fileRef, fileName, bytes, sha256, uploadedAt }; the file is private and the
-- server streams it. Null: no preview yet.
-- Adds a nullable column only. Idempotent.

ALTER TABLE "print_model_versions" ADD COLUMN IF NOT EXISTS "preview" jsonb;
