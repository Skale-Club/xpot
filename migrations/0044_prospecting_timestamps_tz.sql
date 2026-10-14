-- Prospecting timestamps represent absolute instants. They were originally
-- created as timestamp-without-time-zone columns, causing node-postgres to
-- reinterpret UTC wall-clock values in the server's local timezone.

ALTER TABLE "prospecting_jobs"
  ALTER COLUMN "started_at" TYPE TIMESTAMPTZ USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "completed_at" TYPE TIMESTAMPTZ USING "completed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "prospecting_runs"
  ALTER COLUMN "started_at" TYPE TIMESTAMPTZ USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "completed_at" TYPE TIMESTAMPTZ USING "completed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "prospecting_candidates"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "prospecting_routes"
  ALTER COLUMN "planned_start_at" TYPE TIMESTAMPTZ USING "planned_start_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "planned_end_at" TYPE TIMESTAMPTZ USING "planned_end_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "published_at" TYPE TIMESTAMPTZ USING "published_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "started_at" TYPE TIMESTAMPTZ USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "completed_at" TYPE TIMESTAMPTZ USING "completed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "prospecting_route_stops"
  ALTER COLUMN "estimated_arrival_at" TYPE TIMESTAMPTZ USING "estimated_arrival_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "completed_at" TYPE TIMESTAMPTZ USING "completed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at" AT TIME ZONE 'UTC';
