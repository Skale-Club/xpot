DO $$ BEGIN
  CREATE TYPE "sales_rep_role" AS ENUM ('rep', 'manager', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sales_account_status" AS ENUM ('lead', 'active', 'inactive', 'customer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sales_visit_status" AS ENUM ('planned', 'in_progress', 'completed', 'cancelled', 'invalid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sales_visit_validation_status" AS ENUM ('valid', 'outside_geofence', 'gps_unavailable', 'manual_override');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sales_opportunity_status" AS ENUM ('open', 'won', 'lost', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sales_task_status" AS ENUM ('pending', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sales_sync_status" AS ENUM ('pending', 'synced', 'failed', 'needs_review');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sales_sync_direction" AS ENUM ('outbound', 'inbound');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "sales_reps" (
  "id" SERIAL PRIMARY KEY,
  "user_id" TEXT NOT NULL UNIQUE REFERENCES "users"("id"),
  "display_name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "team" TEXT,
  "role" "sales_rep_role" NOT NULL DEFAULT 'rep',
  "vcard_id" INTEGER REFERENCES "vcards"("id"),
  "ghl_user_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sales_accounts" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "legal_name" TEXT,
  "website" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "industry" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "status" "sales_account_status" NOT NULL DEFAULT 'lead',
  "owner_rep_id" INTEGER REFERENCES "sales_reps"("id"),
  "territory_name" TEXT,
  "ghl_contact_id" TEXT,
  "ghl_company_id" TEXT,
  "last_visit_at" TIMESTAMP,
  "next_visit_due_at" TIMESTAMP,
  "notes" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sales_account_locations" (
  "id" SERIAL PRIMARY KEY,
  "account_id" INTEGER NOT NULL REFERENCES "sales_accounts"("id"),
  "label" TEXT NOT NULL DEFAULT 'Main',
  "address_line_1" TEXT NOT NULL,
  "address_line_2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postal_code" TEXT,
  "country" TEXT DEFAULT 'US',
  "lat" TEXT,
  "lng" TEXT,
  "geofence_radius_meters" INTEGER NOT NULL DEFAULT 150,
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sales_account_contacts" (
  "id" SERIAL PRIMARY KEY,
  "account_id" INTEGER NOT NULL REFERENCES "sales_accounts"("id"),
  "name" TEXT NOT NULL,
  "job_title" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "ghl_contact_id" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sales_visits" (
  "id" SERIAL PRIMARY KEY,
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id"),
  "account_id" INTEGER NOT NULL REFERENCES "sales_accounts"("id"),
  "location_id" INTEGER REFERENCES "sales_account_locations"("id"),
  "status" "sales_visit_status" NOT NULL DEFAULT 'planned',
  "scheduled_at" TIMESTAMP,
  "checked_in_at" TIMESTAMP,
  "checked_out_at" TIMESTAMP,
  "duration_seconds" INTEGER,
  "check_in_lat" TEXT,
  "check_in_lng" TEXT,
  "check_out_lat" TEXT,
  "check_out_lng" TEXT,
  "distance_from_target_meters" INTEGER,
  "gps_accuracy_meters" INTEGER,
  "validation_status" "sales_visit_validation_status" NOT NULL DEFAULT 'gps_unavailable',
  "manual_override_reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'mobile',
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sales_visit_notes" (
  "id" SERIAL PRIMARY KEY,
  "visit_id" INTEGER NOT NULL UNIQUE REFERENCES "sales_visits"("id"),
  "summary" TEXT,
  "outcome" TEXT,
  "sentiment" TEXT,
  "objections" TEXT,
  "competitor_mentioned" TEXT,
  "next_step" TEXT,
  "follow_up_required" BOOLEAN NOT NULL DEFAULT false,
  "audio_url" TEXT,
  "audio_duration_seconds" INTEGER,
  "audio_transcription" TEXT,
  "created_by_rep_id" INTEGER REFERENCES "sales_reps"("id"),
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sales_opportunities_local" (
  "id" SERIAL PRIMARY KEY,
  "account_id" INTEGER NOT NULL REFERENCES "sales_accounts"("id"),
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id"),
  "visit_id" INTEGER REFERENCES "sales_visits"("id"),
  "title" TEXT NOT NULL,
  "pipeline_key" TEXT,
  "stage_key" TEXT,
  "value" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" "sales_opportunity_status" NOT NULL DEFAULT 'open',
  "close_date" TIMESTAMP,
  "loss_reason" TEXT,
  "notes" TEXT,
  "ghl_opportunity_id" TEXT,
  "sync_status" "sales_sync_status" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sales_tasks" (
  "id" SERIAL PRIMARY KEY,
  "account_id" INTEGER REFERENCES "sales_accounts"("id"),
  "visit_id" INTEGER REFERENCES "sales_visits"("id"),
  "opportunity_id" INTEGER REFERENCES "sales_opportunities_local"("id"),
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id"),
  "type" TEXT NOT NULL DEFAULT 'follow_up',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "due_at" TIMESTAMP,
  "status" "sales_task_status" NOT NULL DEFAULT 'pending',
  "ghl_task_id" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sales_sync_events" (
  "id" SERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL DEFAULT 'gohighlevel',
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "direction" "sales_sync_direction" NOT NULL DEFAULT 'outbound',
  "status" "sales_sync_status" NOT NULL DEFAULT 'pending',
  "payload" JSONB DEFAULT '{}'::jsonb,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "last_attempt_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sales_app_settings" (
  "id" SERIAL PRIMARY KEY,
  "check_in_requires_gps" BOOLEAN NOT NULL DEFAULT true,
  "default_geofence_radius_meters" INTEGER NOT NULL DEFAULT 150,
  "allow_manual_override" BOOLEAN NOT NULL DEFAULT true,
  "offline_queue_enabled" BOOLEAN NOT NULL DEFAULT true,
  "default_pipeline_key" TEXT,
  "default_stage_key" TEXT,
  "default_task_template" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_reps_user_id_idx" ON "sales_reps" ("user_id");
CREATE INDEX IF NOT EXISTS "sales_reps_role_idx" ON "sales_reps" ("role");
CREATE INDEX IF NOT EXISTS "sales_accounts_owner_idx" ON "sales_accounts" ("owner_rep_id");
CREATE INDEX IF NOT EXISTS "sales_accounts_status_idx" ON "sales_accounts" ("status");
CREATE INDEX IF NOT EXISTS "sales_accounts_name_idx" ON "sales_accounts" ("name");
CREATE INDEX IF NOT EXISTS "sales_account_locations_account_idx" ON "sales_account_locations" ("account_id");
CREATE INDEX IF NOT EXISTS "sales_account_contacts_account_idx" ON "sales_account_contacts" ("account_id");
CREATE INDEX IF NOT EXISTS "sales_visits_rep_idx" ON "sales_visits" ("rep_id");
CREATE INDEX IF NOT EXISTS "sales_visits_account_idx" ON "sales_visits" ("account_id");
CREATE INDEX IF NOT EXISTS "sales_visits_status_idx" ON "sales_visits" ("status");
CREATE INDEX IF NOT EXISTS "sales_opportunities_account_idx" ON "sales_opportunities_local" ("account_id");
CREATE INDEX IF NOT EXISTS "sales_opportunities_rep_idx" ON "sales_opportunities_local" ("rep_id");
CREATE INDEX IF NOT EXISTS "sales_opportunities_status_idx" ON "sales_opportunities_local" ("status");
CREATE INDEX IF NOT EXISTS "sales_tasks_rep_idx" ON "sales_tasks" ("rep_id");
CREATE INDEX IF NOT EXISTS "sales_tasks_status_idx" ON "sales_tasks" ("status");
CREATE INDEX IF NOT EXISTS "sales_sync_events_entity_idx" ON "sales_sync_events" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "sales_sync_events_status_idx" ON "sales_sync_events" ("status");

ALTER TABLE "sales_visit_notes" ADD COLUMN IF NOT EXISTS "audio_transcription" text;
