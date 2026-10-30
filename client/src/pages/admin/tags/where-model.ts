// Inventory's one "Where is it" answer. A piece has a digital status (shared/tags.ts TAG_STATUSES) and a separate physical
// stock status plus who holds it; owners only ever ask "where is it, is it live?", so the filter, the stock chips and the
// table pill all speak these buckets, which are the shared stock numbers (shared/tagMetrics.ts) wherever one exists, so
// the chip, the list and Overview count the same pieces. Pure, unit-tested (tests/admin-pieces-where.test.ts).

import { TAG_STATUSES, TAG_STOCK_STATUSES, type TagStatus, type TagStockStatus } from "@shared/tags";
import { matchesStockMetric, type StockMetricPiece, type TagStockMetric } from "@shared/tagMetrics";

/** The filter's options, in the order the select and the chips list them. */
export const WHERE_OPTIONS = ["house", "withResellers", "sold", "live", "notReceived", "damaged", "lost", "disabled", "retired"] as const;
export type Where = (typeof WHERE_OPTIONS)[number];

/** The options that are a shared stock number the overview endpoint totals: they get a chip with the real count. */
export const WHERE_CHIPS = ["house", "withResellers", "sold", "live", "notReceived"] as const satisfies readonly Where[];
export type WhereChip = (typeof WHERE_CHIPS)[number];

/** The list endpoint's (GET /api/xpot/tags, listQuerySchema) filter params a bucket turns into. */
export interface WhereQuery {
  metric?: TagStockMetric;
  status?: TagStatus;
  stockStatus?: TagStockStatus;
}

const WHERE_QUERY: Record<Where, WhereQuery> = {
  house: { metric: "house" },
  withResellers: { metric: "withResellers" },
  sold: { metric: "sold" },
  live: { metric: "live" },
  notReceived: { metric: "notReceived" },
  damaged: { metric: "damaged" },
  // No shared stock number for these: the plain status / stock status.
  lost: { stockStatus: "lost" },
  disabled: { status: "disabled" },
  retired: { status: "retired" },
};

export const isWhere = (v: string): v is Where => (WHERE_OPTIONS as readonly string[]).includes(v);

/** Old URLs: `?stock=` (house|reps|sold|<stock status>) and `?status=` (<status>) said the same thing as one bucket. */
const LEGACY_STOCK: Record<string, Where> = { house: "house", reps: "withResellers", sold: "sold", pending: "notReceived", damaged: "damaged", lost: "lost" };
const LEGACY_STATUS: Record<string, Where> = { active: "live", disabled: "disabled", retired: "retired" };

export interface WhereParams {
  where: string;
  /** Legacy ?status= */
  status: string;
  /** Legacy ?stock= */
  stock: string;
}

/**
 * The list query for the URL's filter. `where` wins; without it the legacy `status` / `stock` still filter exactly as
 * they did (both together narrow together), so links from Overview, the Team tab and bookmarks keep working.
 */
export function whereQuery({ where, status, stock }: WhereParams): WhereQuery {
  if (where) return isWhere(where) ? WHERE_QUERY[where] : {};
  const metric = { house: "house", reps: "withResellers", sold: "sold" }[stock] as TagStockMetric | undefined;
  return {
    status: (TAG_STATUSES as readonly string[]).includes(status) ? (status as TagStatus) : undefined,
    metric,
    stockStatus: !metric && (TAG_STOCK_STATUSES as readonly string[]).includes(stock) ? (stock as TagStockStatus) : undefined,
  };
}

/**
 * What the "Where is it" select shows for the URL: the bucket, or for a lone legacy value that has none (e.g.
 * `?status=assigned`) `status:assigned` / `stock:available`, so the filter in force is never hidden. "" when no
 * single value stands for it (nothing set, or both legacy params).
 */
export function whereSelection({ where, status, stock }: WhereParams): string {
  if (where) return isWhere(where) ? where : "";
  if (status && stock) return "";
  if (status) return LEGACY_STATUS[status] ?? ((TAG_STATUSES as readonly string[]).includes(status) ? `status:${status}` : "");
  if (stock) return LEGACY_STOCK[stock] ?? ((TAG_STOCK_STATUSES as readonly string[]).includes(stock) ? `stock:${stock}` : "");
  return "";
}

/** Where a piece is: its place, and whether its link is live (QR and NFC redirect). */
export type PlaceId = "house" | "withResellers" | "sold" | "notReceived" | "damaged" | "lost" | "disabled" | "retired" | "reserved" | "internalUse";
export interface PieceWhere {
  place: PlaceId;
  live: boolean;
}

/**
 * One answer for a piece. Problems and ends of life first (a retired or lost piece is not "in stock"), then a sale,
 * then who holds it; `live` rides along so a set-up piece reads "In house stock · Live", never two pills.
 */
export function pieceWhere(piece: StockMetricPiece): PieceWhere {
  const live = matchesStockMetric(piece, "live");
  const place = ((): PlaceId => {
    if (piece.status === "retired" || piece.stockStatus === "retired") return "retired";
    if (piece.status === "disabled") return "disabled";
    if (piece.stockStatus === "lost") return "lost";
    if (matchesStockMetric(piece, "damaged")) return "damaged";
    if (matchesStockMetric(piece, "notReceived")) return "notReceived";
    if (matchesStockMetric(piece, "sold") || piece.stockStatus === "sold") return "sold";
    if (matchesStockMetric(piece, "withResellers")) return "withResellers";
    if (piece.stockStatus === "reserved") return "reserved";
    if (piece.stockStatus === "internal_use") return "internalUse";
    return "house";
  })();
  return { place, live };
}
