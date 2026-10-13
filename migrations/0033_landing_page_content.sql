-- Editable public landing-page content, one JSON document per supported locale.
-- The app server is the only writer; RLS blocks direct anonymous PostgREST access.

CREATE TABLE IF NOT EXISTS "landing_page_contents" (
  "locale" TEXT PRIMARY KEY,
  "content" JSONB NOT NULL,
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "landing_page_contents_locale" CHECK ("locale" IN ('en', 'pt', 'es'))
);

ALTER TABLE "landing_page_contents" ENABLE ROW LEVEL SECURITY;
