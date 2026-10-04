-- Which sides of the app each rep may use: field visits ('visits') and the
-- QR/NFC tags resellers sell ('tags'). Existing reps keep both; an admin can
-- narrow a reseller to just 'tags'. Values mirror shared/modules.ts.

ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "modules" text[] NOT NULL DEFAULT '{visits,tags}';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_reps_modules_check') THEN
    ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_modules_check"
      CHECK ("modules" <@ ARRAY['visits', 'tags']::text[]);
  END IF;
END
$$;
