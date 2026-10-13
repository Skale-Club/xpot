ALTER TABLE "sales_visit_notes" ADD COLUMN IF NOT EXISTS "attendee_name" text;
ALTER TABLE "sales_visit_notes" ADD COLUMN IF NOT EXISTS "summary_completed_at" timestamptz;

ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'medium';
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "created_by_rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL;
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "sales_tasks_rep_idempotency_unique"
  ON "sales_tasks" ("rep_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "sales_push_subscriptions" (
  "id" serial PRIMARY KEY,
  "rep_id" integer NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_push_subscriptions_endpoint_unique"
  ON "sales_push_subscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "sales_push_subscriptions_rep_idx"
  ON "sales_push_subscriptions" ("rep_id");

ALTER TABLE "sales_push_subscriptions" ENABLE ROW LEVEL SECURITY;
