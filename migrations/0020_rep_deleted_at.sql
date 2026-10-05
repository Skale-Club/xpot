-- Account deletion (server/accountDeletion.ts). When a deleted rep still has
-- sales, consignments or tag kits that must be kept for accounting, their
-- sales_reps row stays as an anonymous placeholder ("Deleted account", no
-- contact details) so those records keep a valid rep_id. deleted_at marks it,
-- and Admin › Reps hides it. Rows with nothing to keep are removed outright.
-- Idempotent: safe to run more than once.

ALTER TABLE "sales_reps" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
