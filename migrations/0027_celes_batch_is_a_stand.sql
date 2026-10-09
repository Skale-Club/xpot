-- Every piece printed so far is a Stand, IG-2026-001 (the Celes pieces)
-- included: 0025 classified it as a Large Plate by mistake. Put the batch and
-- its pieces back on Large Stand. No sale references the Large Plate product
-- yet, so it is only retired from the catalog (not deleted).

UPDATE "tag_batches" b
SET
  "product_type" = 'large_stand',
  "name" = 'Large Stand — Instagram — 103x137 mm',
  "sales_product_id" = p."id",
  "updated_at" = NOW()
FROM "sales_products" p
WHERE b."batch_code" = 'IG-2026-001'
  AND p."sku" = 'stand-large';

UPDATE "tags" t
SET
  "product_type" = 'large_stand',
  "sales_product_id" = p."id",
  "updated_at" = NOW()
FROM "tag_batches" b, "sales_products" p
WHERE t."batch_id" = b."id"
  AND b."batch_code" = 'IG-2026-001'
  AND p."sku" = 'stand-large';

-- Nothing printed is a Plate: keep the row (history-safe), hide it from the catalog.
UPDATE "sales_products"
SET "is_active" = false, "updated_at" = NOW()
WHERE "sku" = 'plate-large'
  AND NOT EXISTS (SELECT 1 FROM "tags" WHERE "sales_product_id" = "sales_products"."id")
  AND NOT EXISTS (SELECT 1 FROM "tag_batches" WHERE "sales_product_id" = "sales_products"."id");
