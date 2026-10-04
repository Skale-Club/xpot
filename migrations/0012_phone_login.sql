-- Phone sign-in with a one-time code (SMS), admin approval and blocking.
--
-- * users.phone is the login identity, in E.164 ("+15085550100"). Backfilled
--   from the rep's profile phone when it reads as a full number and is unique,
--   so existing reps and admins can sign in by phone right away.
-- * sales_reps.blocked_at / blocked_reason: an admin ended the partnership.
--   Access is still gated by is_active; the reason a rep is inactive is
--   "pending approval" when blocked_at is null and "blocked" otherwise.
-- * auth_phone_codes: the codes sent by SMS, stored as hashes, short-lived.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_unique" ON "users" ("phone") WHERE "phone" IS NOT NULL;

ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp;
ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "blocked_reason" text;

-- Backfill: 10 digits are a US number (+1), 11–15 digits are already international.
WITH candidates AS (
  SELECT r.user_id,
         CASE
           WHEN length(d.digits) = 10 THEN '+1' || d.digits
           WHEN length(d.digits) BETWEEN 11 AND 15 THEN '+' || d.digits
         END AS e164
  FROM "sales_reps" r
  CROSS JOIN LATERAL (SELECT regexp_replace(coalesce(r.phone, ''), '\D', '', 'g') AS digits) d
),
unique_numbers AS (
  SELECT e164, min(user_id) AS user_id
  FROM candidates
  WHERE e164 IS NOT NULL
  GROUP BY e164
  HAVING count(*) = 1
)
UPDATE "users" u
SET "phone" = n.e164
FROM unique_numbers n
WHERE u.id = n.user_id
  AND u.phone IS NULL
  AND NOT EXISTS (SELECT 1 FROM "users" other WHERE other.phone = n.e164);

CREATE TABLE IF NOT EXISTS "auth_phone_codes" (
  "id" serial PRIMARY KEY,
  "phone" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "ip" text,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "auth_phone_codes_phone_idx" ON "auth_phone_codes" ("phone", "created_at");
ALTER TABLE "auth_phone_codes" ENABLE ROW LEVEL SECURITY;
