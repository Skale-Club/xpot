-- A batch is now an intake container created when the physical pieces are in
-- hand. It starts empty; scanning a printed Xpot code creates each stock row.

ALTER TABLE "tag_batches" DROP CONSTRAINT IF EXISTS "tag_batches_quantity_check";
ALTER TABLE "tag_batches" ALTER COLUMN "quantity" SET DEFAULT 0;
ALTER TABLE "tag_batches" ADD CONSTRAINT "tag_batches_quantity_check" CHECK ("quantity" >= 0);

UPDATE "tag_batches"
SET "quantity" = counts.n
FROM (
  SELECT b."id", count(t."id")::integer AS n
  FROM "tag_batches" b
  LEFT JOIN "tags" t ON t."batch_id" = b."id"
  GROUP BY b."id"
) counts
WHERE "tag_batches"."id" = counts."id";

ALTER TABLE "tag_batches" DROP CONSTRAINT IF EXISTS "tag_batches_status_check";
UPDATE "tag_batches" SET "status" = CASE WHEN "status" = 'cancelled' THEN 'cancelled' ELSE 'closed' END;
ALTER TABLE "tag_batches" ALTER COLUMN "status" SET DEFAULT 'open';
ALTER TABLE "tag_batches" ADD CONSTRAINT "tag_batches_status_check"
  CHECK ("status" IN ('open', 'closed', 'cancelled'));

ALTER TABLE "tag_batches" ADD COLUMN IF NOT EXISTS "closed_at" timestamptz;
ALTER TABLE "tag_batches" ADD COLUMN IF NOT EXISTS "closed_by_user_id" text;
ALTER TABLE "tag_batches" ADD COLUMN IF NOT EXISTS "reopened_at" timestamptz;
ALTER TABLE "tag_batches" ADD COLUMN IF NOT EXISTS "reopened_by_user_id" text;
ALTER TABLE "tag_batches" ADD COLUMN IF NOT EXISTS "reopen_reason" text;

ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "registered_at" timestamptz;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "registered_by_user_id" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "scanned_payload" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "intake_idempotency_key" text;

UPDATE "tags" SET "registered_at" = "created_at" WHERE "registered_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tags_batch_serial_unique"
  ON "tags" ("batch_id", "serial_number")
  WHERE "batch_id" IS NOT NULL AND "serial_number" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tags_intake_idempotency_unique"
  ON "tags" ("registered_by_user_id", "intake_idempotency_key")
  WHERE "registered_by_user_id" IS NOT NULL AND "intake_idempotency_key" IS NOT NULL;
