import { sql } from "drizzle-orm";
import type { TagPieceActivity, TagPieceSale, TagStockMovementItem } from "#shared/tagsApi.js";
import { rows } from "./repository.js";

// What happened to one piece beyond its destination history (TagDetail.history):
// every financial sale it was part of, active or cancelled, and, for the
// management side, its stock movements (hand-outs, transfers, returns, the sale
// itself). The piece screen merges these into one timeline (components/piece).

type SaleRow = {
  sale_id: number;
  status: string;
  sold_at: Date;
  ended_at: Date | null;
  price_cents: number | null;
  currency: string;
  seller_rep_id: number;
  seller_name: string | null;
  payment_status: string;
  cancel_reason: string | null;
};

type MovementRow = {
  id: string;
  movement_type: string;
  from_stock_status: string | null;
  to_stock_status: string;
  from_ownership_type: string | null;
  to_ownership_type: string;
  from_custodian_name: string | null;
  to_custodian_name: string | null;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  actor_email: string | null;
  created_at: Date;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

/** A piece's sales (newest first) and, with `withMovements`, its stock movements (newest first, the last 200). */
export async function getPieceActivity(tagId: string, { withMovements }: { withMovements: boolean }): Promise<TagPieceActivity> {
  const saleRows = await rows<SaleRow>(sql`
    SELECT st.sale_id, st.status, st.sold_at, st.ended_at, si.net_total_cents AS price_cents, s.currency,
           s.rep_id AS seller_rep_id, r.display_name AS seller_name, s.payment_status, s.cancel_reason
    FROM sales_sale_tags st
    JOIN sales_sales s ON s.id = st.sale_id
    LEFT JOIN sales_sale_items si ON si.id = st.sale_item_id
    LEFT JOIN sales_reps r ON r.id = s.rep_id
    WHERE st.tag_id = ${tagId}
    ORDER BY st.sold_at DESC, st.sale_id DESC
  `);
  const sales: TagPieceSale[] = saleRows.map((r) => ({
    saleId: Number(r.sale_id),
    status: r.status === "active" ? "active" : "cancelled",
    soldAt: iso(r.sold_at)!,
    endedAt: iso(r.ended_at),
    priceCents: r.price_cents === null ? null : Number(r.price_cents),
    currency: r.currency,
    sellerRepId: Number(r.seller_rep_id),
    sellerName: r.seller_name,
    paymentStatus: r.payment_status,
    cancelReason: r.cancel_reason,
  }));

  if (!withMovements) return { sales, movements: null };

  const movementRows = await rows<MovementRow>(sql`
    SELECT m.id, m.movement_type, m.from_stock_status, m.to_stock_status, m.from_ownership_type, m.to_ownership_type,
           fr.display_name AS from_custodian_name, tr.display_name AS to_custodian_name,
           m.reference_type, m.reference_id, m.reason, u.email AS actor_email, m.created_at
    FROM tag_stock_movements m
    LEFT JOIN sales_reps fr ON fr.id = m.from_custodian_rep_id
    LEFT JOIN sales_reps tr ON tr.id = m.to_custodian_rep_id
    LEFT JOIN users u ON u.id = m.actor_user_id
    WHERE m.tag_id = ${tagId}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 200
  `);
  const movements: TagStockMovementItem[] = movementRows.map((r) => ({
    id: r.id,
    movementType: r.movement_type,
    fromStockStatus: r.from_stock_status,
    toStockStatus: r.to_stock_status,
    fromOwnershipType: r.from_ownership_type,
    toOwnershipType: r.to_ownership_type,
    fromCustodianName: r.from_custodian_name,
    toCustodianName: r.to_custodian_name,
    referenceType: r.reference_type,
    referenceId: r.reference_id,
    reason: r.reason,
    actorEmail: r.actor_email,
    createdAt: iso(r.created_at)!,
  }));
  return { sales, movements };
}
