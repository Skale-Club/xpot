-- IG-2026-001 is the standard adhesive tabletop Plate with the standard
-- Instagram face. Migration 0022 temporarily grouped every printed 103x137 mm
-- run as a Stand; correct the Celes batch and its pieces without touching sale
-- history.

INSERT INTO "sales_products"
  ("sku", "name", "description", "kind", "category", "unit_label", "base_price_cents", "consignable", "sort_order")
VALUES
  ('plate-large', 'Large Plate', 'NFC + QR adhesive tabletop plate, 103x137 mm', 'physical', 'Tags', 'unit', 5000, false, 12)
ON CONFLICT ("sku") DO NOTHING;

UPDATE "tag_batches" b
SET
  "product_type" = 'large_plate',
  "name" = 'Large Plate — Instagram — 103x137 mm',
  "face" = 'instagram',
  "sales_product_id" = p."id",
  "updated_at" = NOW()
FROM "sales_products" p
WHERE b."batch_code" = 'IG-2026-001'
  AND p."sku" = 'plate-large';

UPDATE "tags" t
SET
  "product_type" = 'large_plate',
  "face" = COALESCE(t."face", 'instagram'),
  "sales_product_id" = p."id",
  "updated_at" = NOW()
FROM "tag_batches" b, "sales_products" p
WHERE t."batch_id" = b."id"
  AND b."batch_code" = 'IG-2026-001'
  AND p."sku" = 'plate-large';
