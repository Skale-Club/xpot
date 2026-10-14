-- A Google business is one CRM company inside an Organization. Preserve any
-- historic duplicate rows and their relations, but remove the duplicate lookup
-- key before enforcing idempotency for all future prospecting runs.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY organization_id, google_place_id
      ORDER BY created_at NULLS LAST, id
    ) AS duplicate_rank
  FROM sales_leads
  WHERE google_place_id IS NOT NULL
)
UPDATE sales_leads
SET google_place_id = NULL,
    updated_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE duplicate_rank > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_leads_org_google_place_unique"
  ON "sales_leads" ("organization_id", "google_place_id")
  WHERE "google_place_id" IS NOT NULL;
