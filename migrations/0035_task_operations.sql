-- First-class, organization-scoped task operations.
-- Existing tasks inherit their Organization from their lead, or from the
-- assignee's active membership when they are not attached to a lead.

ALTER TYPE "sales_task_status" ADD VALUE IF NOT EXISTS 'in_progress' BEFORE 'completed';

ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "organization_id" integer REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "created_by_rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL;
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'medium';
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp;

UPDATE "sales_tasks" task
SET "organization_id" = lead."organization_id"
FROM "sales_leads" lead
WHERE task."organization_id" IS NULL AND task."lead_id" = lead."id";

UPDATE "sales_tasks" task
SET "organization_id" = (
  SELECT om."organization_id"
  FROM "organization_memberships" om
  WHERE om."rep_id" = task."rep_id" AND om."is_active" = true AND om."blocked_at" IS NULL
  ORDER BY om."updated_at" DESC
  LIMIT 1
)
WHERE task."organization_id" IS NULL;

UPDATE "sales_tasks" SET "created_by_rep_id" = "rep_id" WHERE "created_by_rep_id" IS NULL;
UPDATE "sales_tasks" SET "completed_at" = COALESCE("updated_at", NOW()) WHERE "status" = 'completed' AND "completed_at" IS NULL;
UPDATE "sales_tasks" SET "cancelled_at" = COALESCE("updated_at", NOW()) WHERE "status" = 'cancelled' AND "cancelled_at" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "sales_tasks" WHERE "organization_id" IS NULL) THEN
    ALTER TABLE "sales_tasks" ALTER COLUMN "organization_id" SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "sales_tasks_org_status_due_idx" ON "sales_tasks" ("organization_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS "sales_tasks_org_rep_status_due_idx" ON "sales_tasks" ("organization_id", "rep_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS "sales_tasks_lead_status_idx" ON "sales_tasks" ("lead_id", "status");
CREATE INDEX IF NOT EXISTS "sales_tasks_opportunity_status_idx" ON "sales_tasks" ("opportunity_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_tasks_org_source_idempotency_unique"
  ON "sales_tasks" ("organization_id", "source", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "sales_tasks" DROP CONSTRAINT IF EXISTS "sales_tasks_priority_check";
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_priority_check" CHECK ("priority" IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE "sales_tasks" DROP CONSTRAINT IF EXISTS "sales_tasks_source_check";
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_source_check" CHECK ("source" IN ('manual', 'voice', 'mcp', 'automation', 'integration'));
ALTER TABLE "sales_tasks" DROP CONSTRAINT IF EXISTS "sales_tasks_type_check";
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_type_check" CHECK ("type" IN ('follow_up', 'call', 'visit', 'send_quote', 'collect_payment', 'check_consignment', 'restock', 'other'));
