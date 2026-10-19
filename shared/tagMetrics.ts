// Xpot Tags — one definition per stock number. Every screen that counts
// pieces (Overview, Kits, Batches, a batch's stats and chips, the Team report,
// a kit row) uses these rules: the server turns them into SQL
// (server/tags/metrics.ts) and the app applies them to loaded pieces, so the
// same stock reads the same everywhere. Pure, no I/O.
//
// "Sold" is only ever a recorded financial sale (an active sales_sale_tags
// row): activating a piece is not a sale (docs/TAG_SALES_EXECUTION_PLAN.md §2.2).

import type { TagStatus, TagStockStatus } from "./tags.js";

export interface StockMetricRule {
  /** `house`: no rep holds it; `rep`: a rep holds it. Omitted: either. */
  holder?: "house" | "rep";
  /** Physical stock status (tags.stock_status). */
  stockStatus?: TagStockStatus;
  /** Digital status (tags.status). */
  status?: TagStatus;
  /** The digital status is not `retired`. */
  notRetired?: boolean;
  /** Has an active financial sale (true) or none (false). */
  sold?: boolean;
}

export const TAG_STOCK_METRICS = {
  /** Company (house) stock: physically in stock, no rep, not retired, unsold. Set-up or live pieces count too. */
  house: { holder: "house", stockStatus: "available", notRetired: true, sold: false },
  /** In reps' hands and unsold: physically in stock with a rep, not retired, no financial sale. */
  withResellers: { holder: "rep", stockStatus: "available", notRetired: true, sold: false },
  /** A recorded financial sale. */
  sold: { sold: true },
  /** Live: QR and NFC redirect. */
  live: { status: "active" },
  /** A code issued for a piece not received yet. */
  notReceived: { stockStatus: "pending" },
  damaged: { stockStatus: "damaged" },
  /** House stock that can go into a kit now: in stock, no rep, not set up for a customer, unsold. */
  handOut: { holder: "house", stockStatus: "available", status: "inventory", sold: false },
  /** With a rep and returnable to house stock now: in stock, not set up for a customer, unsold. */
  returnable: { holder: "rep", stockStatus: "available", status: "inventory", sold: false },
} as const satisfies Record<string, StockMetricRule>;

export type TagStockMetric = keyof typeof TAG_STOCK_METRICS;
export const TAG_STOCK_METRIC_NAMES = Object.keys(TAG_STOCK_METRICS) as [TagStockMetric, ...TagStockMetric[]];

/** What a rule needs from a piece. `saleId` is the active financial sale (TagListItem.saleId). */
export interface StockMetricPiece {
  repId: number | null;
  status: string;
  stockStatus: string;
  saleId: number | null;
}

export function matchesStockRule(piece: StockMetricPiece, rule: StockMetricRule): boolean {
  if (rule.holder === "house" && piece.repId !== null) return false;
  if (rule.holder === "rep" && piece.repId === null) return false;
  if (rule.stockStatus && piece.stockStatus !== rule.stockStatus) return false;
  if (rule.status && piece.status !== rule.status) return false;
  if (rule.notRetired && piece.status === "retired") return false;
  if (rule.sold !== undefined && (piece.saleId !== null) !== rule.sold) return false;
  return true;
}

export function matchesStockMetric(piece: StockMetricPiece, metric: TagStockMetric): boolean {
  return matchesStockRule(piece, TAG_STOCK_METRICS[metric]);
}

export function countStockMetric(pieces: readonly StockMetricPiece[], metric: TagStockMetric): number {
  let n = 0;
  for (const piece of pieces) if (matchesStockMetric(piece, metric)) n++;
  return n;
}
