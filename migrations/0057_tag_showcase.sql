-- Tags › Shop: the showcase of what Skale Club sells. Xpot sells nothing itself:
-- the Stuscle store is the sales engine, so a showcase entry only describes a
-- piece model or a ready-made kit and sends the reseller to Stuscle (wholesale,
-- or straight to a cart for a kit). An entry is typed in by the Xpot admin.
--   * kind 'model': a piece model; its button opens the wholesale page.
--   * kind 'kit': a ready-made kit; `items` is the list of Stuscle SKUs and
--     quantities the link puts in the reseller's cart (prices are Stuscle's).
--   * reference_price_cents: optional, typed by hand, shown as a reference only.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS "tag_showcase_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "includes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "image_url" text,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reference_price_cents" integer,
  "currency" text NOT NULL DEFAULT 'USD',
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_published" boolean NOT NULL DEFAULT false,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "tag_showcase_items"
    ADD CONSTRAINT "tag_showcase_items_kind_check" CHECK ("kind" IN ('model', 'kit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tag_showcase_items"
    ADD CONSTRAINT "tag_showcase_items_price_check" CHECK ("reference_price_cents" IS NULL OR "reference_price_cents" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "tag_showcase_items_order_idx" ON "tag_showcase_items" ("is_published", "sort_order", "created_at");

ALTER TABLE "tag_showcase_items" ENABLE ROW LEVEL SECURITY;
