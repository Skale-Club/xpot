import { chipNeedsWriting } from "@shared/tagApp";
import type { PillTone } from "@/components/xpot/StatusPill";
import { SOLD_TONE } from "@/components/xpot/StatusPill";

// The one answer to "what is this piece?": the same words and colour on the stock list, the
// piece pop-up and page, the reseller's app and My pieces. Pure; every screen that names a
// piece's state goes through here (components/piece/pieceView.ts adds the viewer's action).

/** The piece in one status. Problems and ends of life first, then the sale, then how far it got. */
export type PieceStatusKey =
  | "damaged" | "lost" | "retired"
  | "soldLive" | "soldNotLive"
  | "pending" | "printFailed" | "printCancelled"
  | "live" | "paused" | "ready"
  | "noCustomer" | "reserved" | "internalUse" | "other";

/**
 * The chip, only where it matters (a piece set up for a customer): `needsWriting` is the
 * `chipNeedsWriting` rule of the reseller's app (shared/tagApp.ts), `failed` is its subset where
 * the write was tried and broke, `untested` is written but never read back, `fine` is verified
 * or locked. `none`: no customer yet, so a chip is not asked for.
 */
export type PieceChipState = "none" | "needsWriting" | "failed" | "untested" | "fine";

export interface PieceStatusInput {
  status: string;
  stockStatus: string;
  nfcStatus: string;
  saleId: number | null;
  /** The status of the print order of the piece's batch, when the house printed it. */
  printJobStatus?: string | null;
}

export interface PieceStatus {
  key: PieceStatusKey;
  tone: PillTone;
  /** The key of the sentence under the pill, when the status alone leaves the next step unclear. */
  note: "soldNotLive" | null;
  chip: PieceChipState;
}

export function pieceChipState(piece: { status: string; nfcStatus: string }): PieceChipState {
  if (piece.status !== "assigned" && piece.status !== "active") return "none";
  if (chipNeedsWriting(piece)) return piece.nfcStatus === "failed" ? "failed" : "needsWriting";
  return piece.nfcStatus === "programmed" ? "untested" : "fine";
}

/** Whether the chip is something to act on: not written, or written and never tested. */
export const chipNeedsAttention = (chip: PieceChipState): boolean => chip === "needsWriting" || chip === "failed" || chip === "untested";

/** A chip that holds nothing (or a failed write): the QR works, a tap on the phone does not. */
export const chipIsMissing = (chip: PieceChipState): boolean => chip === "needsWriting" || chip === "failed";

export function pieceStatus(piece: PieceStatusInput): PieceStatus {
  const { status, stockStatus } = piece;
  const chip = pieceChipState(piece);
  const done = (key: PieceStatusKey, tone: PillTone, note: PieceStatus["note"] = null): PieceStatus => ({ key, tone, note, chip });

  if (stockStatus === "damaged") return done("damaged", "red");
  if (stockStatus === "lost") return done("lost", "red");
  if (status === "retired" || stockStatus === "retired") return done("retired", "muted");
  if (piece.saleId !== null) return status === "active" ? done("soldLive", SOLD_TONE) : done("soldNotLive", "amber", "soldNotLive");
  if (stockStatus === "pending") {
    if (piece.printJobStatus === "failed") return done("printFailed", "red");
    if (piece.printJobStatus === "cancelled") return done("printCancelled", "muted");
    return done("pending", "amber");
  }
  if (status === "active") return done("live", "green");
  if (status === "disabled") return done("paused", "amber");
  if (status === "assigned") return done("ready", "sky");
  if (status === "inventory") {
    if (stockStatus === "available") return done("noCustomer", "slate");
    if (stockStatus === "reserved") return done("reserved", "blue");
    if (stockStatus === "internal_use") return done("internalUse", "slate");
  }
  return done("other", "slate");
}
