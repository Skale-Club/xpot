-- Where a route stop came from. "planned" stops were chosen by the route
-- optimizer; an "ad_hoc" stop is a visit the rep made off the plan while the
-- route was running (server/prospecting/route-execution.ts), kept on the route
-- so the day's history and timing stay true.
-- Idempotent: safe to run more than once.

ALTER TABLE "prospecting_route_stops" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'planned';
DO $$ BEGIN
  ALTER TABLE "prospecting_route_stops"
    ADD CONSTRAINT "prospecting_route_stops_origin_check" CHECK ("origin" IN ('planned', 'ad_hoc'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
