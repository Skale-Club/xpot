-- Tags: the "venmo" face ("Pay here" with the Venmo wordmark) joins TAG_FACES.
-- LPLATE-2026-006, the first Venmo plates (2 white + 2 black, 2026-10-22), was
-- issued as "custom" because the face did not exist yet. This is a no-op on any
-- database that has no such batch, and on one where its face was already set.
UPDATE "tag_batches" SET "face" = 'venmo' WHERE "batch_code" = 'LPLATE-2026-006' AND "face" = 'custom';
