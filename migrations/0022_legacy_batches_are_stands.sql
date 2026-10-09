-- Every piece printed so far is a Stand, not a Sign or a Plate. REV-2026-001
-- is the only Small run; REV-2026-002, REV-2026-003 and IG-2026-001 are Large.
--
-- The REV runs were recorded as google_review_sign, whose face (Google's G)
-- came from the product type. Stand types imply no face, so write it on the
-- batch before switching the type, or the pieces would lose their G.

UPDATE "tag_batches"
SET "face" = 'google_review'
WHERE "batch_code" IN ('REV-2026-001', 'REV-2026-002', 'REV-2026-003')
AND "face" IS NULL;

UPDATE "tags"
SET "product_type" = 'small_stand'
WHERE "batch_id" IN (SELECT "id" FROM "tag_batches" WHERE "batch_code" = 'REV-2026-001');

UPDATE "tags"
SET "product_type" = 'large_stand'
WHERE "batch_id" IN (
  SELECT "id" FROM "tag_batches" WHERE "batch_code" IN ('REV-2026-002', 'REV-2026-003', 'IG-2026-001')
);

UPDATE "tag_batches"
SET "product_type" = 'small_stand'
WHERE "batch_code" = 'REV-2026-001';

UPDATE "tag_batches"
SET "product_type" = 'large_stand'
WHERE "batch_code" IN ('REV-2026-002', 'REV-2026-003', 'IG-2026-001');

UPDATE "tag_batches"
SET "name" = 'Large Stand — Instagram — 103x137 mm'
WHERE "batch_code" = 'IG-2026-001'
AND "name" = 'Large Plate — Instagram — 103x137 mm';
