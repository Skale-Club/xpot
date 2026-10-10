-- The Large Plate is real now: the adhesive tabletop NFC + QR plate, 103x103 mm (the 3D Printing repo's
-- NFC/Plate, sized for four on a Bambu A1 plate), and its first batch LPLATE-2026-001 (four Instagram plates)
-- was generated on 2026-10-10. Migration 0027 had retired the product because nothing printed was a Plate, and
-- 0025 described it with the Stand's 103x137 mm. Bring it back with the right size and the store's price, and
-- link the batch and its pieces by SKU (the batch was created over MCP with the id deduced, 9).

UPDATE "sales_products"
SET
  "is_active" = true,
  "description" = 'NFC + QR adhesive tabletop plate, 103x103 mm',
  "base_price_cents" = 1799,
  "updated_at" = NOW()
WHERE "sku" = 'plate-large';

UPDATE "tag_batches" b
SET "sales_product_id" = p."id", "updated_at" = NOW()
FROM "sales_products" p
WHERE b."batch_code" = 'LPLATE-2026-001'
  AND p."sku" = 'plate-large';

UPDATE "tags" t
SET "sales_product_id" = p."id", "updated_at" = NOW()
FROM "tag_batches" b, "sales_products" p
WHERE t."batch_id" = b."id"
  AND b."batch_code" = 'LPLATE-2026-001'
  AND p."sku" = 'plate-large';
