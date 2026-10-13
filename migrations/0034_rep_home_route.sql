-- Where a rep's prospecting day ends. Personal (Settings › Route): the home
-- address and its coordinates, and whether today's route should finish there.
-- Off by default: a route without it ends at the last visit.
-- Idempotent: safe to run more than once.

ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "home_address" text;
ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "home_lat" text;
ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "home_lng" text;
ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "route_return_home" boolean NOT NULL DEFAULT false;
