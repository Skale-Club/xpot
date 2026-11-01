-- Distribution per partner (docs/PROFILES_EXECUTION_PLAN.md, F6, decision D3). Each partner will have their own way of
-- selling and distributing; in the US Xpot handles it (Stuscle), outside it cannot, and that stays open until the first
-- partner exists. This only leaves it prepared:
--   * organizations.distribution: who handles this organization's orders. 'xpot' is what happens today (Stuscle orders
--     are fulfilled from the company's stock); 'own' means the partner hands kits from their own house stock to the
--     selling organizations the platform linked to them, and nothing goes through Stuscle.
--   * organization_links (producer_id, seller_id): the selling organizations linked to a partner.
-- Everything that exists today is 'xpot', so Boston and every current order are unchanged.
-- Idempotent: safe to run more than once.
-- Recovery: drop table organization_links; drop the organizations.distribution column (and its check constraint).

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "distribution" text NOT NULL DEFAULT 'xpot';

DO $$ BEGIN
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_distribution_check"
    CHECK ("distribution" IN ('xpot', 'own'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "organization_links" (
  "producer_id" integer NOT NULL,
  "seller_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by_user_id" text,
  CONSTRAINT "organization_links_pkey" PRIMARY KEY ("producer_id", "seller_id"),
  CONSTRAINT "organization_links_distinct_check" CHECK ("producer_id" <> "seller_id")
);

DO $$ BEGIN
  ALTER TABLE "organization_links" ADD CONSTRAINT "organization_links_producer_fk"
    FOREIGN KEY ("producer_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "organization_links" ADD CONSTRAINT "organization_links_seller_fk"
    FOREIGN KEY ("seller_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "organization_links" ADD CONSTRAINT "organization_links_created_by_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "organization_links_seller_idx" ON "organization_links" ("seller_id");
