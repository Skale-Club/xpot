-- Physical inventory state is independent from the QR/NFC activation state.

ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "stock_status" text NOT NULL DEFAULT 'available';
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "ownership_type" text NOT NULL DEFAULT 'company';
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "custodian_rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "internal_use_note" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "stock_updated_at" timestamptz NOT NULL DEFAULT now();

ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_stock_status_check";
ALTER TABLE "tags" ADD CONSTRAINT "tags_stock_status_check"
  CHECK ("stock_status" IN ('available', 'reserved', 'internal_use', 'sold', 'damaged', 'lost', 'retired'));
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_ownership_type_check";
ALTER TABLE "tags" ADD CONSTRAINT "tags_ownership_type_check"
  CHECK ("ownership_type" IN ('company', 'rep', 'customer'));

UPDATE "tags"
SET
  "stock_status" = CASE
    WHEN "status" = 'retired' THEN 'retired'
    WHEN "sold_at" IS NOT NULL THEN 'sold'
    ELSE 'available'
  END,
  "ownership_type" = CASE
    WHEN "sold_at" IS NOT NULL THEN 'customer'
    WHEN EXISTS (
      SELECT 1 FROM "tag_acquisition_units" u
      WHERE u."tag_id" = "tags"."id" AND u."returned_at" IS NULL
    ) THEN 'rep'
    ELSE 'company'
  END,
  "custodian_rep_id" = "rep_id",
  "stock_updated_at" = COALESCE("updated_at", now());

CREATE INDEX IF NOT EXISTS "tags_stock_status_idx" ON "tags" ("stock_status", "custodian_rep_id");

CREATE TABLE IF NOT EXISTS "tag_stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "movement_type" text NOT NULL CHECK ("movement_type" IN (
    'migration', 'intake', 'transfer', 'return', 'reserve', 'release', 'sale',
    'internal_use', 'damage', 'loss', 'restore', 'retire', 'adjustment'
  )),
  "from_stock_status" text,
  "to_stock_status" text NOT NULL,
  "from_ownership_type" text,
  "to_ownership_type" text NOT NULL,
  "from_custodian_rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL,
  "to_custodian_rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL,
  "reference_type" text,
  "reference_id" text,
  "actor_user_id" text,
  "reason" text,
  "idempotency_key" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tag_stock_movements_tag_idx" ON "tag_stock_movements" ("tag_id", "created_at");
CREATE INDEX IF NOT EXISTS "tag_stock_movements_reference_idx" ON "tag_stock_movements" ("reference_type", "reference_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tag_stock_movements_idempotency_unique"
  ON "tag_stock_movements" ("actor_user_id", "idempotency_key")
  WHERE "actor_user_id" IS NOT NULL AND "idempotency_key" IS NOT NULL;

INSERT INTO "tag_stock_movements" (
  "tag_id", "movement_type", "to_stock_status", "to_ownership_type", "to_custodian_rep_id",
  "reference_type", "reference_id", "reason", "created_at"
)
SELECT
  t."id", 'migration', t."stock_status", t."ownership_type", t."custodian_rep_id",
  'migration', '0029', 'Initial stock state derived from existing Xpot data', COALESCE(t."registered_at", t."created_at")
FROM "tags" t
WHERE NOT EXISTS (SELECT 1 FROM "tag_stock_movements" m WHERE m."tag_id" = t."id");

CREATE OR REPLACE FUNCTION "tag_stock_movements_immutable"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tag_stock_movements rows are immutable';
END;
$$;
DROP TRIGGER IF EXISTS "tag_stock_movements_no_update" ON "tag_stock_movements";
CREATE TRIGGER "tag_stock_movements_no_update"
  BEFORE UPDATE OR DELETE ON "tag_stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "tag_stock_movements_immutable"();

ALTER TABLE "tag_stock_movements" ENABLE ROW LEVEL SECURITY;
