-- A plate cancelled before any piece of its batch was received left its codes `pending`, so they counted as
-- "not received" in every stock number although they will never be printed. Since this release cancelling such a plate
-- retires its codes and cancels its batch (server/tags/production.ts retireCancelledPlateCodes); this does the same for
-- the plates cancelled before it: the batch's plate is cancelled, no other plate of the batch is live and every code is
-- still pending.
--
-- The reason text must match CANCELLED_PLATE_RETIRE_REASON: printing such a plate again (redoJob) brings these same
-- codes back. Recovery: the same — print the cancelled plate again from Production.

DO $$
DECLARE
  reason constant text := 'Never printed: the plate was cancelled';
  target uuid[];
BEGIN
  SELECT array_agg(b."id") INTO target
  FROM "tag_batches" b
  JOIN "print_jobs" j ON j."id" = b."print_job_id"
  WHERE j."status" = 'cancelled'
    AND b."status" <> 'cancelled'
    AND NOT EXISTS (
      SELECT 1 FROM "print_jobs" o
      WHERE o."batch_id" = b."id" AND o."id" <> j."id" AND o."status" NOT IN ('failed', 'cancelled')
    )
    AND NOT EXISTS (SELECT 1 FROM "tags" t WHERE t."batch_id" = b."id" AND t."stock_status" <> 'pending');
  IF target IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO "tag_stock_movements" (
    "tag_id", "movement_type", "from_stock_status", "to_stock_status", "from_ownership_type", "to_ownership_type",
    "from_custodian_rep_id", "to_custodian_rep_id", "reference_type", "reference_id", "reason"
  )
  SELECT t."id", 'retire', 'pending', 'retired', t."ownership_type", t."ownership_type",
         t."custodian_rep_id", t."custodian_rep_id", 'batch', t."batch_id"::text, reason
  FROM "tags" t
  WHERE t."batch_id" = ANY (target);

  UPDATE "tags"
  SET "status" = 'retired', "stock_status" = 'retired', "disabled_at" = now(), "stock_updated_at" = now(), "updated_at" = now()
  WHERE "batch_id" = ANY (target);

  UPDATE "tag_batches" SET "status" = 'cancelled', "updated_at" = now() WHERE "id" = ANY (target);
END $$;
