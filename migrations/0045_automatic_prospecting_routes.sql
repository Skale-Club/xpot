ALTER TABLE prospecting_jobs
  ADD COLUMN IF NOT EXISTS route_planning_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS route_error_message text;

ALTER TABLE prospecting_jobs
  DROP CONSTRAINT IF EXISTS prospecting_jobs_route_planning_status_check;

ALTER TABLE prospecting_jobs
  ADD CONSTRAINT prospecting_jobs_route_planning_status_check
  CHECK (route_planning_status IN ('pending', 'building', 'ready', 'failed'));

CREATE INDEX IF NOT EXISTS prospecting_jobs_route_planning_idx
  ON prospecting_jobs (status, route_planning_status, completed_at);
