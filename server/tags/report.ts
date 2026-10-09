import { sql } from "drizzle-orm";
import type { TagRepReportRow, TagTeamReport } from "#shared/tagsApi.js";
import { resolveTagFace } from "#shared/tagFace.js";
import { COUNTABLE, iso, rows } from "./repository.js";

/**
 * Admin report for [from, to): one row per reseller who ever held, sold or
 * activated a piece (plus every active rep with a kit), and one for pieces
 * with no reseller. "Sold" = pieces whose sale counted inside the window;
 * scans count against the reseller who held the piece when it was scanned.
 */
export async function getTeamReport(from: Date, to: Date): Promise<TagTeamReport> {
  const [sales, activations, scans, people, topTags] = await Promise.all([
    rows<{ rep_id: number | null; sold: number; in_stock: number; active_now: number; total: number; customers: number; last_sale_at: Date | null }>(sql`
      SELECT t.rep_id,
        count(*) FILTER (WHERE sold.sold_at >= ${from} AND sold.sold_at < ${to})::int AS sold,
        count(*) FILTER (WHERE t.status <> 'retired' AND sold.sold_at IS NULL)::int AS in_stock,
        count(*) FILTER (WHERE t.status = 'active')::int AS active_now,
        count(*) FILTER (WHERE sold.sold_at IS NOT NULL)::int AS total,
        count(DISTINCT t.lead_id) FILTER (WHERE sold.sold_at IS NOT NULL)::int AS customers,
        max(sold.sold_at) AS last_sale_at
      FROM tags t
      LEFT JOIN LATERAL (
        SELECT st.sold_at FROM sales_sale_tags st
        WHERE st.tag_id = t.id AND st.status = 'active'
        ORDER BY st.sold_at DESC LIMIT 1
      ) sold ON true
      GROUP BY t.rep_id
    `),
    rows<{ rep_id: number; activations: number }>(sql`
      SELECT t.activated_by_rep_id AS rep_id, count(*)::int AS activations
      FROM tags t
      WHERE t.activated_by_rep_id IS NOT NULL AND t.activated_at >= ${from} AND t.activated_at < ${to}
      GROUP BY t.activated_by_rep_id
    `),
    rows<{ rep_id: number | null; qr: number; nfc: number; approx_unique: number }>(sql`
      SELECT e.rep_id,
        count(*) FILTER (WHERE e.access_method = 'qr')::int AS qr,
        count(*) FILTER (WHERE e.access_method = 'nfc')::int AS nfc,
        count(DISTINCT (e.tag_id, e.visitor_day_key))::int AS approx_unique
      FROM tag_events e
      WHERE e.occurred_at >= ${from} AND e.occurred_at < ${to} AND ${COUNTABLE}
      GROUP BY e.rep_id
    `),
    rows<{ id: number; display_name: string; email: string | null; role: string; is_active: boolean }>(sql`
      SELECT r.id, r.display_name, r.email, r.role::text AS role, r.is_active
      FROM sales_reps r
      WHERE r.id IN (SELECT rep_id FROM tags WHERE rep_id IS NOT NULL)
         OR r.id IN (SELECT activated_by_rep_id FROM tags WHERE activated_by_rep_id IS NOT NULL)
         OR r.id IN (SELECT rep_id FROM tag_kits)
    `),
    rows<{ id: string; public_code: string; label: string | null; product_type: string; face: string | null; batch_face: string | null; lead_name: string | null; rep_name: string | null; qr: number; nfc: number }>(sql`
      SELECT t.id, t.public_code, t.label, t.product_type, t.face, b.face AS batch_face, l.name AS lead_name, r.display_name AS rep_name,
             count(*) FILTER (WHERE e.access_method = 'qr')::int AS qr,
             count(*) FILTER (WHERE e.access_method = 'nfc')::int AS nfc
      FROM tag_events e
      JOIN tags t ON t.id = e.tag_id
      LEFT JOIN sales_leads l ON l.id = t.lead_id
      LEFT JOIN sales_reps r ON r.id = t.rep_id
      LEFT JOIN tag_batches b ON b.id = t.batch_id
      WHERE e.occurred_at >= ${from} AND e.occurred_at < ${to} AND ${COUNTABLE}
      GROUP BY t.id, b.face, l.name, r.display_name
      ORDER BY count(*) DESC
      LIMIT 10
    `),
  ]);

  const key = (id: number | null) => (id === null ? "house" : String(id));
  const salesBy = new Map(sales.map((r) => [key(r.rep_id), r]));
  const scansBy = new Map(scans.map((r) => [key(r.rep_id), r]));
  const activationsBy = new Map(activations.map((r) => [r.rep_id, r.activations]));

  const toRow = (repId: number | null, person?: (typeof people)[number]): TagRepReportRow => {
    const s = salesBy.get(key(repId));
    const e = scansBy.get(key(repId));
    return {
      repId,
      name: person?.display_name ?? null,
      email: person?.email ?? null,
      role: person?.role ?? null,
      isActive: !!person?.is_active,
      soldInRange: Number(s?.sold ?? 0),
      activationsInRange: repId !== null ? Number(activationsBy.get(repId) ?? 0) : 0,
      inStock: Number(s?.in_stock ?? 0),
      activeTags: Number(s?.active_now ?? 0),
      totalSold: Number(s?.total ?? 0),
      customers: Number(s?.customers ?? 0),
      qr: Number(e?.qr ?? 0),
      nfc: Number(e?.nfc ?? 0),
      approxUnique: Number(e?.approx_unique ?? 0),
      lastSaleAt: iso(s?.last_sale_at),
    };
  };

  const reps = people
    .map((p) => toRow(p.id, p))
    .sort((a, b) => b.soldInRange - a.soldInRange || b.qr + b.nfc - (a.qr + a.nfc) || (a.name ?? "").localeCompare(b.name ?? ""));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    reps,
    unassigned: toRow(null),
    topTags: topTags.map((t) => ({
      id: t.id,
      publicCode: t.public_code,
      label: t.label,
      productType: t.product_type,
      face: resolveTagFace({ face: t.face, batchFace: t.batch_face, productType: t.product_type }),
      leadName: t.lead_name,
      repName: t.rep_name,
      qr: Number(t.qr),
      nfc: Number(t.nfc),
    })),
  };
}
