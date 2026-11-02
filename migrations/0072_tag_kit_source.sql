-- Where a kit came from (Take back, NAV-4). A kit moves its pieces into the receiver's organization when it is handed
-- out, so after that nothing said whose stock they left. Take back put every piece into the company's stock (or, for an
-- owner, the first code's organization), whatever kit it came from. tag_kits.source_organization_id records the
-- organization whose stock the pieces were taken from; Take back returns the pieces there.
--   * New kits: the hand-out and the wholesale order write it.
--   * Existing kits: filled from the batch the kit's pieces were printed in, only when every piece of the kit came from
--     the same organization's batches. Anything unclear stays NULL, and Take back keeps its old destination for it.
-- Nullable and additive: nothing that reads kits changes. Idempotent: safe to run more than once.
-- Recovery: drop the column (tag_kits.source_organization_id).

ALTER TABLE "tag_kits" ADD COLUMN IF NOT EXISTS "source_organization_id" integer;

DO $$ BEGIN
  ALTER TABLE "tag_kits" ADD CONSTRAINT "tag_kits_source_organization_fk"
    FOREIGN KEY ("source_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE "tag_kits" k
SET "source_organization_id" = s.organization_id
FROM (
  SELECT i.kit_id, min(b.organization_id) AS organization_id
  FROM "tag_kit_items" i
  JOIN "tag_batches" b ON b.id = i.batch_id
  GROUP BY i.kit_id
  HAVING count(DISTINCT b.organization_id) = 1 AND count(*) = count(i.batch_id)
) s
WHERE k.id = s.kit_id AND k."source_organization_id" IS NULL;
