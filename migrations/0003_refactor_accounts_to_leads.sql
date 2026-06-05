-- Align the database with the current drizzle schema (shared/schema/sales.ts).
--
-- The code was refactored from an "accounts" model to a "leads" model
-- (sales_accounts* -> sales_leads*, account_id -> lead_id), avatar_url was added
-- to sales_reps, and sales_visit_status gained 5 values. The migrations/DB were
-- never updated, so every query against these tables failed at runtime.
-- All sales_ tables are empty, so this rebuild preserves no data.

-- 1. sales_reps: add the avatar_url column the profile/avatar feature relies on.
ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;

-- 2. Drop the old account-model tables (and any partial lead tables), children
--    first. CASCADE clears their FKs/indexes. All are empty.
DROP TABLE IF EXISTS "sales_tasks" CASCADE;
DROP TABLE IF EXISTS "sales_opportunities_local" CASCADE;
DROP TABLE IF EXISTS "sales_visit_notes" CASCADE;
DROP TABLE IF EXISTS "sales_visits" CASCADE;
DROP TABLE IF EXISTS "sales_lead_contacts" CASCADE;
DROP TABLE IF EXISTS "sales_lead_locations" CASCADE;
DROP TABLE IF EXISTS "sales_account_contacts" CASCADE;
DROP TABLE IF EXISTS "sales_account_locations" CASCADE;
DROP TABLE IF EXISTS "sales_leads" CASCADE;
DROP TABLE IF EXISTS "sales_accounts" CASCADE;

-- 3. Enums: recreate sales_visit_status with the new values, add sales_lead_status,
--    drop the now-unused sales_account_status. (Safe: dependent tables dropped above.)
DROP TYPE IF EXISTS "sales_visit_status";
CREATE TYPE "sales_visit_status" AS ENUM (
  'planned', 'in_progress', 'completed', 'cancelled', 'invalid',
  'no_answer', 'came_back_later', 'not_interested', 'follow_up', 'sale_made'
);

DROP TYPE IF EXISTS "sales_lead_status";
CREATE TYPE "sales_lead_status" AS ENUM ('prospect', 'lead', 'active', 'inactive', 'customer');

DROP TYPE IF EXISTS "sales_account_status";

-- 4. Recreate the sales tables to match the leads model (parents first).
CREATE TABLE "sales_leads" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "legal_name" TEXT,
  "website" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "industry" TEXT,
  "social_urls" JSONB DEFAULT '[]'::jsonb,
  "photos" JSONB DEFAULT '[]'::jsonb,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "status" "sales_lead_status" NOT NULL DEFAULT 'lead',
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

CREATE TABLE "sales_lead_locations" (
  "id" SERIAL PRIMARY KEY,
  "lead_id" INTEGER NOT NULL REFERENCES "sales_leads"("id"),
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

CREATE TABLE "sales_lead_contacts" (
  "id" SERIAL PRIMARY KEY,
  "lead_id" INTEGER NOT NULL REFERENCES "sales_leads"("id"),
  "name" TEXT NOT NULL,
  "job_title" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "ghl_contact_id" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE "sales_visits" (
  "id" SERIAL PRIMARY KEY,
  "rep_id" INTEGER NOT NULL REFERENCES "sales_reps"("id"),
  "lead_id" INTEGER NOT NULL REFERENCES "sales_leads"("id"),
  "location_id" INTEGER REFERENCES "sales_lead_locations"("id"),
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

CREATE TABLE "sales_visit_notes" (
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

CREATE TABLE "sales_opportunities_local" (
  "id" SERIAL PRIMARY KEY,
  "lead_id" INTEGER NOT NULL REFERENCES "sales_leads"("id"),
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

CREATE TABLE "sales_tasks" (
  "id" SERIAL PRIMARY KEY,
  "lead_id" INTEGER REFERENCES "sales_leads"("id"),
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

-- 5. Indexes (match shared/schema/sales.ts).
CREATE INDEX "sales_leads_owner_idx" ON "sales_leads" ("owner_rep_id");
CREATE INDEX "sales_leads_status_idx" ON "sales_leads" ("status");
CREATE INDEX "sales_leads_name_idx" ON "sales_leads" ("name");
CREATE INDEX "sales_lead_locations_lead_idx" ON "sales_lead_locations" ("lead_id");
CREATE INDEX "sales_lead_contacts_lead_idx" ON "sales_lead_contacts" ("lead_id");
CREATE INDEX "sales_visits_rep_idx" ON "sales_visits" ("rep_id");
CREATE INDEX "sales_visits_lead_idx" ON "sales_visits" ("lead_id");
CREATE INDEX "sales_visits_status_idx" ON "sales_visits" ("status");
CREATE INDEX "sales_opportunities_lead_idx" ON "sales_opportunities_local" ("lead_id");
CREATE INDEX "sales_opportunities_rep_idx" ON "sales_opportunities_local" ("rep_id");
CREATE INDEX "sales_opportunities_status_idx" ON "sales_opportunities_local" ("status");
CREATE INDEX "sales_tasks_rep_idx" ON "sales_tasks" ("rep_id");
CREATE INDEX "sales_tasks_status_idx" ON "sales_tasks" ("status");
