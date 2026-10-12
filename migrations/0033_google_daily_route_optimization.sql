-- Enforce the product and billing rule: one persisted optimization per rep/day.

DROP INDEX IF EXISTS "prospecting_routes_active_job_date_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "prospecting_routes_rep_date_unique"
  ON "prospecting_routes" ("rep_id", "route_date");

ALTER TABLE "prospecting_jobs" ALTER COLUMN "target_stops" SET DEFAULT 24;
ALTER TABLE "prospecting_routes" ALTER COLUMN "max_stops" SET DEFAULT 60;
