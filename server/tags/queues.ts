import { sql, type SQL } from "drizzle-orm";
import { CHIP_DONE_STATUSES, TAG_QUEUE_SCAN_DAYS, type TagPieceQueue } from "#shared/tagQueues.js";

// The Overview's piece queues (shared/tagQueues.ts) as SQL conditions on a
// `tags` row, so the count on the card and the list it opens are one rule.
// `alias` is the tags table alias in the query.

export function pieceQueueSql(queue: TagPieceQueue, now: Date = new Date(), alias = "t"): SQL {
  const t = sql.raw(alias);
  const done = sql.join(CHIP_DONE_STATUSES.map((s) => sql`${s}`), sql`, `);
  switch (queue) {
    case "chipPending":
      return sql`(${t}.status IN ('assigned', 'active') AND ${t}.nfc_provisioning_status NOT IN (${done}))`;
    case "scannedNotLive": {
      const since = new Date(now.getTime() - TAG_QUEUE_SCAN_DAYS * 86_400_000);
      return sql`(${t}.status <> 'active' AND EXISTS (
        SELECT 1 FROM tag_events queue_event
        WHERE queue_event.tag_id = ${t}.id AND queue_event.event_type = 'inventory_scan'
          AND NOT queue_event.is_bot AND queue_event.occurred_at >= ${since}
      ))`;
    }
    case "noProduct":
      return sql`(${t}.status <> 'retired' AND ${t}.sales_product_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM tag_batches queue_batch WHERE queue_batch.id = ${t}.batch_id AND queue_batch.sales_product_id IS NOT NULL
      ))`;
  }
}

/** `count(*) FILTER (WHERE <queue>)::int`, for aggregate queries over `tags <alias>`. */
export function countQueueSql(queue: TagPieceQueue, now: Date = new Date(), alias = "t"): SQL {
  return sql`count(${sql.raw(alias)}.id) FILTER (WHERE ${pieceQueueSql(queue, now, alias)})::int`;
}
