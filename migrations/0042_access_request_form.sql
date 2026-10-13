-- A verified phone number may request Xpot access, but never grants itself
-- access. The application gives the team enough context to contact/review the
-- person; sales_reps.is_active remains the sole approval gate.

CREATE TABLE IF NOT EXISTS "auth_access_requests" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "email" text,
  "work_city" text,
  "work_region" text,
  "occupation" text,
  "availability" text,
  "has_vehicle" boolean,
  "languages" text[] DEFAULT '{}',
  "other_languages" text,
  "sales_experience" text,
  "field_sales_readiness" text,
  "kit_investment_acknowledged" boolean DEFAULT false,
  "active_seller_acknowledged" boolean DEFAULT false,
  "message" text,
  "status" text NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft', 'pending', 'approved', 'declined')),
  "draft_step" integer NOT NULL DEFAULT 0,
  "last_activity_at" timestamp NOT NULL DEFAULT now(),
  "abandoned_notified_at" timestamp,
  "submitted_at" timestamp,
  "reviewed_at" timestamp,
  "reviewed_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "auth_access_requests_status_idx"
  ON "auth_access_requests" ("status", "submitted_at");

ALTER TABLE "auth_access_requests" ENABLE ROW LEVEL SECURITY;
