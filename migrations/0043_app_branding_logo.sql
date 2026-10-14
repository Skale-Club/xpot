-- Store the horizontal product logo separately from the square favicon/PWA icon.

ALTER TABLE "app_branding"
  ADD COLUMN IF NOT EXISTS "logo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "logo_content_type" TEXT;
