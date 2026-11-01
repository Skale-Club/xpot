-- Customer panel (docs/PROFILES_EXECUTION_PLAN.md, F7, D7): the business that uses the plates (a lead) can read how many
-- it has and how they are doing, from /my, signing in with the code of one of its pieces and a phone.
-- lead_customer_contacts is the list of phones allowed to see a business's panel. A phone is added by the seller who
-- can use the lead, or recorded when the phone typed matches the business's own phone (sales_leads.phone) and the code
-- texted to it was entered. These phones are not users: no account, no rep, no access request is created for them.
-- Nothing is backfilled. The panel itself stays off until the server sets CUSTOMER_PANEL_ENABLED.
-- Idempotent: safe to run more than once.
-- Recovery: DROP TABLE "lead_customer_contacts" (nothing else depends on it).

CREATE TABLE IF NOT EXISTS "lead_customer_contacts" (
  "lead_id" integer NOT NULL REFERENCES "sales_leads"("id") ON DELETE CASCADE,
  -- E.164, as shared/phone.ts normalizePhone writes it.
  "phone" text NOT NULL CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$'),
  -- First time the phone signed in to the panel; null until then.
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  -- The seller who added it; null when it came from the business's own phone.
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  PRIMARY KEY ("lead_id", "phone")
);

CREATE INDEX IF NOT EXISTS "lead_customer_contacts_phone_idx" ON "lead_customer_contacts" ("phone");
