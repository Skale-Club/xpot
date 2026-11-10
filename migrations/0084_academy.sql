-- Academy: in-app courses authored in Notion. Only what people DID is stored here (the courses and lessons stay in
-- Notion and are never copied): one progress row per person and lesson, and an append-only timeline of events.
-- Keyed by the person (sales_reps.id) and, when known, their organization. Both tables go when the person is deleted.
-- Quizzes will add their own table (academy_quiz_attempts); nothing here blocks it. Idempotent.

CREATE TABLE IF NOT EXISTS "academy_lesson_progress" (
  "rep_id" integer NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "organization_id" integer REFERENCES "organizations"("id") ON DELETE SET NULL,
  "course_id" text NOT NULL,
  "lesson_id" text NOT NULL,
  "first_opened_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "active_seconds" integer NOT NULL DEFAULT 0,
  "video_duration_seconds" integer,
  "video_watched_ranges" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "video_watched_seconds" integer NOT NULL DEFAULT 0,
  "max_scroll_pct" integer NOT NULL DEFAULT 0,
  "completed_at" timestamptz,
  "open_count" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("rep_id", "lesson_id")
);
CREATE INDEX IF NOT EXISTS "academy_lesson_progress_course_idx" ON "academy_lesson_progress" ("course_id");

CREATE TABLE IF NOT EXISTS "academy_events" (
  "id" bigserial PRIMARY KEY,
  "rep_id" integer NOT NULL REFERENCES "sales_reps"("id") ON DELETE CASCADE,
  "organization_id" integer REFERENCES "organizations"("id") ON DELETE SET NULL,
  "course_id" text NOT NULL,
  "lesson_id" text NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "academy_events_rep_idx" ON "academy_events" ("rep_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "academy_events_course_idx" ON "academy_events" ("course_id");

-- Same default-deny as every other public table (0007): only the app's owner role reads them.
ALTER TABLE "academy_lesson_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academy_events" ENABLE ROW LEVEL SECURITY;
