-- Tags › Production per organization (docs/organizations-execution-plan.md, "Production per branch"). A branch that
-- prints its own pieces (another state or country) files its print requests, plates, batches and pieces under its own
-- organization; other branches never see them and the owners (Admin) see every one.
--   * organizations.prints_own_pieces: the owners switch it on for a branch; its Rep Admins then print for it.
--   * print_requests / print_jobs / tag_batches.organization_id: whose production it is. The plate's batch and its
--     pieces (tags.organization_id) take the request's organization.
--   * tag_provisioning_devices.organization_id: a paired bench (or NFC writer) works for one organization only.
-- Everything that exists today is the company's ('xpot-company'), so Boston is unchanged.
-- Idempotent: safe to run more than once.
-- Recovery: drop the four organization_id columns, prints_own_pieces and xpot_company_organization_id().

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "prints_own_pieces" boolean NOT NULL DEFAULT false;

ALTER TABLE "print_requests" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "tag_batches" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "tag_provisioning_devices" ADD COLUMN IF NOT EXISTS "organization_id" integer;

UPDATE "print_requests" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'xpot-company') WHERE "organization_id" IS NULL;
UPDATE "print_jobs" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'xpot-company') WHERE "organization_id" IS NULL;
UPDATE "tag_batches" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'xpot-company') WHERE "organization_id" IS NULL;
UPDATE "tag_provisioning_devices" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'xpot-company') WHERE "organization_id" IS NULL;

-- SQL written before this (older migrations re-run, fixtures, one-off scripts) keeps filing under the company; the app
-- itself always says whose a row is (the Drizzle schema has no default, so every insert must name it).
CREATE OR REPLACE FUNCTION "xpot_company_organization_id"() RETURNS integer LANGUAGE sql STABLE AS
  $$ SELECT "id" FROM "organizations" WHERE "slug" = 'xpot-company' $$;
ALTER TABLE "print_requests" ALTER COLUMN "organization_id" SET DEFAULT "xpot_company_organization_id"();
ALTER TABLE "print_jobs" ALTER COLUMN "organization_id" SET DEFAULT "xpot_company_organization_id"();
ALTER TABLE "tag_batches" ALTER COLUMN "organization_id" SET DEFAULT "xpot_company_organization_id"();
ALTER TABLE "tag_provisioning_devices" ALTER COLUMN "organization_id" SET DEFAULT "xpot_company_organization_id"();

ALTER TABLE "print_requests" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "print_jobs" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tag_batches" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tag_provisioning_devices" ALTER COLUMN "organization_id" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "print_requests" ADD CONSTRAINT "print_requests_organization_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_organization_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tag_batches" ADD CONSTRAINT "tag_batches_organization_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tag_provisioning_devices" ADD CONSTRAINT "tag_provisioning_devices_organization_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "print_requests_organization_idx" ON "print_requests" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "print_jobs_organization_idx" ON "print_jobs" ("organization_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "tag_batches_organization_idx" ON "tag_batches" ("organization_id", "created_at");
