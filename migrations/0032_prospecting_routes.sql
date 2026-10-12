-- Provider-neutral field prospecting jobs and persisted daily routes.

DO $$ BEGIN
  CREATE TYPE "prospecting_job_status" AS ENUM ('draft', 'queued', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "prospecting_candidate_status" AS ENUM ('discovered', 'shortlisted', 'scheduled', 'visited', 'discarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "prospecting_run_status" AS ENUM ('queued', 'starting', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "prospecting_route_status" AS ENUM ('draft', 'published', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "prospecting_stop_status" AS ENUM ('planned', 'en_route', 'checked_in', 'completed', 'skipped', 'rescheduled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "prospecting_jobs" (
  "id" SERIAL PRIMARY KEY,
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "status" "prospecting_job_status" NOT NULL DEFAULT 'draft',
  "executor" TEXT NOT NULL DEFAULT 'google_maps_engine',
  "location" TEXT NOT NULL,
  "searches" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "max_results_per_search" INTEGER NOT NULL DEFAULT 30,
  "target_stops" INTEGER NOT NULL DEFAULT 12,
  "shift_duration_minutes" INTEGER NOT NULL DEFAULT 480,
  "default_visit_minutes" INTEGER NOT NULL DEFAULT 20,
  "auto_expand" BOOLEAN NOT NULL DEFAULT TRUE,
  "max_expansion_km" INTEGER NOT NULL DEFAULT 30,
  "expansion_state" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "filters" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "hypothesis" JSONB,
  "result_count" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMP,
  "completed_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "prospecting_jobs_max_results_positive" CHECK ("max_results_per_search" > 0)
  ,CONSTRAINT "prospecting_jobs_target_stops_positive" CHECK ("target_stops" > 0)
  ,CONSTRAINT "prospecting_jobs_shift_positive" CHECK ("shift_duration_minutes" > 0)
  ,CONSTRAINT "prospecting_jobs_visit_positive" CHECK ("default_visit_minutes" > 0)
  ,CONSTRAINT "prospecting_jobs_expansion_nonnegative" CHECK ("max_expansion_km" >= 0)
);
CREATE INDEX IF NOT EXISTS "prospecting_jobs_rep_idx" ON "prospecting_jobs" ("rep_id", "created_at");
CREATE INDEX IF NOT EXISTS "prospecting_jobs_status_idx" ON "prospecting_jobs" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "prospecting_jobs_rep_idempotency_unique"
  ON "prospecting_jobs" ("rep_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "prospecting_runs" (
  "id" SERIAL PRIMARY KEY,
  "job_id" INTEGER NOT NULL REFERENCES "prospecting_jobs"("id") ON DELETE CASCADE,
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "status" "prospecting_run_status" NOT NULL DEFAULT 'queued',
  "niche" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "requested_max_results" INTEGER NOT NULL DEFAULT 30,
  "wave" INTEGER NOT NULL DEFAULT 0,
  "expansion_reason" TEXT,
  "engine_job_id" TEXT,
  "engine_input" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "result_count" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "started_at" TIMESTAMP,
  "completed_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "prospecting_runs_requested_max_positive" CHECK ("requested_max_results" > 0)
);
CREATE INDEX IF NOT EXISTS "prospecting_runs_queue_idx" ON "prospecting_runs" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "prospecting_runs_job_idx" ON "prospecting_runs" ("job_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "prospecting_runs_engine_job_unique"
  ON "prospecting_runs" ("engine_job_id") WHERE "engine_job_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "prospecting_runs_job_niche_area_unique"
  ON "prospecting_runs" ("job_id", "niche", "location");
CREATE UNIQUE INDEX IF NOT EXISTS "prospecting_runs_single_active_unique"
  ON "prospecting_runs" ((true)) WHERE "status" IN ('starting', 'running');

CREATE TABLE IF NOT EXISTS "prospecting_candidates" (
  "id" SERIAL PRIMARY KEY,
  "job_id" INTEGER NOT NULL REFERENCES "prospecting_jobs"("id") ON DELETE CASCADE,
  "run_id" INTEGER NOT NULL REFERENCES "prospecting_runs"("id") ON DELETE CASCADE,
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "lead_id" INTEGER REFERENCES "sales_leads"("id") ON DELETE SET NULL,
  "status" "prospecting_candidate_status" NOT NULL DEFAULT 'discovered',
  "source_id" TEXT,
  "google_place_id" TEXT,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postal_code" TEXT,
  "country" TEXT DEFAULT 'US',
  "lat" TEXT,
  "lng" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "industry" TEXT,
  "rating_permille" INTEGER,
  "review_count" INTEGER,
  "score" INTEGER NOT NULL DEFAULT 0,
  "score_reasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "exclusion_reason" TEXT,
  "raw_payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "prospecting_candidates_job_idx" ON "prospecting_candidates" ("job_id", "status");
CREATE INDEX IF NOT EXISTS "prospecting_candidates_rep_idx" ON "prospecting_candidates" ("rep_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "prospecting_candidates_job_source_unique"
  ON "prospecting_candidates" ("job_id", "source_id") WHERE "source_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "prospecting_routes" (
  "id" SERIAL PRIMARY KEY,
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "job_id" INTEGER REFERENCES "prospecting_jobs"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL,
  "route_date" TEXT NOT NULL,
  "status" "prospecting_route_status" NOT NULL DEFAULT 'draft',
  "optimizer" TEXT NOT NULL DEFAULT 'heuristic_v1',
  "planned_start_at" TIMESTAMP NOT NULL,
  "planned_end_at" TIMESTAMP,
  "start_address" TEXT,
  "start_lat" TEXT NOT NULL,
  "start_lng" TEXT NOT NULL,
  "end_address" TEXT,
  "end_lat" TEXT,
  "end_lng" TEXT,
  "max_stops" INTEGER NOT NULL DEFAULT 12,
  "default_visit_minutes" INTEGER NOT NULL DEFAULT 20,
  "total_distance_meters" INTEGER NOT NULL DEFAULT 0,
  "total_duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "optimization_meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "published_at" TIMESTAMP,
  "started_at" TIMESTAMP,
  "completed_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "prospecting_routes_route_date_format" CHECK ("route_date" ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT "prospecting_routes_max_stops_positive" CHECK ("max_stops" > 0)
);
CREATE INDEX IF NOT EXISTS "prospecting_routes_rep_date_idx" ON "prospecting_routes" ("rep_id", "route_date");
CREATE INDEX IF NOT EXISTS "prospecting_routes_status_idx" ON "prospecting_routes" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "prospecting_routes_active_job_date_unique"
  ON "prospecting_routes" ("rep_id", "job_id", "route_date")
  WHERE "job_id" IS NOT NULL AND "status" <> 'cancelled';

CREATE TABLE IF NOT EXISTS "prospecting_route_stops" (
  "id" SERIAL PRIMARY KEY,
  "route_id" INTEGER NOT NULL REFERENCES "prospecting_routes"("id") ON DELETE CASCADE,
  "candidate_id" INTEGER REFERENCES "prospecting_candidates"("id") ON DELETE SET NULL,
  "lead_id" INTEGER REFERENCES "sales_leads"("id") ON DELETE SET NULL,
  "visit_id" INTEGER REFERENCES "sales_visits"("id") ON DELETE SET NULL,
  "position" INTEGER NOT NULL,
  "status" "prospecting_stop_status" NOT NULL DEFAULT 'planned',
  "name" TEXT NOT NULL,
  "address" TEXT,
  "lat" TEXT NOT NULL,
  "lng" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "score_reasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "service_duration_seconds" INTEGER NOT NULL DEFAULT 1200,
  "travel_distance_meters" INTEGER NOT NULL DEFAULT 0,
  "travel_duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "estimated_arrival_at" TIMESTAMP,
  "skip_reason" TEXT,
  "completed_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "prospecting_route_stops_position_positive" CHECK ("position" > 0),
  CONSTRAINT "prospecting_route_stops_service_duration_positive" CHECK ("service_duration_seconds" > 0),
  CONSTRAINT "prospecting_route_stops_position_unique" UNIQUE ("route_id", "position")
);
CREATE INDEX IF NOT EXISTS "prospecting_route_stops_route_status_idx"
  ON "prospecting_route_stops" ("route_id", "status");

ALTER TABLE "prospecting_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospecting_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospecting_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospecting_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospecting_route_stops" ENABLE ROW LEVEL SECURITY;
