DROP INDEX IF EXISTS "prospecting_routes_rep_date_unique";

-- A rep may create a follow-up route after completing the current one, but
-- never run two routes for the same local day at once.
CREATE UNIQUE INDEX IF NOT EXISTS "prospecting_routes_rep_date_active_unique"
  ON "prospecting_routes" ("rep_id", "route_date")
  WHERE "status" IN ('draft', 'published', 'in_progress');
