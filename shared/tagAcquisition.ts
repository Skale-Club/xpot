// Xpot Tags — which of the pieces chosen for a wholesale order belong to which order line. Pure, no I/O.
//
// The order is separated from the pieces the platform packs (POST …/tag-acquisitions/:id/fulfill) and the screen
// checks the same pieces first (POST …/tag-acquisitions/:id/check): both ask this function, so a piece the screen
// calls ready is a piece the server accepts, and a refusal happens before anything (a kit number included) is taken.

import type { DistributionCheck } from "./tagDistribution.js";

/** A line of the order: what was bought (a catalog product) and how many. */
export interface OrderLine {
  id: string;
  salesProductId: number | null;
  quantity: number;
}

/** A chosen piece: its code and the catalog product it belongs to (its own, or its batch's). */
export interface OrderPiece {
  code: string;
  productId: number | null;
}

/** Why a piece does not fit the order. */
export const ORDER_REFUSALS = [
  /** No line of the order is for this product. */
  "not_in_order",
  /** The order has this product, but earlier pieces already fill its lines. */
  "order_full",
] as const;
export type OrderRefusal = (typeof ORDER_REFUSALS)[number];

export interface OrderMatch {
  /** Each accepted code and the line it fills, in the order the pieces were chosen. */
  lineOf: Map<string, string>;
  refused: Map<string, OrderRefusal>;
  /** Per line: pieces placed so far (never above the line's quantity). */
  filled: Map<string, number>;
  /** True when every piece fits and every line is full. */
  complete: boolean;
}

/** The dry run of separating an order: Hand out's answer for each code, refused by name when it is not part of the order. */
export type AcquisitionCheck = DistributionCheck & {
  /** Per order line: how many of its quantity the readable pieces fill. */
  lines: Array<{ lineId: string; productName: string | null; quantity: number; filled: number }>;
};

/** Places the pieces on the order lines, in the order given; a piece goes to the first line of its product that is not full. */
export function matchOrderPieces(lines: readonly OrderLine[], pieces: readonly OrderPiece[]): OrderMatch {
  const filled = new Map(lines.map((line) => [line.id, 0]));
  const lineOf = new Map<string, string>();
  const refused = new Map<string, OrderRefusal>();
  for (const piece of pieces) {
    const sameProduct = lines.filter((line) => line.salesProductId === piece.productId);
    const open = sameProduct.find((line) => (filled.get(line.id) ?? 0) < line.quantity);
    if (open) {
      lineOf.set(piece.code, open.id);
      filled.set(open.id, (filled.get(open.id) ?? 0) + 1);
    } else {
      refused.set(piece.code, sameProduct.length ? "order_full" : "not_in_order");
    }
  }
  const complete = refused.size === 0 && lines.every((line) => filled.get(line.id) === line.quantity);
  return { lineOf, refused, filled, complete };
}
