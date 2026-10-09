-- Financial sales for physical Tags and per-piece acquisition cost.

ALTER TABLE "sales_reps"
  ADD COLUMN IF NOT EXISTS "cost_policy" TEXT NOT NULL DEFAULT 'acquisition',
  ADD COLUMN IF NOT EXISTS "cost_policy_configured_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "cost_policy_configured_by_user_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_cost_policy_check"
    CHECK ("cost_policy" IN ('zero', 'acquisition'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "tag_batches"
  ADD COLUMN IF NOT EXISTS "sales_product_id" INTEGER REFERENCES "sales_products"("id") ON DELETE SET NULL;
ALTER TABLE "tags"
  ADD COLUMN IF NOT EXISTS "sales_product_id" INTEGER REFERENCES "sales_products"("id") ON DELETE SET NULL;

UPDATE "tags" t
SET "sales_product_id" = b."sales_product_id"
FROM "tag_batches" b
WHERE t."batch_id" = b."id"
  AND t."sales_product_id" IS NULL
  AND b."sales_product_id" IS NOT NULL;

ALTER TABLE "sales_sales"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_sales_rep_idempotency_unique"
  ON "sales_sales" ("rep_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "sales_sale_items"
  ADD COLUMN IF NOT EXISTS "allocated_discount_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "net_total_cents" INTEGER NOT NULL DEFAULT 0;

-- Preserve existing rows: old line totals are gross. Allocate each sale's
-- discount proportionally; the last line absorbs any rounding remainder.
WITH ranked AS (
  SELECT
    i."id",
    i."sale_id",
    i."total_cents",
    s."discount_cents",
    s."subtotal_cents",
    row_number() OVER (PARTITION BY i."sale_id" ORDER BY i."id") AS rn,
    count(*) OVER (PARTITION BY i."sale_id") AS cnt,
    floor(
      CASE WHEN s."subtotal_cents" > 0
        THEN s."discount_cents"::numeric * i."total_cents" / s."subtotal_cents"
        ELSE 0 END
    )::integer AS base_discount
  FROM "sales_sale_items" i
  JOIN "sales_sales" s ON s."id" = i."sale_id"
), allocated AS (
  SELECT r.*,
    CASE WHEN r.rn = r.cnt
      THEN r."discount_cents" - sum(r.base_discount) OVER (PARTITION BY r."sale_id") + r.base_discount
      ELSE r.base_discount END AS line_discount
  FROM ranked r
)
UPDATE "sales_sale_items" i
SET
  "allocated_discount_cents" = greatest(0, least(a.line_discount, i."total_cents")),
  "net_total_cents" = i."total_cents" - greatest(0, least(a.line_discount, i."total_cents"))
FROM allocated a
WHERE a."id" = i."id";

CREATE TABLE IF NOT EXISTS "tag_acquisitions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id"),
  "kit_id" UUID REFERENCES "tag_kits"("id") ON DELETE SET NULL,
  "source" TEXT NOT NULL CHECK ("source" IN ('stuscle', 'manual', 'house', 'migration')),
  "external_ref" TEXT,
  "external_payload_hash" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'fulfilled', 'cancelled')),
  "purchased_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tag_acquisitions_rep_idx" ON "tag_acquisitions" ("rep_id", "purchased_at");
CREATE UNIQUE INDEX IF NOT EXISTS "tag_acquisitions_external_unique"
  ON "tag_acquisitions" ("source", "external_ref") WHERE "external_ref" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "tag_acquisition_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "acquisition_id" UUID NOT NULL REFERENCES "tag_acquisitions"("id") ON DELETE CASCADE,
  "sales_product_id" INTEGER REFERENCES "sales_products"("id") ON DELETE SET NULL,
  "external_sku" TEXT,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "subtotal_cents" INTEGER NOT NULL CHECK ("subtotal_cents" >= 0),
  "unit_cost_cents" INTEGER NOT NULL CHECK ("unit_cost_cents" >= 0),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tag_acquisition_lines_acquisition_idx"
  ON "tag_acquisition_lines" ("acquisition_id");

CREATE TABLE IF NOT EXISTS "tag_acquisition_units" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "acquisition_line_id" UUID NOT NULL REFERENCES "tag_acquisition_lines"("id") ON DELETE CASCADE,
  "tag_id" UUID NOT NULL REFERENCES "tags"("id") ON DELETE RESTRICT,
  "unit_cost_cents" INTEGER NOT NULL CHECK ("unit_cost_cents" >= 0),
  "override_cost_cents" INTEGER CHECK ("override_cost_cents" >= 0),
  "override_reason" TEXT,
  "overridden_by_user_id" TEXT,
  "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "returned_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "tag_acquisition_units_tag_idx"
  ON "tag_acquisition_units" ("tag_id", "assigned_at");
CREATE UNIQUE INDEX IF NOT EXISTS "tag_acquisition_units_one_active_per_tag"
  ON "tag_acquisition_units" ("tag_id") WHERE "returned_at" IS NULL;

CREATE TABLE IF NOT EXISTS "sales_sale_tags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sale_id" INTEGER NOT NULL REFERENCES "sales_sales"("id") ON DELETE CASCADE,
  "sale_item_id" INTEGER NOT NULL REFERENCES "sales_sale_items"("id") ON DELETE CASCADE,
  "tag_id" UUID NOT NULL REFERENCES "tags"("id") ON DELETE RESTRICT,
  "acquisition_unit_id" UUID REFERENCES "tag_acquisition_units"("id") ON DELETE SET NULL,
  "cost_basis_cents" INTEGER NOT NULL CHECK ("cost_basis_cents" >= 0),
  "cost_source" TEXT NOT NULL CHECK ("cost_source" IN ('policy_zero', 'manual_override', 'acquisition')),
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'cancelled', 'returned')),
  "sold_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ended_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "sales_sale_tags_sale_idx" ON "sales_sale_tags" ("sale_id");
CREATE INDEX IF NOT EXISTS "sales_sale_tags_tag_idx" ON "sales_sale_tags" ("tag_id", "sold_at");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_sale_tags_one_active_per_tag"
  ON "sales_sale_tags" ("tag_id") WHERE "status" = 'active';

ALTER TABLE "tag_acquisitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_acquisition_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_acquisition_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_sale_tags" ENABLE ROW LEVEL SECURITY;
