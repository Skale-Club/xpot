-- Durable daily prospecting routes, generation audit, notifications and the
-- small post-visit additions required by the mobile field workflow.

ALTER TABLE "sales_visit_notes" ADD COLUMN IF NOT EXISTS "attendee_name" text;
ALTER TABLE "sales_visit_notes" ADD COLUMN IF NOT EXISTS "summary_completed_at" timestamptz;

ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'medium';
ALTER TABLE "sales_tasks" ADD COLUMN IF NOT EXISTS "created_by_rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL;
ALTER TABLE "sales_tasks" DROP CONSTRAINT IF EXISTS "sales_tasks_priority_check";
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_priority_check" CHECK ("priority" IN ('low', 'medium', 'high', 'urgent'));

CREATE TABLE IF NOT EXISTS "sales_daily_routes" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "rep_id" integer NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "route_date" date NOT NULL,
  "timezone" text NOT NULL DEFAULT 'America/New_York',
  "industry" text NOT NULL,
  "city" text NOT NULL,
  "start_time" text NOT NULL,
  "duration_minutes" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "generation_stage" text NOT NULL DEFAULT 'draft',
  "version" integer NOT NULL DEFAULT 1,
  "estimated_ready_at" timestamptz,
  "generated_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "error_message" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sales_daily_routes_duration_check" CHECK ("duration_minutes" BETWEEN 60 AND 720),
  CONSTRAINT "sales_daily_routes_start_time_check" CHECK ("start_time" ~ '^[0-2][0-9]:[0-5][0-9]$'),
  CONSTRAINT "sales_daily_routes_status_check" CHECK ("status" IN ('draft', 'queued', 'generating', 'ready', 'active', 'completed', 'failed')),
  CONSTRAINT "sales_daily_routes_stage_check" CHECK ("generation_stage" IN ('draft', 'queued', 'discovering', 'qualifying', 'optimizing', 'finalizing', 'ready', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_daily_routes_rep_date_unique"
  ON "sales_daily_routes" ("rep_id", "route_date");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_daily_routes_idempotency_unique"
  ON "sales_daily_routes" ("rep_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "sales_daily_routes_rep_status_idx"
  ON "sales_daily_routes" ("rep_id", "status");

CREATE TABLE IF NOT EXISTS "sales_daily_route_stops" (
  "id" serial PRIMARY KEY,
  "route_id" integer NOT NULL REFERENCES "sales_daily_routes"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "sequence" integer NOT NULL,
  "lead_id" integer NOT NULL REFERENCES "sales_leads"("id") ON DELETE CASCADE,
  "location_id" integer REFERENCES "sales_lead_locations"("id") ON DELETE SET NULL,
  "visit_id" integer REFERENCES "sales_visits"("id") ON DELETE SET NULL,
  "name_snapshot" text NOT NULL,
  "address_snapshot" text,
  "lat" text,
  "lng" text,
  "arrival_offset_minutes" integer NOT NULL DEFAULT 0,
  "drive_minutes" integer NOT NULL DEFAULT 0,
  "visit_minutes" integer NOT NULL DEFAULT 20,
  "rating_tenths" integer,
  "review_count" integer,
  "open_now" boolean,
  "maps_url" text,
  "selection_reason" text,
  "status" text NOT NULL DEFAULT 'planned',
  "skip_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sales_daily_route_stops_status_check" CHECK ("status" IN ('planned', 'in_progress', 'summary_pending', 'visited', 'skipped', 'unavailable', 'removed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_daily_route_stops_route_version_sequence_unique"
  ON "sales_daily_route_stops" ("route_id", "version", "sequence");
CREATE INDEX IF NOT EXISTS "sales_daily_route_stops_route_idx"
  ON "sales_daily_route_stops" ("route_id", "version", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_daily_route_stops_visit_unique"
  ON "sales_daily_route_stops" ("visit_id") WHERE "visit_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "sales_route_generation_attempts" (
  "id" serial PRIMARY KEY,
  "route_id" integer NOT NULL REFERENCES "sales_daily_routes"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "initiated_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text,
  "provider" text NOT NULL DEFAULT 'google_places',
  "provider_request_id" text,
  "status" text NOT NULL DEFAULT 'queued',
  "credit_units" integer,
  "error_message" text,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sales_route_generation_attempts_status_check" CHECK ("status" IN ('queued', 'generating', 'ready', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_route_generation_attempts_idempotency_unique"
  ON "sales_route_generation_attempts" ("route_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "sales_route_generation_attempts_route_idx"
  ON "sales_route_generation_attempts" ("route_id", "version");

CREATE TABLE IF NOT EXISTS "sales_user_notifications" (
  "id" serial PRIMARY KEY,
  "rep_id" integer NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "href" text,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_user_notifications_rep_unread_idx"
  ON "sales_user_notifications" ("rep_id", "read_at", "created_at");

ALTER TABLE "sales_daily_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_daily_route_stops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_route_generation_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_user_notifications" ENABLE ROW LEVEL SECURITY;
