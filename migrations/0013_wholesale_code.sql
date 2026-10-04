-- Each approved reseller's personal wholesale code ("XP-XXXX-XXXX"). Typed in
-- the Stuscle store (or carried by the "Buy kits" button) to unlock wholesale
-- prices; Stuscle checks it with Xpot, which only says yes for an active,
-- unblocked rep. Stored normalized, without the hyphens ("XPABCD1234").

ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "wholesale_code" text;
CREATE UNIQUE INDEX IF NOT EXISTS "sales_reps_wholesale_code_unique" ON "sales_reps" ("wholesale_code") WHERE "wholesale_code" IS NOT NULL;
