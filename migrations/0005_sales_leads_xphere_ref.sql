-- Round-trip reference to the originating Xphere prospect, so a field-visit
-- outcome can be synced back to the right record. Format: "contact:uuid" or
-- "account:uuid". Null for leads not created from Xphere.
ALTER TABLE "sales_leads" ADD COLUMN IF NOT EXISTS "xphere_ref" text;
