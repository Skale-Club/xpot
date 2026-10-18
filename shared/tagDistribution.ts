// Xpot Tags — Distribution rules, per piece and per reseller. Pure, no I/O.
//
// Hand out and Take back check every code before anything moves: the server
// answers a dry run (POST /api/xpot/admin/tag-kits/check and
// /tag-kits/return/check) with one of these reasons per code, and the real
// action refuses the same pieces (server/tags/repository.ts deliverKit /
// returnToHouse). The screens word each reason (Distribution messages).

/** Why a code cannot go into a kit now. */
export const HAND_OUT_BLOCKERS = [
  /** No piece has this code. */
  "unknown",
  /** Typed twice in this list. */
  "duplicate",
  /** A recorded financial sale. */
  "sold",
  /** Already in a reseller's hands. */
  "with_reseller",
  /** Code issued, piece not received into stock yet. */
  "not_received",
  "damaged",
  /** Lost, internal use, retired or reserved: physically not on the shelf. */
  "not_in_stock",
  /** Set up for a customer (a customer or a destination): remove the customer first. */
  "set_up",
] as const;
export type HandOutBlocker = (typeof HAND_OUT_BLOCKERS)[number];

/** Why a code cannot come back to house stock now. */
export const TAKE_BACK_BLOCKERS = [
  "unknown",
  "duplicate",
  "sold",
  /** Already in house stock (no reseller holds it). */
  "not_with_reseller",
  /** Set up for a customer: remove the customer first. */
  "set_up",
  /** Damaged, lost, in internal use…: not available stock. */
  "not_in_stock",
] as const;
export type TakeBackBlocker = (typeof TAKE_BACK_BLOCKERS)[number];

/** What the rules need from a piece. `sold`: an active sales_sale_tags row. */
export interface DistributionPiece {
  status: string;
  stockStatus: string;
  repId: number | null;
  sold: boolean;
}

/** Null when the piece can go into a kit (shared/tagMetrics.ts `handOut`). */
export function handOutBlocker(piece: DistributionPiece): HandOutBlocker | null {
  if (piece.sold) return "sold";
  if (piece.repId !== null) return "with_reseller";
  if (piece.stockStatus === "pending") return "not_received";
  if (piece.stockStatus === "damaged") return "damaged";
  if (piece.stockStatus !== "available") return "not_in_stock";
  if (piece.status !== "inventory") return "set_up";
  return null;
}

/** Null when the piece can come back from its reseller (shared/tagMetrics.ts `returnable`). */
export function takeBackBlocker(piece: DistributionPiece): TakeBackBlocker | null {
  if (piece.sold) return "sold";
  if (piece.repId === null) return "not_with_reseller";
  if (piece.status !== "inventory") return "set_up";
  if (piece.stockStatus !== "available") return "not_in_stock";
  return null;
}

/** One code of a dry run. */
export interface DistributionCheckItem<R extends string = string> {
  code: string;
  ok: boolean;
  reason: R | null;
  /** The piece, when the code exists. */
  tagId: string | null;
  batchCode: string | null;
  serialNumber: number | null;
  productType: string | null;
  /** Who holds it now (null: house stock). */
  repId: number | null;
  repName: string | null;
  /** The kit it is in now, as K-0001. */
  kitCode: string | null;
}

export interface DistributionCheck<R extends string = string> {
  items: DistributionCheckItem<R>[];
  okCount: number;
}

/** Per-code answers in the order typed; a repeated code is `duplicate` after its first line. */
export function checkCodes<R extends string, P>(
  codes: readonly string[],
  found: ReadonlyMap<string, P>,
  blocker: (piece: P) => R | null,
  describe: (code: string, piece: P | undefined) => Omit<DistributionCheckItem<R>, "code" | "ok" | "reason">,
): DistributionCheck<R | "unknown" | "duplicate"> {
  const seen = new Set<string>();
  const items = codes.map((code) => {
    const piece = found.get(code);
    let reason: R | "unknown" | "duplicate" | null;
    if (seen.has(code)) reason = "duplicate";
    else if (!piece) reason = "unknown";
    else reason = blocker(piece);
    seen.add(code);
    return { code, ok: reason === null, reason, ...describe(code, piece) };
  });
  return { items, okCount: items.filter((i) => i.ok).length };
}

// ─── Resellers ────────────────────────────────────────────────────────────────

/** What a reseller row needs (GET /api/xpot/admin/reps). */
export interface ResellerReadiness {
  role: string;
  isActive: boolean;
  modules: string[] | null;
  blockedAt?: string | Date | null;
  wholesaleCode?: string | null;
  costPolicyConfiguredAt?: string | Date | null;
}

/** Can this person see Tags in the field app? Managers/admins always can. */
export function resellerHasTags(rep: Pick<ResellerReadiness, "role" | "modules">): boolean {
  return rep.role === "manager" || rep.role === "admin" || !rep.modules || rep.modules.includes("tags");
}

/** Why a reseller cannot receive a kit now (Hand out step 1); empty when they can. */
export const RECEIVE_BLOCKERS = ["blocked", "inactive", "tags_off"] as const;
export type ReceiveBlocker = (typeof RECEIVE_BLOCKERS)[number];

export function receiveBlockers(rep: ResellerReadiness): ReceiveBlocker[] {
  const out: ReceiveBlocker[] = [];
  if (rep.blockedAt) out.push("blocked");
  else if (!rep.isActive) out.push("inactive");
  if (!resellerHasTags(rep)) out.push("tags_off");
  return out;
}

/** Why a reseller cannot sell pieces (Resellers badges); managers and admins sell without these. */
export const SELL_BLOCKERS = ["blocked", "tags_off", "cost_rule", "wholesale_code"] as const;
export type SellBlocker = (typeof SELL_BLOCKERS)[number];

export function sellBlockers(rep: ResellerReadiness): SellBlocker[] {
  const out: SellBlocker[] = [];
  if (rep.blockedAt) out.push("blocked");
  if (!resellerHasTags(rep)) out.push("tags_off");
  if (rep.role === "rep") {
    if (!rep.costPolicyConfiguredAt) out.push("cost_rule");
    if (!rep.wholesaleCode) out.push("wholesale_code");
  }
  return out;
}
