ALTER TABLE "sales_visit_notes" ADD COLUMN IF NOT EXISTS "audio_url" text;
ALTER TABLE "sales_visit_notes" ADD COLUMN IF NOT EXISTS "audio_duration_seconds" integer;
ALTER TABLE "sales_visit_notes" ADD COLUMN IF NOT EXISTS "audio_transcription" text;
