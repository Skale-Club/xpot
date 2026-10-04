-- Xpot Tags Journey: the story of the physical pieces, ported from Skale
-- Club's Smart Tags Journey. Two tables:
--
--   tag_plans            strategies, hypotheses, experiments, targets and
--                        tasks, with a status that is closed as validated /
--                        invalidated / done / cancelled.
--   tag_journey_entries  the timeline: executions (what was done, with
--                        before -> after) and decisions, insights,
--                        observations, risks and results. Each entry can
--                        point at a batch, a tag, a kit, a reseller, a lead
--                        and a plan. Append-only: only `status` may change.
--
-- Admin-only read model (the field app never shows it). Allowed values mirror
-- shared/tagJourney.ts. Depends on 0009_tags.sql. Fully idempotent.

CREATE TABLE IF NOT EXISTS "tag_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" text NOT NULL
    CHECK (kind IN ('strategy', 'hypothesis', 'experiment', 'target', 'task')),
  "title" text NOT NULL,
  "description" text,
  "batch_id" uuid REFERENCES "tag_batches"("id") ON DELETE SET NULL,
  "tag_id" uuid REFERENCES "tags"("id") ON DELETE SET NULL,
  "kit_id" uuid REFERENCES "tag_kits"("id") ON DELETE SET NULL,
  "lead_id" integer REFERENCES "sales_leads"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'paused', 'validated', 'invalidated', 'done', 'cancelled')),
  -- What closing the plan showed (filled when it is validated, invalidated or done).
  "outcome" text,
  "due_date" date,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "tag_plans_status_idx" ON "tag_plans" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "tag_plans_batch_idx" ON "tag_plans" ("batch_id") WHERE "batch_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "tag_plans_tag_idx" ON "tag_plans" ("tag_id") WHERE "tag_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "tag_journey_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" text NOT NULL
    CHECK (kind IN ('execution', 'decision', 'insight', 'observation', 'risk', 'result')),
  -- snake_case name of what an execution did (batch_created, printed, ...).
  "action" text CHECK (action IS NULL OR action ~ '^[a-z][a-z0-9_]{0,39}$'),
  "title" text NOT NULL,
  "content" text,
  "batch_id" uuid REFERENCES "tag_batches"("id") ON DELETE SET NULL,
  "tag_id" uuid REFERENCES "tags"("id") ON DELETE SET NULL,
  "kit_id" uuid REFERENCES "tag_kits"("id") ON DELETE SET NULL,
  -- The reseller the entry is about (the holder of the piece, the kit's owner).
  "rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL,
  "lead_id" integer REFERENCES "sales_leads"("id") ON DELETE SET NULL,
  "plan_id" uuid REFERENCES "tag_plans"("id") ON DELETE SET NULL,
  "before_value" text,
  "after_value" text,
  "source" text NOT NULL CHECK (source IN ('system', 'admin', 'field', 'mcp')),
  "actor" text NOT NULL CHECK (actor IN ('human', 'ai', 'system')),
  "actor_user_id" text,
  -- Who acted, when it was a reseller in the field app.
  "actor_rep_id" integer REFERENCES "sales_reps"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'needs_review', 'archived', 'superseded')),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- When it happened; may be earlier than created_at for an entry recorded afterwards.
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tag_journey_entries_occurred_idx"
  ON "tag_journey_entries" ("occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "tag_journey_entries_batch_idx"
  ON "tag_journey_entries" ("batch_id", "occurred_at" DESC) WHERE "batch_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "tag_journey_entries_tag_idx"
  ON "tag_journey_entries" ("tag_id", "occurred_at" DESC) WHERE "tag_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "tag_journey_entries_kit_idx"
  ON "tag_journey_entries" ("kit_id", "occurred_at" DESC) WHERE "kit_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "tag_journey_entries_lead_idx"
  ON "tag_journey_entries" ("lead_id", "occurred_at" DESC) WHERE "lead_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "tag_journey_entries_rep_idx"
  ON "tag_journey_entries" ("rep_id", "occurred_at" DESC) WHERE "rep_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "tag_journey_entries_plan_idx"
  ON "tag_journey_entries" ("plan_id") WHERE "plan_id" IS NOT NULL;

-- Append-only at the database level too: an UPDATE may change the review
-- status and nothing else. The foreign key columns are left out of the check
-- on purpose, so ON DELETE SET NULL from a parent row keeps working.
CREATE OR REPLACE FUNCTION tag_journey_entries_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.action IS DISTINCT FROM OLD.action
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.before_value IS DISTINCT FROM OLD.before_value
    OR NEW.after_value IS DISTINCT FROM OLD.after_value
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.actor IS DISTINCT FROM OLD.actor
    OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'tag_journey_entries are append-only: only status may change';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "tag_journey_entries_append_only" ON "tag_journey_entries";
CREATE TRIGGER "tag_journey_entries_append_only"
  BEFORE UPDATE ON "tag_journey_entries"
  FOR EACH ROW EXECUTE FUNCTION tag_journey_entries_append_only();

-- Same lockdown as the other tag tables (0009): RLS on with no policies
-- blocks direct anon access; the app connects as the owner and is unaffected.
ALTER TABLE "tag_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_journey_entries" ENABLE ROW LEVEL SECURITY;
