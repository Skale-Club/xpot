-- App branding (favicon/icon upload + PWA manifest fields).
--
-- Single-row table (id always 1). The admin uploads an icon in the panel; it is
-- stored in Supabase Storage and the public URL is kept here, together with the
-- PWA manifest fields. The public /api/branding/* endpoints read this row to
-- serve the favicon, apple-touch-icon, web manifest and OG image.
--
-- RLS enabled (consistent with every other table): the app connects as the owner
-- (postgres, BYPASSRLS), so app queries are unaffected; direct anon access is
-- blocked. The favicon is exposed only through the app's own API, not PostgREST.

CREATE TABLE IF NOT EXISTS "app_branding" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "favicon_url" TEXT,
  "favicon_content_type" TEXT,
  "app_name" TEXT DEFAULT 'Xpot',
  "short_name" TEXT DEFAULT 'Xpot',
  "theme_color" TEXT DEFAULT '#09090b',
  "background_color" TEXT DEFAULT '#0a0f1e',
  "updated_at" TIMESTAMP DEFAULT NOW(),
  CONSTRAINT "app_branding_singleton" CHECK ("id" = 1)
);

-- Seed the singleton row so the public endpoints always have defaults to read.
INSERT INTO "app_branding" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "app_branding" ENABLE ROW LEVEL SECURITY;
