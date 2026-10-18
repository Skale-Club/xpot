-- Kits as immutable history (Distribution › Kits). A kit used to be "the
-- pieces whose tags.kit_id points at it": returns and moves clear kit_id, so a
-- kit's counts shrank and nothing kept what was handed out. Now:
--   * tag_kits.kit_number: a short sequential number, shown as K-0001;
--   * tag_kit_items: one row per piece handed out in the kit, written once at
--     the hand-over; left_at / left_reason record when the piece left the
--     reseller's kit (returned to house stock, or moved to another reseller).
-- Backfilled from the kit_delivered journey entries (their metadata lists the
-- codes), the kit stock movements and the pieces still in each kit.
-- Idempotent: safe to run more than once.

CREATE SEQUENCE IF NOT EXISTS "tag_kits_kit_number_seq";
ALTER TABLE "tag_kits" ADD COLUMN IF NOT EXISTS "kit_number" integer;

-- Number existing kits in hand-over order.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM "tag_kits" WHERE "kit_number" IS NULL
)
UPDATE "tag_kits" k
SET "kit_number" = numbered.n + COALESCE((SELECT max("kit_number") FROM "tag_kits"), 0)
FROM numbered
WHERE k.id = numbered.id;

SELECT setval('tag_kits_kit_number_seq', GREATEST(COALESCE((SELECT max("kit_number") FROM "tag_kits"), 0), 1),
  (SELECT max("kit_number") FROM "tag_kits") IS NOT NULL);
ALTER TABLE "tag_kits" ALTER COLUMN "kit_number" SET DEFAULT nextval('tag_kits_kit_number_seq');
ALTER SEQUENCE "tag_kits_kit_number_seq" OWNED BY "tag_kits"."kit_number";
ALTER TABLE "tag_kits" ALTER COLUMN "kit_number" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tag_kits_kit_number_unique" ON "tag_kits" ("kit_number");

CREATE TABLE IF NOT EXISTS "tag_kit_items" (
  "kit_id" uuid NOT NULL REFERENCES "tag_kits"("id") ON DELETE CASCADE,
  "tag_id" uuid REFERENCES "tags"("id") ON DELETE SET NULL,
  -- The printed code at hand-over time: the packing list survives the piece.
  "public_code" text NOT NULL,
  "batch_id" uuid,
  "handed_out_at" timestamptz NOT NULL DEFAULT now(),
  "left_at" timestamptz,
  "left_reason" text,
  PRIMARY KEY ("kit_id", "public_code")
);
DO $$ BEGIN
  ALTER TABLE "tag_kit_items"
    ADD CONSTRAINT "tag_kit_items_left_reason_check" CHECK ("left_reason" IS NULL OR "left_reason" IN ('returned', 'moved'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "tag_kit_items_tag_idx" ON "tag_kit_items" ("tag_id");

-- 1. The codes each kit_delivered journey entry recorded.
INSERT INTO "tag_kit_items" ("kit_id", "tag_id", "public_code", "batch_id", "handed_out_at")
SELECT j.kit_id, t.id, code.value, t.batch_id, j.occurred_at
FROM "tag_journey_entries" j
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(j.metadata -> 'codes') = 'array' THEN j.metadata -> 'codes' ELSE '[]'::jsonb END
) AS code(value)
JOIN "tag_kits" k ON k.id = j.kit_id
LEFT JOIN "tags" t ON t.public_code = code.value
WHERE j.action = 'kit_delivered' AND j.kit_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Pieces moved into a kit by a stock movement (kits given since 0029; the
-- table may not exist yet when migrations are replayed out of order).
DO $$ BEGIN
  IF to_regclass('public.tag_stock_movements') IS NOT NULL THEN
    INSERT INTO "tag_kit_items" ("kit_id", "tag_id", "public_code", "batch_id", "handed_out_at")
    SELECT k.id, t.id, t.public_code, t.batch_id, min(m.created_at)
    FROM "tag_stock_movements" m
    JOIN "tag_kits" k ON k.id::text = m.reference_id
    JOIN "tags" t ON t.id = m.tag_id
    WHERE m.reference_type = 'kit' AND m.movement_type = 'transfer'
    GROUP BY k.id, t.id, t.public_code, t.batch_id
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 3. Pieces still pointing at their kit (Stuscle orders, kits older than both).
INSERT INTO "tag_kit_items" ("kit_id", "tag_id", "public_code", "batch_id", "handed_out_at")
SELECT k.id, t.id, t.public_code, t.batch_id, k.created_at
FROM "tags" t
JOIN "tag_kits" k ON k.id = t.kit_id
ON CONFLICT DO NOTHING;

-- Pieces no longer in the kit they were handed out in have left it: returned
-- when the first stock movement after the hand-over was a return (or the piece
-- is back in house stock), moved otherwise.
DO $$ BEGIN
  IF to_regclass('public.tag_stock_movements') IS NOT NULL THEN
    UPDATE "tag_kit_items" i
    SET "left_at" = COALESCE(s.moved_at, i.handed_out_at),
        "left_reason" = CASE
          WHEN s.movement_type = 'return' THEN 'returned'
          WHEN s.movement_type IS NULL AND s.rep_id IS NULL THEN 'returned'
          ELSE 'moved'
        END
    FROM (
      SELECT i2.kit_id, i2.public_code, t.rep_id, nextmove.created_at AS moved_at, nextmove.movement_type
      FROM "tag_kit_items" i2
      JOIN "tag_kits" k ON k.id = i2.kit_id
      JOIN "tags" t ON t.id = i2.tag_id
      LEFT JOIN LATERAL (
        SELECT m.created_at, m.movement_type
        FROM "tag_stock_movements" m
        WHERE m.tag_id = t.id AND m.movement_type IN ('return', 'transfer')
          AND m.created_at >= i2.handed_out_at - interval '1 minute'
          -- not the hand-over itself
          AND NOT (m.movement_type = 'transfer' AND m.reference_id = i2.kit_id::text AND m.to_custodian_rep_id IS NOT DISTINCT FROM k.rep_id)
        ORDER BY m.created_at
        LIMIT 1
      ) nextmove ON true
      WHERE i2.left_at IS NULL AND t.kit_id IS DISTINCT FROM i2.kit_id
    ) s
    WHERE i.kit_id = s.kit_id AND i.public_code = s.public_code;
  ELSE
    UPDATE "tag_kit_items" i
    SET "left_at" = i.handed_out_at, "left_reason" = CASE WHEN t.rep_id IS NULL THEN 'returned' ELSE 'moved' END
    FROM "tags" t
    WHERE t.id = i.tag_id AND i.left_at IS NULL AND t.kit_id IS DISTINCT FROM i.kit_id;
  END IF;
END $$;

-- Same default-deny as every other public table (0007): only the app's owner role reads it.
ALTER TABLE "tag_kit_items" ENABLE ROW LEVEL SECURITY;
