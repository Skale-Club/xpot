-- The Google Place behind a lead. Check-in and the Leads tab import businesses
-- from Google Places; keeping the Place ID lets the Tags side build the
-- business's "write a review" link without searching again.

ALTER TABLE "sales_leads" ADD COLUMN IF NOT EXISTS "google_place_id" text;

-- Leads imported before this column existed carry the ID in their notes:
-- "Imported from Google Places (<place id>)".
UPDATE "sales_leads"
SET "google_place_id" = substring("notes" from 'Imported from Google Places \(([^)\s]+)\)')
WHERE "google_place_id" IS NULL
  AND "notes" ~ 'Imported from Google Places \([^)\s]+\)';

CREATE INDEX IF NOT EXISTS "sales_leads_google_place_idx" ON "sales_leads" ("google_place_id");
