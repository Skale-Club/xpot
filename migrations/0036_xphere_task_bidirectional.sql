-- Correlate Xphere-native tasks with their Xpot mirror and reject stale
-- deliveries when the Xphere outbox retries events out of order.
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "xphere_task_id" text;
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "xphere_updated_at" timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_tasks_org_xphere_task_unique"
  ON "sales_tasks" ("organization_id", "xphere_task_id")
  WHERE "xphere_task_id" IS NOT NULL;
