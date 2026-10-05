-- Tags: the "face" of a piece, i.e. what is printed on it (the Instagram mark,
-- Google's G, a phone, an envelope…). Set on the batch, where every piece of a run
-- is printed alike, and optionally overridden on one piece. NULL means "ask the
-- batch, then the product" (shared/tagFace.ts resolveTagFace). Values come from
-- TAG_FACES and are validated by the API, not by a CHECK, so new faces need no
-- migration.

ALTER TABLE "tag_batches" ADD COLUMN IF NOT EXISTS "face" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "face" text;

-- The first Instagram run was created as a "custom" product before faces existed.
-- Its pieces carry the Instagram mark (NFC Plaque, 2026-10-04). This is a no-op on
-- any database that has no such batch.
UPDATE "tag_batches" SET "face" = 'instagram' WHERE "batch_code" = 'IG-2026-001' AND "face" IS NULL;
