import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { leadCustomerContacts, salesLeads, tags } from "#shared/schema.js";
import { normalizePhone } from "#shared/phone.js";
import { resolveTagFace } from "#shared/tagFace.js";
import type { CustomerPiece, CustomerPieceDetail, CustomerPiecesResponse, CustomerSellerContact } from "#shared/customerPanel.js";
import { COUNTABLE, getAnalytics, iso, rows } from "../tags/repository.js";

// What the customer panel reads. Every query starts from the lead ids of the customer's session and never from
// anything the request says, and every number comes from the events recorded while the piece was that lead's
// (tag_events.lead_id), so a piece that changed hands never carries its old numbers to the new owner.
// Never selected here: cost, stock, rep ids, the organization, other leads.

const DAY_MS = 86_400_000;

/** The piece behind a printed code, with what the sign-in needs to know about its lead. */
export async function pieceForSignIn(code: string): Promise<{ status: string; leadId: number | null } | null> {
  const [piece] = await db.select({ status: tags.status, leadId: tags.leadId }).from(tags).where(eq(tags.publicCode, code)).limit(1);
  return piece ?? null;
}

/** A lead's own phone (normalized) and the phones a seller allowed. */
export async function leadAccessData(leadId: number): Promise<{ businessPhone: string | null; contactPhones: string[]; exists: boolean }> {
  const [lead] = await db.select({ phone: salesLeads.phone }).from(salesLeads).where(eq(salesLeads.id, leadId)).limit(1);
  const contacts = await db.select({ phone: leadCustomerContacts.phone }).from(leadCustomerContacts).where(eq(leadCustomerContacts.leadId, leadId));
  return { exists: Boolean(lead), businessPhone: normalizePhone(lead?.phone), contactPhones: contacts.map((c) => c.phone) };
}

/** The leads a phone may see: the businesses that list it as a contact (the lead must still exist). */
export async function leadIdsOfPhone(phone: string, among?: readonly number[]): Promise<number[]> {
  if (among && !among.length) return [];
  const found = await db
    .select({ leadId: leadCustomerContacts.leadId })
    .from(leadCustomerContacts)
    .innerJoin(salesLeads, eq(salesLeads.id, leadCustomerContacts.leadId))
    .where(and(eq(leadCustomerContacts.phone, phone), among ? inArray(leadCustomerContacts.leadId, [...among]) : undefined));
  return found.map((r) => r.leadId).sort((a, b) => a - b);
}

/**
 * Records a successful sign-in: stamps the phone's contacts as verified, and files the business whose own phone it
 * is (what the piece code pointed at) as a contact, so the seller sees it and so later sessions need nothing else.
 */
export async function recordSignIn(phone: string, businessLeadId: number | null): Promise<void> {
  const now = new Date();
  if (businessLeadId !== null) {
    await db.insert(leadCustomerContacts).values({ leadId: businessLeadId, phone }).onConflictDoNothing();
  }
  await db.update(leadCustomerContacts).set({ verifiedAt: now }).where(and(eq(leadCustomerContacts.phone, phone), sql`${leadCustomerContacts.verifiedAt} IS NULL`));
}

interface PieceRow {
  tag_id: string;
  lead_id: number;
  public_code: string;
  label: string | null;
  face: string | null;
  batch_face: string | null;
  product_type: string;
  status: string;
  destination_url: string | null;
  business_name: string;
  scans7: number;
  scans30: number;
  last_at: Date | null;
}

const toPiece = (r: PieceRow): CustomerPiece => ({
  code: r.public_code,
  label: r.label?.trim() || null,
  face: resolveTagFace({ face: r.face, batchFace: r.batch_face, productType: r.product_type }),
  productType: r.product_type,
  status: r.status,
  destinationUrl: r.destination_url,
  businessName: r.business_name,
  scans7: Number(r.scans7),
  scans30: Number(r.scans30),
  lastScanAt: iso(r.last_at),
});

// Pieces that never reached the business (inventory) or were thrown away (retired) are not "theirs" to read.
const VISIBLE = sql`t.status IN ('assigned', 'active', 'disabled')`;

function leadList(leadIds: readonly number[]) {
  return sql.join(leadIds.map((id) => sql`${id}`), sql`, `);
}

async function pieceRows(leadIds: readonly number[], code: string | null, now: Date): Promise<PieceRow[]> {
  if (!leadIds.length) return [];
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  return rows<PieceRow>(sql`
    SELECT t.id AS tag_id, t.lead_id, t.public_code, t.label, t.face, b.face AS batch_face, t.product_type, t.status, t.destination_url,
      l.name AS business_name,
      count(e.id) FILTER (WHERE e.occurred_at >= ${since7})::int AS scans7,
      count(e.id)::int AS scans30,
      max(e.occurred_at) AS last_at
    FROM tags t
    JOIN sales_leads l ON l.id = t.lead_id
    LEFT JOIN tag_batches b ON b.id = t.batch_id
    LEFT JOIN tag_events e ON e.tag_id = t.id AND e.lead_id = t.lead_id AND e.occurred_at >= ${since30} AND e.occurred_at <= ${now} AND ${COUNTABLE}
    WHERE t.lead_id IN (${leadList(leadIds)}) AND ${VISIBLE} ${code ? sql`AND t.public_code = ${code}` : sql``}
    GROUP BY t.id, b.face, l.name
    ORDER BY l.name, t.created_at, t.public_code
  `);
}

export async function listCustomerPieces(leadIds: readonly number[], now = new Date()): Promise<CustomerPiecesResponse> {
  const pieces = (await pieceRows(leadIds, null, now)).map(toPiece);
  return {
    pieces,
    totals: {
      pieces: pieces.length,
      live: pieces.filter((p) => p.status === "active").length,
      scans7: pieces.reduce((sum, p) => sum + p.scans7, 0),
      scans30: pieces.reduce((sum, p) => sum + p.scans30, 0),
    },
  };
}

/** One piece with its daily scans, only when it belongs to one of the session's leads. */
export async function getCustomerPiece(leadIds: readonly number[], code: string, now = new Date()): Promise<CustomerPieceDetail | null> {
  const [row] = await pieceRows(leadIds, code, now);
  if (!row) return null;
  // The existing analytics, narrowed to this piece and to the events while it was this business's.
  const from = new Date(now.getTime() - 30 * DAY_MS);
  const analytics = await getAnalytics({ tagId: row.tag_id, leadId: row.lead_id }, from, now);
  return {
    ...toPiece(row),
    qr30: analytics.totals.qr,
    nfc30: analytics.totals.nfc,
    daily: analytics.daily.map((d) => ({ day: d.day, qr: d.qr, nfc: d.nfc })),
  };
}

/**
 * The person to talk to, per business: the rep holding most of its pieces, else the business's owner. Blocked, deleted
 * or switched-off reps are skipped; their phone falls back to the one on their login.
 */
export async function sellersOf(leadIds: readonly number[]): Promise<CustomerSellerContact[]> {
  if (!leadIds.length) return [];
  const found = await rows<{ lead_id: number; business_name: string; rep_name: string; rep_phone: string | null; user_phone: string | null }>(sql`
    SELECT l.id AS lead_id, l.name AS business_name, r.display_name AS rep_name, r.phone AS rep_phone, u.phone AS user_phone
    FROM sales_leads l
    JOIN sales_reps r ON r.id = COALESCE(
      (SELECT t.rep_id FROM tags t
        JOIN sales_reps tr ON tr.id = t.rep_id AND tr.is_active AND tr.blocked_at IS NULL AND tr.deleted_at IS NULL
        WHERE t.lead_id = l.id AND ${VISIBLE}
        GROUP BY t.rep_id ORDER BY count(*) DESC, t.rep_id LIMIT 1),
      l.owner_rep_id) AND r.is_active AND r.blocked_at IS NULL AND r.deleted_at IS NULL
    JOIN users u ON u.id = r.user_id
    WHERE l.id IN (${leadList(leadIds)})
    ORDER BY l.name
  `);
  const out: CustomerSellerContact[] = [];
  for (const row of found) {
    const phone = normalizePhone(row.rep_phone) ?? normalizePhone(row.user_phone);
    if (phone) out.push({ businessName: row.business_name, name: row.rep_name, phone });
  }
  return out;
}

// ─── The seller's list ────────────────────────────────────────────────────────

export async function listContacts(leadId: number) {
  return db
    .select({ phone: leadCustomerContacts.phone, verifiedAt: leadCustomerContacts.verifiedAt, createdAt: leadCustomerContacts.createdAt })
    .from(leadCustomerContacts)
    .where(eq(leadCustomerContacts.leadId, leadId))
    .orderBy(leadCustomerContacts.createdAt);
}

export async function addContact(leadId: number, phone: string, userId: string): Promise<void> {
  await db.insert(leadCustomerContacts).values({ leadId, phone, createdByUserId: userId }).onConflictDoNothing();
}

export async function removeContact(leadId: number, phone: string): Promise<boolean> {
  const removed = await db
    .delete(leadCustomerContacts)
    .where(and(eq(leadCustomerContacts.leadId, leadId), eq(leadCustomerContacts.phone, phone)))
    .returning({ phone: leadCustomerContacts.phone });
  return removed.length > 0;
}

