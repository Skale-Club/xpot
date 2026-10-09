-- The Google runs kept their working names ("Plaquinhas Google ..."), which say
-- neither the model nor the size. Name them like every other batch:
-- <Size> <Model> — <Face> — <dimensions>. Only renames the original names.

UPDATE "tag_batches"
SET "name" = 'Small Stand — Google Review', "updated_at" = NOW()
WHERE "batch_code" = 'REV-2026-001'
AND "name" = 'Plaquinhas Google Small - QR legado Skale Club';

UPDATE "tag_batches"
SET "name" = 'Large Stand — Google Review — 103x137 mm', "updated_at" = NOW()
WHERE "batch_code" IN ('REV-2026-002', 'REV-2026-003')
AND "name" = 'Plaquinhas Google Large 103x137 - Xpot';
