-- Organizations are the tenant/team boundary for Xpot operations.
-- Platform roles stay on users/sales_reps; Rep Admin vs Rep lives only in
-- organization_memberships.role.

DO $$ BEGIN
  CREATE TYPE "organization_member_role" AS ENUM ('member', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "organizations_active_idx"
  ON "organizations" ("is_active", "name");

CREATE TABLE IF NOT EXISTS "organization_memberships" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "rep_id" integer NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "role" "organization_member_role" NOT NULL DEFAULT 'member',
  "is_active" boolean NOT NULL DEFAULT true,
  "blocked_at" timestamptz,
  "blocked_reason" text,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "organization_memberships_org_rep_unique" UNIQUE ("organization_id", "rep_id")
);

CREATE INDEX IF NOT EXISTS "organization_memberships_rep_idx"
  ON "organization_memberships" ("rep_id", "is_active");
CREATE INDEX IF NOT EXISTS "organization_memberships_org_idx"
  ON "organization_memberships" ("organization_id", "is_active");

CREATE TABLE IF NOT EXISTS "organization_audit_log" (
  "id" bigserial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "target_rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL,
  "actor_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "organization_audit_log_org_idx"
  ON "organization_audit_log" ("organization_id", "created_at" DESC);

-- Company-owned inventory needs a tenant even before it is handed to a team.
INSERT INTO "organizations" ("name", "slug")
VALUES ('Xpot', 'xpot-company')
ON CONFLICT ("slug") DO NOTHING;

-- Preserve a known team relationship when the legacy team field is populated.
INSERT INTO "organizations" ("name", "slug")
SELECT DISTINCT btrim(r."team"), 'legacy-team-' || md5(lower(btrim(r."team")))
FROM "sales_reps" r
WHERE NULLIF(btrim(r."team"), '') IS NOT NULL
ON CONFLICT ("slug") DO NOTHING;

-- Otherwise give the existing Rep an individual Organization that can later
-- receive more members or be merged by an Admin/Manager.
INSERT INTO "organizations" ("name", "slug")
SELECT r."display_name", 'legacy-rep-' || r."id"::text
FROM "sales_reps" r
WHERE NULLIF(btrim(r."team"), '') IS NULL
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "organization_memberships" ("organization_id", "rep_id", "role")
SELECT o."id", r."id", 'admin'::"organization_member_role"
FROM "sales_reps" r
JOIN "organizations" o ON o."slug" = CASE
  WHEN NULLIF(btrim(r."team"), '') IS NOT NULL
    THEN 'legacy-team-' || md5(lower(btrim(r."team")))
  ELSE 'legacy-rep-' || r."id"::text
END
ON CONFLICT ("organization_id", "rep_id") DO NOTHING;

ALTER TABLE "sales_leads" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "tag_kits" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "sales_consignments" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "sales_sales" ADD COLUMN IF NOT EXISTS "organization_id" integer;

UPDATE "sales_leads" l
SET "organization_id" = m."organization_id"
FROM "organization_memberships" m
WHERE l."organization_id" IS NULL AND l."owner_rep_id" = m."rep_id" AND m."is_active";

UPDATE "sales_leads"
SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'xpot-company')
WHERE "organization_id" IS NULL;

UPDATE "tag_kits" k
SET "organization_id" = m."organization_id"
FROM "organization_memberships" m
WHERE k."organization_id" IS NULL AND k."rep_id" = m."rep_id" AND m."is_active";

UPDATE "tag_kits"
SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'xpot-company')
WHERE "organization_id" IS NULL;

UPDATE "tags" t
SET "organization_id" = k."organization_id"
FROM "tag_kits" k
WHERE t."organization_id" IS NULL AND t."kit_id" = k."id";

UPDATE "tags" t
SET "organization_id" = m."organization_id"
FROM "organization_memberships" m
WHERE t."organization_id" IS NULL AND t."rep_id" = m."rep_id" AND m."is_active";

UPDATE "tags" t
SET "organization_id" = l."organization_id"
FROM "sales_leads" l
WHERE t."organization_id" IS NULL AND t."lead_id" = l."id";

UPDATE "tags"
SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'xpot-company')
WHERE "organization_id" IS NULL;

UPDATE "sales_consignments" c
SET "organization_id" = l."organization_id"
FROM "sales_leads" l
WHERE c."organization_id" IS NULL AND c."lead_id" = l."id";

UPDATE "sales_sales" s
SET "organization_id" = l."organization_id"
FROM "sales_leads" l
WHERE s."organization_id" IS NULL AND s."lead_id" = l."id";

ALTER TABLE "sales_leads" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tag_kits" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tags" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "sales_consignments" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "sales_sales" ALTER COLUMN "organization_id" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "sales_consignments" ADD CONSTRAINT "sales_consignments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "sales_sales" ADD CONSTRAINT "sales_sales_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "tag_kits" ADD CONSTRAINT "tag_kits_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "sales_leads_organization_idx"
  ON "sales_leads" ("organization_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "tag_kits_organization_idx"
  ON "tag_kits" ("organization_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "tags_organization_idx"
  ON "tags" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "sales_consignments_organization_idx"
  ON "sales_consignments" ("organization_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "sales_sales_organization_idx"
  ON "sales_sales" ("organization_id", "sold_at" DESC);

-- Recovery: deploy code that no longer writes organization_id, drop the five
-- foreign keys/columns and the membership tables, then drop the enum. The
-- migration only adds ownership metadata; it does not delete operational data.
