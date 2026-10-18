import type { TagAction } from "@shared/tags";
import type { TagDailyPoint, TagHistoryEntry, TagJourneyEntryItem, TagPieceSale, TagStockMovementItem } from "@shared/tagsApi";
import { CHIP_STATUS_TONE, PIECE_STATUS_TONE, STOCK_STATUS_TONE, toneOf, type PillTone } from "@/components/xpot/StatusPill";

// The one piece screen (components/piece), the pure part: what the header says
// about a piece, which sections a viewer gets, where each action goes, and the
// merged Activity timeline. The reseller screen (/tags/t/:code and the desktop
// pane) and the admin piece page (/admin/tags/pieces/:id) both build on it.

// ─── Header ───────────────────────────────────────────────────────────────────

/** The three things a piece's state is made of, each its own labelled chip. */
export type PieceDimension = "digital" | "stock" | "chip";

export interface PieceStatusChip {
  dimension: PieceDimension;
  /** tags.status, tags.stock_status or tags.nfc_provisioning_status, as stored. */
  value: string;
  tone: PillTone;
}

/**
 * Digital (the link: not set up … live, paused, retired), Physical stock (not received, in stock,
 * with the customer, damaged…) and Chip (not written … verified, locked). "Sold" is not one of
 * them: it is the financial sale, shown as its own pill (see pieceIsSold).
 */
export function pieceStatusChips(tag: { status: string; stockStatus: string; nfcStatus: string }): PieceStatusChip[] {
  return [
    { dimension: "digital", value: tag.status, tone: toneOf(PIECE_STATUS_TONE, tag.status) },
    // A piece that left with its customer reads in the neutral tone: the blue "Sold" pill says the rest.
    { dimension: "stock", value: tag.stockStatus, tone: tag.stockStatus === "sold" ? "slate" : toneOf(STOCK_STATUS_TONE, tag.stockStatus) },
    { dimension: "chip", value: tag.nfcStatus, tone: toneOf(CHIP_STATUS_TONE, tag.nfcStatus, "amber") },
  ];
}

/** Sold = a recorded financial sale (an active sales_sale_tags row), never going live. */
export function pieceIsSold(tag: { saleId: number | null }): boolean {
  return tag.saleId !== null;
}

/** The name a kit is known by on screen: its code (K-0001), else the start of its id; null outside a kit. */
export function kitShort(kitId: string | null | undefined, kitCode?: string | null): string | null {
  if (!kitId) return null;
  return kitCode || kitId.slice(0, 8);
}

export type PieceLocation =
  | { kind: "house" }
  | { kind: "reseller"; repId: number; name: string | null; kit: string | null };

/** Where the piece is: house stock, or with a reseller (in one of their kits, when it came in one). */
export function pieceLocation(tag: { repId: number | null; repName: string | null; kitId: string | null; kitCode?: string | null }): PieceLocation {
  if (tag.repId === null) return { kind: "house" };
  return { kind: "reseller", repId: tag.repId, name: tag.repName, kit: kitShort(tag.kitId, tag.kitCode) };
}

// ─── Who sees what ────────────────────────────────────────────────────────────

/** `field`: the reseller screen (/tags…); `admin`: the management piece page (/admin/tags/pieces/:id). */
export type PieceSurface = "field" | "admin";

export interface PieceViewer {
  surface: PieceSurface;
  /** A manager or admin with management mode on. */
  canManage: boolean;
  /** The global admin with management mode on (desktop NFC writer, Journey). */
  isAdmin: boolean;
  /** May open the Visits screens (the sale's page in Sales). */
  hasVisits: boolean;
}

export type PieceSection = "customer" | "chip" | "sale" | "performance" | "management" | "activity";

/**
 * The sections of the one piece screen, in reading order. Everyone gets the four working sections;
 * a manager also gets Management (custody, transfer, retire, QR files); the admin page adds the
 * merged Activity timeline.
 */
export function pieceSections(viewer: PieceViewer): PieceSection[] {
  const sections: PieceSection[] = ["customer", "chip", "sale", "performance"];
  if (viewer.canManage) sections.push("management");
  if (viewer.surface === "admin" && viewer.canManage) sections.push("activity");
  return sections;
}

/** "Open in management" on the reseller screen; "Open as reseller view" on the admin page (only when someone holds it). */
export function pieceCrossLink(viewer: PieceViewer, tag: { id: string; publicCode: string; repId: number | null }): { to: "admin" | "field"; href: string } | null {
  if (!viewer.canManage) return null;
  if (viewer.surface === "field") return { to: "admin", href: `/admin/tags/pieces/${encodeURIComponent(tag.id)}` };
  return tag.repId !== null ? { to: "field", href: `/tags/t/${encodeURIComponent(tag.publicCode)}` } : null;
}

export type PieceAction = Exclude<TagAction, "assign"> | "damage";

/**
 * Where each lifecycle action goes. Pause and Put live are the field API for everyone (managers may
 * act on any piece); Remove customer follows the surface (the admin one keeps a reason); retire,
 * restore and damage are management only.
 */
export function pieceActionUrl(surface: PieceSurface, action: PieceAction, id: string): string {
  if (action === "activate" || action === "disable") return `/api/xpot/tags/${id}/${action}`;
  if (action === "unassign" && surface === "field") return `/api/xpot/tags/${id}/unassign`;
  return `/api/xpot/admin/tags/${id}/${action}`;
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export type PieceTimelineEvent =
  | { kind: "destination"; id: string; at: string; entry: TagHistoryEntry }
  | { kind: "journey"; id: string; at: string; entry: TagJourneyEntryItem }
  | { kind: "sale"; id: string; at: string; sale: TagPieceSale }
  | { kind: "sale_cancelled"; id: string; at: string; sale: TagPieceSale }
  | { kind: "stock"; id: string; at: string; movement: TagStockMovementItem };

/** Journey actions another source already tells: the destination history, the stock movements. */
const JOURNEY_SAID_BY_HISTORY = new Set(["destination_changed"]);
const JOURNEY_SAID_BY_MOVEMENTS = new Set(["kit_delivered", "returned_to_house", "reseller_changed", "piece_scanned_into_batch"]);

/** Same instant: the sale before its stock effect before the rest, so a burst reads in one order. */
const KIND_ORDER: Record<PieceTimelineEvent["kind"], number> = { sale_cancelled: 0, sale: 1, stock: 2, destination: 3, journey: 4 };

/**
 * One timeline, newest first, from what the viewer may read: the destination history (everyone),
 * the sales (everyone), the stock movements (management; null when not loaded) and the Journey
 * (the global admin; null when not loaded). Each fact appears once: a journey entry that the history
 * or a stock movement already tells is dropped, and so is the stock side of a sale or of its cancel.
 */
export function mergePieceTimeline(input: {
  history: readonly TagHistoryEntry[];
  sales?: readonly TagPieceSale[] | null;
  movements?: readonly TagStockMovementItem[] | null;
  journey?: readonly TagJourneyEntryItem[] | null;
}): PieceTimelineEvent[] {
  const events: PieceTimelineEvent[] = [];
  for (const entry of input.history) events.push({ kind: "destination", id: `h-${entry.id}`, at: entry.createdAt, entry });
  for (const sale of input.sales ?? []) {
    events.push({ kind: "sale", id: `s-${sale.saleId}`, at: sale.soldAt, sale });
    if (sale.status === "cancelled") events.push({ kind: "sale_cancelled", id: `sc-${sale.saleId}`, at: sale.endedAt ?? sale.soldAt, sale });
  }
  const salesKnown = input.sales != null;
  for (const movement of input.movements ?? []) {
    if (salesKnown && movement.referenceType === "sale" && (movement.movementType === "sale" || movement.movementType === "restore")) continue;
    events.push({ kind: "stock", id: `m-${movement.id}`, at: movement.createdAt, movement });
  }
  const movementsKnown = input.movements != null;
  for (const entry of input.journey ?? []) {
    if (entry.action && JOURNEY_SAID_BY_HISTORY.has(entry.action)) continue;
    if (movementsKnown && entry.action && JOURNEY_SAID_BY_MOVEMENTS.has(entry.action)) continue;
    events.push({ kind: "journey", id: `j-${entry.id}`, at: entry.occurredAt, entry });
  }
  return events.sort((a, b) => {
    const diff = Date.parse(b.at) - Date.parse(a.at);
    if (diff) return diff;
    const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return kind || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

// ─── Performance ──────────────────────────────────────────────────────────────

/** Every UTC day from `from` to `to` (inclusive of both days), zeros where the analytics had no row. */
export function fillDailySeries(from: string, to: string, daily: readonly TagDailyPoint[]): TagDailyPoint[] {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [...daily];
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const out: TagDailyPoint[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  // An exclusive upper bound at midnight ends the range on the day before.
  const last = new Date(end.getTime() - (end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0 && end > start ? 1 : 0));
  for (let guard = 0; cursor <= last && guard < 400; guard++) {
    const day = cursor.toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, qr: 0, nfc: 0, approxUnique: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
