-- Provider-specific, non-secret settings for integration_settings rows.
-- Twilio keeps its Account SID, From number and Messaging Service SID here
-- (the Auth Token stays in api_key, masked like every other secret). Nullable:
-- existing rows (GoHighLevel, Google Places) don't use it.
-- Idempotent: safe to run more than once.

ALTER TABLE "integration_settings" ADD COLUMN IF NOT EXISTS "config" jsonb;
