-- Sales module: product catalog, direct sales with line items, and consigned
-- stock left at establishments (deposit → resell → periodic settlement/restock).
--
-- Money is stored in integer minor units (cents) so a $4.50 unit price and a
-- $149.90 site fit without floating point. Currency is per row, default USD.
--
-- Consignment model:
--   sales_consignments           one live agreement per (lead, product): the
--                                stock currently sitting at the establishment,
--                                the agreed B2B unit price, running totals and
--                                when the rep is due back.
--   sales_consignment_movements  the ledger. Every deposit, settlement, return
--                                or adjustment is a row with the stock level
--                                before/after, so the on-hand figure on the
--                                agreement is always reconstructible.
--   A settlement counts what is left, bills the difference, and produces a
--   sales_sales row (kind = consignment_settlement) with one line item.
--
-- RLS enabled on every table, consistent with the rest of the schema: the app
-- connects as the owner (BYPASSRLS), direct anon access is blocked.

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "sales_product_kind" AS ENUM ('digital', 'physical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "sales_sale_kind" AS ENUM ('direct', 'consignment_settlement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "sales_sale_status" AS ENUM ('completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "sales_payment_status" AS ENUM ('unpaid', 'partial', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "sales_consignment_status" AS ENUM ('active', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "sales_consignment_movement_type" AS ENUM ('deposit', 'settlement', 'return', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Catalog ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sales_products" (
  "id" SERIAL PRIMARY KEY,
  "sku" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "kind" "sales_product_kind" NOT NULL DEFAULT 'physical',
  "category" TEXT,
  "unit_label" TEXT NOT NULL DEFAULT 'unit',
  -- B2B price charged to the establishment, per unit.
  "base_price_cents" INTEGER NOT NULL DEFAULT 0,
  -- What the establishment is suggested to resell for (physical goods).
  "suggested_retail_cents" INTEGER,
  -- Production cost per unit, for margin analysis (e.g. filament + time).
  "cost_cents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  -- Can be left at an establishment on consignment.
  "consignable" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Volume pricing: the highest tier whose min_quantity <= quantity wins;
-- below the lowest tier the product's base price applies.
CREATE TABLE IF NOT EXISTS "sales_product_price_tiers" (
  "id" SERIAL PRIMARY KEY,
  "product_id" INTEGER NOT NULL REFERENCES "sales_products"("id") ON DELETE CASCADE,
  "label" TEXT,
  "min_quantity" INTEGER NOT NULL,
  "unit_price_cents" INTEGER NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  CONSTRAINT "sales_product_price_tiers_min_qty_positive" CHECK ("min_quantity" > 0),
  CONSTRAINT "sales_product_price_tiers_unique_qty" UNIQUE ("product_id", "min_quantity")
);

-- ── Consignments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sales_consignments" (
  "id" SERIAL PRIMARY KEY,
  "lead_id" INTEGER NOT NULL REFERENCES "sales_leads"("id"),
  "product_id" INTEGER NOT NULL REFERENCES "sales_products"("id"),
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id"),
  "status" "sales_consignment_status" NOT NULL DEFAULT 'active',
  -- Agreed B2B unit price for this establishment (defaults from the product).
  "unit_price_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  -- Stock currently at the establishment. Cached from the movement ledger.
  "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
  "total_deposited" INTEGER NOT NULL DEFAULT 0,
  "total_sold" INTEGER NOT NULL DEFAULT 0,
  "total_returned" INTEGER NOT NULL DEFAULT 0,
  "total_settled_cents" INTEGER NOT NULL DEFAULT 0,
  "settlement_interval_days" INTEGER NOT NULL DEFAULT 30,
  "opened_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "last_settlement_at" TIMESTAMP,
  "next_visit_due_at" TIMESTAMP,
  "closed_at" TIMESTAMP,
  "notes" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW(),
  CONSTRAINT "sales_consignments_on_hand_nonnegative" CHECK ("quantity_on_hand" >= 0)
);

-- One live agreement per product per establishment; closed ones are history.
CREATE UNIQUE INDEX IF NOT EXISTS "sales_consignments_active_unique"
  ON "sales_consignments" ("lead_id", "product_id") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "sales_consignments_lead_idx" ON "sales_consignments" ("lead_id");
CREATE INDEX IF NOT EXISTS "sales_consignments_rep_idx" ON "sales_consignments" ("rep_id");
CREATE INDEX IF NOT EXISTS "sales_consignments_due_idx" ON "sales_consignments" ("next_visit_due_at") WHERE "status" = 'active';

-- ── Sales ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sales_sales" (
  "id" SERIAL PRIMARY KEY,
  "lead_id" INTEGER NOT NULL REFERENCES "sales_leads"("id"),
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id"),
  -- Optional: the visit this sale happened in. Null when sold from the lead card.
  -- ON DELETE SET NULL: deleting a visit must not fail on a sale that
  -- references it (the DAT-01 bug that already exists for tasks). The sale is
  -- the record of money and outlives the visit.
  "visit_id" INTEGER REFERENCES "sales_visits"("id") ON DELETE SET NULL,
  -- Set when the sale is the billing of a consignment settlement.
  "consignment_id" INTEGER REFERENCES "sales_consignments"("id"),
  "kind" "sales_sale_kind" NOT NULL DEFAULT 'direct',
  "status" "sales_sale_status" NOT NULL DEFAULT 'completed',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
  "discount_cents" INTEGER NOT NULL DEFAULT 0,
  "total_cents" INTEGER NOT NULL DEFAULT 0,
  "payment_status" "sales_payment_status" NOT NULL DEFAULT 'paid',
  "payment_method" TEXT,
  "paid_cents" INTEGER NOT NULL DEFAULT 0,
  "paid_at" TIMESTAMP,
  "sold_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "notes" TEXT,
  "cancelled_at" TIMESTAMP,
  "cancel_reason" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "sales_sales_lead_idx" ON "sales_sales" ("lead_id");
CREATE INDEX IF NOT EXISTS "sales_sales_rep_idx" ON "sales_sales" ("rep_id");
CREATE INDEX IF NOT EXISTS "sales_sales_visit_idx" ON "sales_sales" ("visit_id");
CREATE INDEX IF NOT EXISTS "sales_sales_sold_at_idx" ON "sales_sales" ("sold_at");
CREATE INDEX IF NOT EXISTS "sales_sales_status_idx" ON "sales_sales" ("status");

CREATE TABLE IF NOT EXISTS "sales_sale_items" (
  "id" SERIAL PRIMARY KEY,
  "sale_id" INTEGER NOT NULL REFERENCES "sales_sales"("id") ON DELETE CASCADE,
  "product_id" INTEGER REFERENCES "sales_products"("id"),
  -- Snapshot of the product name at sale time (or free text for ad-hoc items).
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit_price_cents" INTEGER NOT NULL DEFAULT 0,
  -- Production cost per unit, COPIED from the product at sale time. Profit is
  -- (unit_price - unit_cost) * quantity; freezing the cost here means editing a
  -- product's cost later never rewrites the profit of past sales.
  "unit_cost_cents" INTEGER NOT NULL DEFAULT 0,
  "total_cents" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP DEFAULT NOW(),
  CONSTRAINT "sales_sale_items_qty_positive" CHECK ("quantity" > 0)
);

CREATE INDEX IF NOT EXISTS "sales_sale_items_sale_idx" ON "sales_sale_items" ("sale_id");
CREATE INDEX IF NOT EXISTS "sales_sale_items_product_idx" ON "sales_sale_items" ("product_id");

-- ── Consignment ledger (references sales, so it comes last) ───────────────────

CREATE TABLE IF NOT EXISTS "sales_consignment_movements" (
  "id" SERIAL PRIMARY KEY,
  "consignment_id" INTEGER NOT NULL REFERENCES "sales_consignments"("id") ON DELETE CASCADE,
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id"),
  "visit_id" INTEGER REFERENCES "sales_visits"("id") ON DELETE SET NULL,
  -- The sale a settlement produced (null for deposits/returns/adjustments and
  -- for a settlement where nothing was sold).
  "sale_id" INTEGER REFERENCES "sales_sales"("id") ON DELETE SET NULL,
  "type" "sales_consignment_movement_type" NOT NULL,
  -- deposit: units added · settlement: units sold · return/adjustment: units removed
  "quantity" INTEGER NOT NULL DEFAULT 0,
  -- settlement only: the physical count the rep made on site.
  "counted_remaining" INTEGER,
  "on_hand_before" INTEGER NOT NULL,
  "on_hand_after" INTEGER NOT NULL,
  "unit_price_cents" INTEGER,
  "amount_cents" INTEGER,
  "occurred_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "notes" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "sales_consignment_movements_consignment_idx"
  ON "sales_consignment_movements" ("consignment_id", "occurred_at");

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE "sales_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_product_price_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_consignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_sale_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_consignment_movements" ENABLE ROW LEVEL SECURITY;

-- ── Seed catalog ──────────────────────────────────────────────────────────────
-- The 3D-printed keychain is the consignable physical good; the digital lines
-- are what gets sold on the spot. Prices are the B2B base — edit in Admin.

INSERT INTO "sales_products"
  ("sku", "name", "description", "kind", "category", "unit_label", "base_price_cents", "suggested_retail_cents", "cost_cents", "currency", "consignable", "sort_order")
VALUES
  ('KEY-3D',     '3D Printed Keychain',              'Custom 3D-printed keychain. Left on consignment at the establishment and settled on the next visit.', 'physical', '3d_print', 'unit',    500,   1000,  120, 'USD', true,  10),
  ('SITE-LP',    'Landing Page Website',              'Single-page site: design, copy, hosting setup and launch.',                                            'digital',  'website',  'project', 49900, NULL,  NULL, 'USD', false, 20),
  ('SITE-BIZ',   'Business Website (up to 5 pages)',  'Multi-page business site with contact form, maps and analytics.',                                    'digital',  'website',  'project', 129900, NULL, NULL, 'USD', false, 30),
  ('GBP-SETUP',  'Google Business Profile Setup',     'Claim, verify and fully populate the Google Business Profile.',                                       'digital',  'marketing','project', 14900, NULL,  NULL, 'USD', false, 40),
  ('MKT-SOCIAL', 'Social Media Management (monthly)', 'Content calendar, posting and community management. Billed monthly.',                               'digital',  'marketing','month',   39900, NULL,  NULL, 'USD', false, 50),
  ('MKT-ADS',    'Google Ads Management (monthly)',   'Campaign setup and ongoing optimisation. Media spend not included.',                                 'digital',  'marketing','month',   49900, NULL,  NULL, 'USD', false, 60)
ON CONFLICT ("sku") DO NOTHING;

-- Volume tier on the keychain: 100+ units at $4.50. Below that the $5 base applies,
-- so the "30 pieces → $150" case is untouched.
INSERT INTO "sales_product_price_tiers" ("product_id", "label", "min_quantity", "unit_price_cents")
SELECT p."id", 'Bulk 100+', 100, 450
FROM "sales_products" p
WHERE p."sku" = 'KEY-3D'
ON CONFLICT ("product_id", "min_quantity") DO NOTHING;

-- ── Voice-captured actions ───────────────────────────────────────────────────
-- What the LLM understood from a visit's audio, as reviewable proposals. The
-- rep confirms (or edits, or discards) before anything touches stock or money:
-- Whisper hearing "thirteen" for "thirty" would otherwise become a wrong bill a
-- month later. Each row keeps the sentence it came from, so a decision made in
-- the field can be re-read afterwards.

DO $$ BEGIN
  CREATE TYPE "sales_visit_action_type" AS ENUM ('deposit', 'settlement', 'sale', 'follow_up');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "sales_visit_action_status" AS ENUM ('proposed', 'applied', 'dismissed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "sales_visit_actions" (
  "id" SERIAL PRIMARY KEY,
  "visit_id" INTEGER NOT NULL REFERENCES "sales_visits"("id") ON DELETE CASCADE,
  "lead_id" INTEGER NOT NULL REFERENCES "sales_leads"("id"),
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id"),
  "type" "sales_visit_action_type" NOT NULL,
  "status" "sales_visit_action_status" NOT NULL DEFAULT 'proposed',
  -- What the model understood, in the shape the apply step needs. Editable by
  -- the rep before applying, which is why it is jsonb and not columns.
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The sentence that produced it — shown under the proposal.
  "evidence" TEXT,
  "confidence" INTEGER,
  -- What applying it created: "sale:12", "consignment:3".
  "result_ref" TEXT,
  "error" TEXT,
  "applied_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "sales_visit_actions_visit_idx" ON "sales_visit_actions" ("visit_id");
CREATE INDEX IF NOT EXISTS "sales_visit_actions_status_idx" ON "sales_visit_actions" ("status");

ALTER TABLE "sales_visit_actions" ENABLE ROW LEVEL SECURITY;

-- ── DAT-02: make the Xphere inbound idempotent ───────────────────────────────
-- POST /api/xpot/inbound/prospects always inserted, so a retry (or a resent
-- batch) silently duplicated every lead. One lead per originating Xphere record.
-- Partial: leads not created from Xphere carry a NULL ref and are unaffected.
--
-- The route was non-idempotent for its whole life, so this database may already
-- hold duplicates. A bare CREATE UNIQUE INDEX would fail on them and roll back
-- this entire migration, taking the six sales tables with it. Detach the
-- duplicates first, keeping the OLDEST row of each group — that is the one any
-- existing visit, sale or consignment already references. The later copies keep
-- all their data and simply stop claiming the Xphere identity; they show up as
-- ordinary leads for a human to merge or delete.

UPDATE "sales_leads" SET "xphere_ref" = NULL
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "xphere_ref" ORDER BY "id") AS rn
    FROM "sales_leads"
    WHERE "xphere_ref" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_leads_xphere_ref_unique"
  ON "sales_leads" ("xphere_ref") WHERE "xphere_ref" IS NOT NULL;
