-- Physical product models are independent from what is printed on them.
-- A Large Plate can carry the Instagram, Google Review or another standard face.
-- New product values are API-validated from TAG_PRODUCT_TYPES. The original
-- tables also have database CHECK constraints, so expand those constraints in
-- the same migration before updating existing rows.

ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_product_type_check";
ALTER TABLE "tags" ADD CONSTRAINT "tags_product_type_check" CHECK ("product_type" IN (
  'large_stand', 'small_stand', 'large_sign', 'small_sign', 'large_plate', 'small_plate',
  'google_review_sign', 'business_card', 'keychain', 'safety_tag', 'menu_tag', 'booking_tag', 'custom'
));

ALTER TABLE "tag_batches" DROP CONSTRAINT IF EXISTS "tag_batches_product_type_check";
ALTER TABLE "tag_batches" ADD CONSTRAINT "tag_batches_product_type_check" CHECK ("product_type" IN (
  'large_stand', 'small_stand', 'large_sign', 'small_sign', 'large_plate', 'small_plate',
  'google_review_sign', 'business_card', 'keychain', 'safety_tag', 'menu_tag', 'booking_tag', 'custom'
));

-- IG-2026-001 used the standard Large Plate body (103x137 mm) and the standard
-- Instagram face. It was classified as custom only because the physical model
-- did not exist in the catalog yet.
UPDATE "tags"
SET "product_type" = 'large_plate'
WHERE "batch_id" IN (
  SELECT "id" FROM "tag_batches" WHERE "batch_code" = 'IG-2026-001'
)
AND "product_type" = 'custom';

UPDATE "tag_batches"
SET
  "product_type" = 'large_plate',
  "name" = 'Large Plate — Instagram — 103x137 mm'
WHERE "batch_code" = 'IG-2026-001'
AND "product_type" = 'custom';
