-- The printed Stands could not be sold: the catalog had no Stand product, their
-- batches were linked to none, and the house reseller's cost policy was never
-- confirmed. Catalog prices are defaults; the sale screen lets each sale differ.

INSERT INTO "sales_products" ("sku", "name", "description", "kind", "category", "unit_label", "base_price_cents", "consignable", "sort_order")
VALUES
  ('stand-large', 'Large Stand', 'NFC + QR counter stand, 103x137 mm', 'physical', 'Tags', 'unit', 5000, false, 10),
  ('stand-small', 'Small Stand', 'NFC + QR counter stand, small', 'physical', 'Tags', 'unit', 4000, false, 11)
ON CONFLICT ("sku") DO NOTHING;

-- Batch first, then its pieces, as the batch editor does (server/tags/repository.ts).
UPDATE "tag_batches" b
SET "sales_product_id" = p."id"
FROM "sales_products" p
WHERE b."sales_product_id" IS NULL
AND p."sku" = CASE b."product_type" WHEN 'large_stand' THEN 'stand-large' WHEN 'small_stand' THEN 'stand-small' END;

UPDATE "tags" t
SET "sales_product_id" = b."sales_product_id", "updated_at" = NOW()
FROM "tag_batches" b
WHERE t."batch_id" = b."id"
AND t."sales_product_id" IS NULL
AND b."sales_product_id" IS NOT NULL;

-- The house reseller (the owner's own account) sells house pieces at zero
-- acquisition cost. Only fills a policy nobody has confirmed yet.
UPDATE "sales_reps"
SET "cost_policy" = 'zero', "cost_policy_configured_at" = NOW(), "cost_policy_configured_by_user_id" = "user_id"
WHERE "email" = 'skale.club@gmail.com'
AND "cost_policy_configured_at" IS NULL;
