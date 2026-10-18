// Xpot Tags — the Overview "Needs action" queues. Each count on the Overview
// opens a list built from the same rule (server/tags/queues.ts turns the piece
// queues into SQL; GET /api/xpot/tags?queue=<name> lists them). Pure, no I/O.

/** Queues whose items are pieces, listed with `?queue=`. */
export const TAG_PIECE_QUEUES = [
  /** Set up for a customer (assigned or live) whose chip is not written and read back (verified or locked). */
  "chipPending",
  /** Not live, yet scanned by someone in the last TAG_QUEUE_SCAN_DAYS days (an `inventory_scan` event). */
  "scannedNotLive",
  /** No sales catalog product (own or the batch's), not retired: it cannot be sold. */
  "noProduct",
] as const;
export type TagPieceQueue = (typeof TAG_PIECE_QUEUES)[number];

/** Window of the "scanned but not live" queue. */
export const TAG_QUEUE_SCAN_DAYS = 7;

/** Chip states that count as written and checked. */
export const CHIP_DONE_STATUSES = ["verified", "locked"] as const;

export function isTagPieceQueue(value: string | null | undefined): value is TagPieceQueue {
  return !!value && (TAG_PIECE_QUEUES as readonly string[]).includes(value);
}

/** The Overview's queue counts. */
export interface TagQueueCounts {
  /** Stuscle orders paid and waiting for their pieces to be separated (pending acquisitions). */
  stuscleOrders: number;
  /** Batches (not cancelled) with codes issued for pieces not received yet. */
  batchesNotReceived: number;
  chipPending: number;
  scannedNotLive: number;
  noProduct: number;
}
