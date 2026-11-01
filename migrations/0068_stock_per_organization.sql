-- House stock is per organization (docs/PROFILES_EXECUTION_PLAN.md, F4): a piece with no seller belongs to the house of
-- the organization that holds it, and two organizations' house stock never adds up.
--   * tag_acquisitions.organization_id: the buyer's organization when they bought, so its owner can follow the orders.
--   * tag_acquisitions.fulfilled_from_organization_id: whose stock the order was separated from.
--   * Kit returns used to clear the seller and leave the piece in the seller's organization. The piece physically came
--     back to the company, so pieces with no seller in a one-person workspace (slug rep-<id>) move to the company.
--     Real teams keep theirs: that is the team's house stock.
-- Idempotent: safe to run more than once.
-- Recovery: drop the two columns; the moved pieces are named by the 'migration_0068' stock movements.

ALTER TABLE "tag_acquisitions" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "tag_acquisitions" ADD COLUMN IF NOT EXISTS "fulfilled_from_organization_id" integer;

UPDATE "tag_acquisitions" a
SET "organization_id" = COALESCE(
  (SELECT m."organization_id" FROM "organization_memberships" m
    WHERE m."rep_id" = a."rep_id" AND m."is_active" AND m."blocked_at" IS NULL
    ORDER BY m."updated_at" DESC LIMIT 1),
  "xpot_company_organization_id"()
)
WHERE a."organization_id" IS NULL;

UPDATE "tag_acquisitions"
SET "fulfilled_from_organization_id" = "xpot_company_organization_id"()
WHERE "status" = 'fulfilled' AND "fulfilled_from_organization_id" IS NULL;

ALTER TABLE "tag_acquisitions" ALTER COLUMN "organization_id" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "tag_acquisitions" ADD CONSTRAINT "tag_acquisitions_organization_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tag_acquisitions" ADD CONSTRAINT "tag_acquisitions_fulfilled_from_fk"
    FOREIGN KEY ("fulfilled_from_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "tag_stock_movements" ("tag_id", "movement_type", "from_stock_status", "to_stock_status", "from_ownership_type", "to_ownership_type", "reason")
SELECT t."id", 'return', t."stock_status", t."stock_status", t."ownership_type", t."ownership_type", 'migration_0068'
FROM "tags" t
JOIN "organizations" o ON o."id" = t."organization_id"
WHERE t."rep_id" IS NULL AND o."slug" ~ '^rep-[0-9]+$'
  AND (SELECT count(*) FROM "organization_memberships" m WHERE m."organization_id" = o."id" AND m."is_active" AND m."blocked_at" IS NULL) <= 1;

UPDATE "tags" t
SET "organization_id" = "xpot_company_organization_id"(), "updated_at" = now()
FROM "organizations" o
WHERE o."id" = t."organization_id" AND t."rep_id" IS NULL AND o."slug" ~ '^rep-[0-9]+$'
  AND (SELECT count(*) FROM "organization_memberships" m WHERE m."organization_id" = o."id" AND m."is_active" AND m."blocked_at" IS NULL) <= 1;

CREATE INDEX IF NOT EXISTS "tags_organization_house_idx" ON "tags" ("organization_id", "rep_id", "stock_status");
CREATE INDEX IF NOT EXISTS "tag_acquisitions_organization_idx" ON "tag_acquisitions" ("organization_id", "purchased_at");
