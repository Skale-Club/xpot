-- Xpot Tags: physical QR/NFC pieces with dynamic redirects + scan analytics,
-- ported from Skale Club's Smart Tags. One `tags` row per piece. Its
-- public_code is printed as a QR (/q/<code>) and programmed into the NFC chip
-- (/n/<code>) once; the destination is data here and changes freely.
--
-- Skale Club supplies the pieces; a reseller (sales_reps) receives them in a
-- kit and sells them to businesses (sales_leads).
-- Allowed enum values mirror shared/tags.ts. No raw IP is stored:
-- tag_events.visitor_day_key is a daily HMAC.

CREATE TABLE IF NOT EXISTS "tag_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_code" text NOT NULL,
  "name" text NOT NULL,
  "product_type" text NOT NULL,
  "vendor" text,
  "quantity" integer NOT NULL CHECK ("quantity" > 0),
  "status" text NOT NULL DEFAULT 'generated'
    CHECK ("status" IN ('draft', 'generated', 'ordered', 'received', 'completed', 'cancelled')),
  "notes" text,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tag_batches_product_type_check" CHECK ("product_type" IN (
    'google_review_sign', 'business_card', 'keychain', 'safety_tag', 'menu_tag', 'booking_tag', 'custom'
  ))
);
CREATE UNIQUE INDEX IF NOT EXISTS "tag_batches_batch_code_unique" ON "tag_batches" ("batch_code");

CREATE TABLE IF NOT EXISTS "tag_kits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rep_id" integer NOT NULL REFERENCES "sales_reps"("id"),
  "note" text,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tag_kits_rep_idx" ON "tag_kits" ("rep_id", "created_at");

-- Paired desktop NFC provisioners. Only SHA-256 hashes of the pairing code and
-- the device token are stored.
CREATE TABLE IF NOT EXISTS "tag_provisioning_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "device_name" text NOT NULL,
  "platform" text,
  "app_version" text,
  "status" text NOT NULL DEFAULT 'pairing' CHECK ("status" IN ('pairing', 'active', 'revoked')),
  "pairing_code_hash" text,
  "pairing_expires_at" timestamptz,
  "token_hash" text,
  "token_prefix" text,
  "last_seen_at" timestamptz,
  "paired_at" timestamptz,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "tag_provisioning_devices_token_unique"
  ON "tag_provisioning_devices" ("token_hash") WHERE "token_hash" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tag_provisioning_devices_pairing_unique"
  ON "tag_provisioning_devices" ("pairing_code_hash") WHERE "pairing_code_hash" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "public_code" text NOT NULL,
  "serial_number" integer,
  "batch_id" uuid REFERENCES "tag_batches"("id") ON DELETE SET NULL,
  "rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL,
  "kit_id" uuid REFERENCES "tag_kits"("id") ON DELETE SET NULL,
  "lead_id" integer REFERENCES "sales_leads"("id") ON DELETE SET NULL,
  "product_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'inventory',
  "destination_type" text,
  "destination_url" text,
  "utm_enabled" boolean NOT NULL DEFAULT false,
  "utm_campaign" text,
  "label" text,
  "metadata" jsonb,
  "assigned_at" timestamptz,
  "activated_at" timestamptz,
  "disabled_at" timestamptz,
  "sold_at" timestamptz,
  "activated_by_rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL,
  "nfc_provisioning_status" text NOT NULL DEFAULT 'not_programmed'
    CHECK ("nfc_provisioning_status" IN ('not_programmed', 'programmed', 'verified', 'locked', 'failed')),
  "nfc_programmed_at" timestamptz,
  "nfc_verified_at" timestamptz,
  "nfc_locked_at" timestamptz,
  "nfc_provisioning_device_id" uuid REFERENCES "tag_provisioning_devices"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tags_status_check" CHECK ("status" IN ('inventory', 'assigned', 'active', 'disabled', 'retired')),
  CONSTRAINT "tags_product_type_check" CHECK ("product_type" IN (
    'google_review_sign', 'business_card', 'keychain', 'safety_tag', 'menu_tag', 'booking_tag', 'custom'
  )),
  CONSTRAINT "tags_destination_type_check" CHECK ("destination_type" IS NULL OR "destination_type" IN (
    'google_review', 'website', 'booking', 'vcard', 'menu', 'social', 'custom'
  )),
  -- An active tag must always have somewhere to send people.
  CONSTRAINT "tags_active_has_destination" CHECK (
    "status" <> 'active' OR ("destination_url" IS NOT NULL AND "destination_type" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "tags_public_code_unique" ON "tags" ("public_code");
CREATE INDEX IF NOT EXISTS "tags_rep_idx" ON "tags" ("rep_id", "status");
CREATE INDEX IF NOT EXISTS "tags_lead_idx" ON "tags" ("lead_id");
CREATE INDEX IF NOT EXISTS "tags_batch_idx" ON "tags" ("batch_id");
CREATE INDEX IF NOT EXISTS "tags_status_idx" ON "tags" ("status");

CREATE TABLE IF NOT EXISTS "tag_destination_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "previous_url" text,
  "new_url" text,
  "previous_destination_type" text,
  "new_destination_type" text,
  "changed_by_user_id" text,
  "reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tag_destination_history_tag_idx" ON "tag_destination_history" ("tag_id", "created_at" DESC);

-- History is append-only: refuse UPDATE at the database level too.
CREATE OR REPLACE FUNCTION "tag_destination_history_immutable"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tag_destination_history rows are immutable';
END;
$$;
DROP TRIGGER IF EXISTS "tag_destination_history_no_update" ON "tag_destination_history";
CREATE TRIGGER "tag_destination_history_no_update"
  BEFORE UPDATE ON "tag_destination_history"
  FOR EACH ROW EXECUTE FUNCTION "tag_destination_history_immutable"();

CREATE TABLE IF NOT EXISTS "tag_events" (
  "id" bigserial PRIMARY KEY,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "lead_id" integer REFERENCES "sales_leads"("id") ON DELETE SET NULL,
  "rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL,
  "access_method" text NOT NULL CHECK ("access_method" IN ('qr', 'nfc')),
  "event_type" text NOT NULL
    CHECK ("event_type" IN ('redirect', 'inventory_scan', 'disabled_scan', 'misconfigured_scan')),
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "visitor_day_key" text,
  "device_type" text,
  "os_family" text,
  "browser_family" text,
  "country_code" text,
  "referrer" text,
  "is_bot" boolean NOT NULL DEFAULT false,
  "request_id" text
);
CREATE INDEX IF NOT EXISTS "tag_events_tag_occurred_idx" ON "tag_events" ("tag_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "tag_events_occurred_idx" ON "tag_events" ("occurred_at");
CREATE INDEX IF NOT EXISTS "tag_events_lead_occurred_idx" ON "tag_events" ("lead_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "tag_events_rep_occurred_idx" ON "tag_events" ("rep_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "tag_provisioning_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  -- Fixed when the job is created; the app writes exactly this and the server
  -- compares the read-back against it.
  "expected_url" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'
    CHECK ("status" IN ('pending', 'claimed', 'writing', 'verifying', 'succeeded', 'failed', 'cancelled')),
  "requested_by_user_id" text,
  "target_device_id" uuid REFERENCES "tag_provisioning_devices"("id") ON DELETE SET NULL,
  "claimed_by_device_id" uuid REFERENCES "tag_provisioning_devices"("id") ON DELETE SET NULL,
  "readback_url" text,
  "tag_type" text,
  "error_code" text,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "claimed_at" timestamptz,
  "completed_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tag_provisioning_jobs_tag_idx" ON "tag_provisioning_jobs" ("tag_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "tag_provisioning_jobs_open_idx" ON "tag_provisioning_jobs" ("status", "created_at")
  WHERE "status" IN ('pending', 'claimed', 'writing', 'verifying');
-- At most one open job per physical tag.
CREATE UNIQUE INDEX IF NOT EXISTS "tag_provisioning_jobs_one_open_per_tag" ON "tag_provisioning_jobs" ("tag_id")
  WHERE "status" IN ('pending', 'claimed', 'writing', 'verifying');

CREATE TABLE IF NOT EXISTS "tag_provisioning_events" (
  "id" bigserial PRIMARY KEY,
  "job_id" uuid REFERENCES "tag_provisioning_jobs"("id") ON DELETE CASCADE,
  "tag_id" uuid REFERENCES "tags"("id") ON DELETE CASCADE,
  "device_id" uuid REFERENCES "tag_provisioning_devices"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL CHECK ("event_type" IN (
    'job_created', 'job_claimed', 'job_cancelled', 'job_expired',
    'reader_connected', 'reader_disconnected', 'tag_detected',
    'write_started', 'write_completed', 'verification_passed', 'verification_failed',
    'lock_requested', 'lock_completed', 'error'
  )),
  "detail" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tag_provisioning_events_job_idx" ON "tag_provisioning_events" ("job_id", "created_at");
CREATE INDEX IF NOT EXISTS "tag_provisioning_events_device_idx" ON "tag_provisioning_events" ("device_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "tag_direct_writes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" integer REFERENCES "sales_leads"("id") ON DELETE SET NULL,
  "rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL,
  "url" text NOT NULL,
  "label" text,
  -- web_nfc: written by the phone app. manual: link copied into another app
  -- (NFC Tools on iPhone) and confirmed by the operator.
  "method" text NOT NULL DEFAULT 'web_nfc' CHECK ("method" IN ('web_nfc', 'manual')),
  -- True only when the phone read the chip back and got exactly `url`.
  "verified" boolean NOT NULL DEFAULT false,
  "written_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tag_direct_writes_rep_idx" ON "tag_direct_writes" ("rep_id", "created_at" DESC);

-- Same lockdown as the sales_ tables (0004): RLS on with no policies blocks
-- direct anon access; the app connects as the owner and is unaffected.
ALTER TABLE "tag_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_kits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_provisioning_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_destination_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_provisioning_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_provisioning_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_direct_writes" ENABLE ROW LEVEL SECURITY;
