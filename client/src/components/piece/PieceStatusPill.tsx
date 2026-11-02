import { Pill, type PillTone } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { tagsMessages } from "@/i18n/messages/tags";
import { pieceChipState, pieceStatus, type PieceChipState, type PieceStatusInput } from "./pieceStatus";

// A piece's status and chip as pills: the stock list, the piece header, My pieces and the customer's
// pieces all say them through here, so a piece reads the same everywhere (pieceStatus.ts).

/** The words of a piece's status, in the language in use. A state the app does not name shows as stored. */
export function usePieceStatusLabel() {
  const tp = useT(pieceScreenMessages);
  const tt = useT(tagsMessages);
  const tm = useT(manageTagsMessages);
  return (piece: PieceStatusInput): string => {
    const { key } = pieceStatus(piece);
    if (key !== "other") return tp(`situation_${key}` as "situation_live");
    const stock = piece.status === "inventory" && piece.stockStatus !== "available";
    const raw = stock ? piece.stockStatus : piece.status;
    const label = stock ? tm(`stock_${raw}` as "stock_lost") : tt(`status_${raw}` as "status_active");
    return label.startsWith(stock ? "stock_" : "status_") ? raw.replace(/_/g, " ") : label;
  };
}

export function PieceStatusPill({ piece, className }: { piece: PieceStatusInput; className?: string }) {
  const label = usePieceStatusLabel();
  const { key, tone } = pieceStatus(piece);
  return <span className="inline-flex" data-status={key}><Pill tone={tone} className={className}>{label(piece)}</Pill></span>;
}

const CHIP_TONE: Record<PieceChipState, PillTone | null> = { none: null, needsWriting: "amber", failed: "red", untested: "amber", fine: null };

/** The words of the chip, only where it is something to act on: not written, write failed, not tested. */
export function usePieceChipLabel() {
  const tp = useT(pieceScreenMessages);
  return (piece: { status: string; nfcStatus: string }): { state: PieceChipState; label: string } => {
    const state = pieceChipState(piece);
    const label =
      state === "needsWriting" ? tp("chipValue_not_programmed")
      : state === "failed" ? tp("chipValue_failed")
      : state === "untested" ? tp("chipUntested")
      : state === "fine" ? tp(piece.nfcStatus === "locked" ? "chipValue_locked" : "chipValue_verified")
      : "";
    return { state, label };
  };
}

/**
 * The chip of a piece with a customer: amber when not written or not tested, red when the write failed, quiet text
 * when it is verified, nothing when no chip is asked for yet. The one red of the chip is a write that broke.
 */
export function PieceChipPill({ piece, quiet = "text", className }: { piece: { status: string; nfcStatus: string }; quiet?: "text" | "none"; className?: string }) {
  const { state, label } = usePieceChipLabel()(piece);
  const tone = CHIP_TONE[state];
  if (tone) return <span className="inline-flex" data-chip={state}><Pill tone={tone} className={className}>{label}</Pill></span>;
  if (state === "fine" && quiet === "text") return <span className={`text-xs text-white/40 ${className ?? ""}`} data-chip="fine">{label}</span>;
  return null;
}
