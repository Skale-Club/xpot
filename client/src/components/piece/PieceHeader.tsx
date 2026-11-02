import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import type { TagDetail } from "@shared/tagsApi";
import { CODE_HEADING, TagModelChips, TagPieceVisual, tagPlaqueSpec } from "@/components/xpot/TagProductThumbnail";
import { Pill, SOLD_TONE } from "@/components/xpot/StatusPill";
import { EYEBROW } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { usePiece, usePieceActivity } from "./PieceContext";
import { useReasonText } from "./reasonText";
import { useJourney } from "@/pages/admin/tags/journey-shared";
import { formatDate } from "@/lib/format";
import { pieceHolderLine, pieceIsSold, pieceSituation, pieceStatusChips, type PieceDimension, type PieceSituationKey } from "./pieceView";

// The piece's header, the same on the reseller screen and the admin page: what
// it is (model and face), one status pill (pieceSituation), where it is and
// whose it is. The three stored states as labelled chips (Link, Stock, Chip,
// and Sold) live in Management › Technical details (PieceStatusChips).

/** A stored value in the language in use; an unknown one shows as stored. */
function useStatusLabel() {
  const tt = useT(tagsMessages);
  const tm = useT(manageTagsMessages);
  const tp = useT(pieceScreenMessages);
  return (dimension: PieceDimension, value: string): string => {
    const [dict, key] =
      dimension === "digital" ? [tt, `status_${value}`]
      : dimension === "chip" ? [tp, `chipValue_${value}`]
      : value === "sold" ? [tp, "stockValue_sold"]
      : [tm, `stock_${value}`];
    const label = dict(key as never);
    return label === key ? value.replace(/_/g, " ") : label;
  };
}

/** Digital · Physical stock · Chip, each with its label, then "Sold" when there is a financial sale. */
export function PieceStatusChips({ tag, className = "" }: { tag: Pick<TagDetail, "status" | "stockStatus" | "nfcStatus" | "saleId">; className?: string }) {
  const tt = useT(tagsMessages);
  const tp = useT(pieceScreenMessages);
  const label = useStatusLabel();
  const dimensionLabel: Record<PieceDimension, string> = { digital: tp("dimDigital"), stock: tp("dimStock"), chip: tp("dimChip") };
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`} data-testid="piece-status-chips">
      {pieceStatusChips(tag).map((chip) => (
        <span key={chip.dimension} className="inline-flex items-center gap-1.5" data-testid={`piece-chip-${chip.dimension}`}>
          <span className={EYEBROW}>{dimensionLabel[chip.dimension]}</span>
          <Pill tone={chip.tone}>{label(chip.dimension, chip.value)}</Pill>
        </span>
      ))}
      {pieceIsSold(tag) ? <span data-testid="piece-sold-pill"><Pill tone={SOLD_TONE}>{tt("soldBadge")}</Pill></span> : null}
    </div>
  );
}

/** What put the piece in the state it is in, for whoever manages it: "Marked lost · Oct 3 · by Marcus Reed", and the reason if there is one. */
const ENDED_BY: Partial<Record<PieceSituationKey, string>> = { damaged: "damage", lost: "loss", retired: "retire", reserved: "reserve", internalUse: "internal_use" };

function LastMovement({ movementType }: { movementType: string }) {
  const { tag, viewer } = usePiece();
  const tp = useT(pieceScreenMessages);
  const reasonText = useReasonText();
  const { data } = usePieceActivity(tag.id, tag.updatedAt);
  // Deactivating a piece writes no stock movement: its who, when and why are in the production log (the global admin reads it).
  const log = useJourney({ tagId: tag.id }, viewer.isAdmin && movementType === "retire");
  const movement = data?.movements?.find((m) => m.movementType === movementType);
  const entry = movement ? null : movementType === "retire" ? log.data?.entries.find((e) => e.action === "tag_retired") ?? null : null;
  const at = movement?.createdAt ?? entry?.occurredAt;
  if (!at) return null;
  const actor = movement ? movement.actorName : entry?.actorName;
  const reason = reasonText(movement ? movement.reason : entry?.content ?? null);
  return (
    <p className="text-sm text-white/55" data-testid="piece-last-movement">
      {[tp(`movement_${movementType}` as "movement_loss"), formatDate(at, { month: "short", day: "numeric" }), actor ? tp("evBy", { name: actor }) : null].filter(Boolean).join(" · ")}
      {reason ? <span className="block text-white/45">{reason}</span> : null}
    </p>
  );
}

/** The one status of the piece, in the words every list uses (pieceStatus), with what the status alone leaves unsaid. Needs the piece screen's context. */
export function PieceSituationPill({ className = "" }: { className?: string }) {
  const { tag, viewer } = usePiece();
  const tp = useT(pieceScreenMessages);
  const label = useStatusLabel();
  const situation = pieceSituation(tag, viewer);
  // An unlisted situation shows the stored status in words.
  const stockSpeaks = tag.status === "inventory" && tag.stockStatus !== "available";
  const text = situation.key === "other" ? (stockSpeaks ? label("stock", tag.stockStatus) : label("digital", tag.status)) : tp(`situation_${situation.key}` as "situation_live");
  return (
    <div className={`space-y-1.5 ${className}`} data-testid="piece-situation" data-situation={situation.key}>
      <Pill tone={situation.tone}>{text}</Pill>
      {situation.note ? <p className="text-sm text-amber-200/85" data-testid="piece-note">{tp(`note${situation.note[0].toUpperCase()}${situation.note.slice(1)}` as "noteSoldNotLive")}</p> : null}
      {viewer.canManage && ENDED_BY[situation.key] ? <LastMovement movementType={ENDED_BY[situation.key]!} /> : null}
      {situation.chipNote ? <p className={`text-sm ${situation.chipNote === "failed" ? "text-red-300/90" : "text-amber-200/85"}`} data-testid="piece-chip-note">{tp(`chipNote_${situation.chipNote}` as "chipNote_qrWorks")}</p> : null}
    </div>
  );
}

/**
 * Who has the piece, and whose it is. Without a customer: where it is (company stock, "With you", or "With" the
 * reseller; the status pill already says "No customer yet"). With a customer, the customer's name answers "where is
 * it"; a reseller other than the viewer is named, the viewer's own piece and company stock are not.
 */
export function PieceFacts({ tag, className = "" }: { tag: TagDetail; className?: string }) {
  const tp = useT(pieceScreenMessages);
  const tpieces = useT(manageTagsPiecesMessages);
  const { viewer } = usePiece();
  const line = pieceHolderLine(tag, viewer);
  const named = line && "repId" in line ? line.name ?? tpieces("resellerNumber", { id: line.repId }) : "";
  const kit = line && "kit" in line && line.kit ? <span className="font-mono text-white/45"> · {tp("locationKit", { id: line.kit })}</span> : null;
  const where = !line ? null
    : line.kind === "company" ? tpieces("houseStock")
    : line.kind === "you" ? tp("locationYou")
    : <>{tp(line.kind === "with" ? "locationWith" : "locationReseller", { name: named })}{kit}</>;
  if (!where) return null;
  return (
    <dl className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 text-sm ${className}`} data-testid="piece-facts">
      {where ? (
        <>
          <dt className="flex h-5 items-center" title={tp("locationLabel")}>
            <MapPin className="h-4 w-4 text-white/40" aria-hidden="true" />
            <span className="sr-only">{tp("locationLabel")}</span>
          </dt>
          <dd className="min-w-0 break-words text-white/75" data-testid="piece-location">{where}</dd>
        </>
      ) : null}
    </dl>
  );
}

/** The model line: the plaque chips when the piece has a known model, else its type; then the label. */
export function PieceModelLine({ tag, extra }: { tag: TagDetail; extra?: ReactNode }) {
  const tt = useT(tagsMessages);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/50">
      {tagPlaqueSpec(tag.productType, tag.face, tag.batchCode).model ? (
        <TagModelChips productType={tag.productType} face={tag.face} batchCode={tag.batchCode} className="shrink-0" />
      ) : (
        <span className="text-xs text-white/45">{tt(`product_${tag.productType}` as "product_custom")}</span>
      )}
      {extra}
      {tag.label ? <span className="truncate text-xs text-white/45">{tag.label}</span> : null}
    </div>
  );
}

/** The admin page's heading: picture, code, model, the status pill and the facts; `actions` on the right. */
export function PieceHeader({ tag, actions }: { tag: TagDetail; actions?: ReactNode }) {
  const tt = useT(tagsMessages);
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start" data-testid="piece-header">
      <div className="flex min-w-0 flex-1 flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
        <TagPieceVisual productType={tag.productType} face={tag.face} batchCode={tag.batchCode} size="hero" title={tt(`face_${tag.face ?? "none"}` as "face_none")} />
        <div className="w-full min-w-0 flex-1 space-y-2">
          <h2 className={CODE_HEADING} data-testid="admin-piece-code">{tag.publicCode}</h2>
          <PieceModelLine tag={tag} />
          <PieceSituationPill />
          <PieceFacts tag={tag} />
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
