// Who holds a physical piece, from the phone: who may open it, who may
// receive it into stock and who may hand it back to the house. Pure rules
// shared by the server (enforcement) and the app (what to offer).
// See docs/TAG_CUSTODY_EXECUTION_PLAN.md.
//
// Testing a chip (write, verify, lock, erase, tap) never moves stock: none of
// these rules looks at the chip, and none of the chip operations calls them.

import { canWorkOnTag, type TagActor } from "./tagAccess.js";
import { takeBackBlocker, type DistributionPiece, type TakeBackBlocker } from "./tagDistribution.js";

/**
 * How much of a piece the actor may see:
 *   full     their own piece, or any piece for a manager (canWorkOnTag): the whole piece screen;
 *   limited  a piece of one of their Organizations held by someone else, by the house, or not
 *            received yet: what it is, where it is, and what they may do about it (receive it);
 *   none     anything else.
 */
export type PieceAccess = "full" | "limited" | "none";

export function pieceAccess(actor: TagActor, tag: { repId: number | null; organizationId?: number | null }): PieceAccess {
  if (canWorkOnTag(actor, tag)) return "full";
  if (tag.organizationId && actor.organizationIds?.includes(tag.organizationId)) return "limited";
  return "none";
}

/** Where a piece received from the phone goes: the house's stock, or the actor's own. */
export const RECEIVE_TARGETS = ["house", "me"] as const;
export type ReceiveTarget = (typeof RECEIVE_TARGETS)[number];

/**
 * The places this actor may receive into, the default first. A manager in management mode
 * receives for the house by default and may keep the piece; anyone else receives into their
 * own stock (a manager viewing as a rep too, as they would activate it: activationCredit).
 */
export function receiveTargets(actor: Pick<TagActor, "isManager" | "inManagement">): ReceiveTarget[] {
  return actor.isManager && actor.inManagement ? ["house", "me"] : ["me"];
}

export const RECEIVE_BLOCKERS = ["not_pending", "no_batch", "batch_closed", "other_organization"] as const;
export type ReceiveBlocker = (typeof RECEIVE_BLOCKERS)[number];

/**
 * Why the actor can't receive this piece right now; null when they can. Same proof and rules as
 * the intake station (scanTagIntoBatch): only a piece not received yet, issued to a batch that is
 * still open. A reseller receives only pieces of an Organization they belong to.
 */
export function receiveBlocker(
  actor: TagActor,
  piece: { stockStatus: string; batchId: string | null; organizationId?: number | null },
  batchStatus: string | null,
): ReceiveBlocker | null {
  if (piece.stockStatus !== "pending") return "not_pending";
  if (!piece.batchId) return "no_batch";
  if (batchStatus !== "open") return "batch_closed";
  if (!actor.isManager && !(piece.organizationId && actor.organizationIds?.includes(piece.organizationId))) {
    return "other_organization";
  }
  return null;
}

/**
 * Why the piece can't go back to house stock from the phone; null when it can. The same rule as
 * Take back on the management side (setTagRep to the house): unsold, unconfigured, in stock and
 * with a reseller. Who may ask is decided by access (full).
 */
export function returnToHouseBlocker(piece: DistributionPiece): TakeBackBlocker | null {
  return takeBackBlocker(piece);
}

/** What the piece screen offers about custody, worked out by the server for the viewer. */
export interface PieceCustodyActions {
  access: Exclude<PieceAccess, "none">;
  /** Null when the piece is not waiting to be received. */
  receive: { targets: ReceiveTarget[]; blocker: ReceiveBlocker | null } | null;
  /** Null when not offered: a house piece, or a viewer without full access. */
  returnToHouse: { blocker: TakeBackBlocker | null } | null;
}

export function custodyActions(
  actor: TagActor,
  piece: DistributionPiece & { batchId: string | null; organizationId?: number | null },
  batchStatus: string | null,
): PieceCustodyActions | null {
  const access = pieceAccess(actor, piece);
  if (access === "none") return null;
  const receive = piece.stockStatus === "pending"
    ? { targets: receiveTargets(actor), blocker: receiveBlocker(actor, piece, batchStatus) }
    : null;
  const returnToHouse = access === "full" && piece.repId !== null ? { blocker: returnToHouseBlocker(piece) } : null;
  return { access, receive, returnToHouse };
}
