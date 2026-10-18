import type { ReactNode } from "react";
import { Building2, MapPin } from "lucide-react";
import type { TagDetail } from "@shared/tagsApi";
import { CODE_HEADING, TagModelChips, TagPieceVisual, tagPlaqueSpec } from "@/components/xpot/TagProductThumbnail";
import { Pill, SOLD_TONE } from "@/components/xpot/StatusPill";
import { EYEBROW } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { pieceIsSold, pieceLocation, pieceStatusChips, type PieceDimension } from "./pieceView";

// The piece's header, the same on the reseller screen and the admin page: what
// it is (model and face), its three states as labelled chips (Digital, Physical
// stock, Chip), the Sold pill when a sale is recorded, where it is and whose it is.

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

/** Where the piece is (house stock, or a reseller and their kit) and its customer. */
export function PieceFacts({ tag, className = "" }: { tag: TagDetail; className?: string }) {
  const tt = useT(tagsMessages);
  const tp = useT(pieceScreenMessages);
  const tpieces = useT(manageTagsPiecesMessages);
  const location = pieceLocation(tag);
  const where = location.kind === "house"
    ? tpieces("houseStock")
    : tp("locationWith", { name: location.name ?? tpieces("resellerNumber", { id: location.repId }) });
  return (
    <dl className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-sm ${className}`} data-testid="piece-facts">
      <dt className="flex items-center" title={tp("locationLabel")}>
        <MapPin className="h-4 w-4 text-white/40" aria-hidden="true" />
        <span className="sr-only">{tp("locationLabel")}</span>
      </dt>
      <dd className="min-w-0 truncate text-white/75" data-testid="piece-location">
        {where}
        {location.kind === "reseller" && location.kit ? <span className="font-mono text-white/45"> · {tp("locationKit", { id: location.kit })}</span> : null}
      </dd>
      <dt className="flex items-center" title={tp("customerLabel")}>
        <Building2 className="h-4 w-4 text-white/40" aria-hidden="true" />
        <span className="sr-only">{tp("customerLabel")}</span>
      </dt>
      <dd className={`min-w-0 truncate ${tag.leadName ? "font-semibold text-white/85" : "text-white/45"}`} data-testid="piece-customer">
        {tag.leadName ?? tt("noCustomer")}
      </dd>
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

/** The admin page's heading: picture, code, model, the three chips and the facts; `actions` on the right. */
export function PieceHeader({ tag, actions }: { tag: TagDetail; actions?: ReactNode }) {
  const tt = useT(tagsMessages);
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start" data-testid="piece-header">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
        <TagPieceVisual productType={tag.productType} face={tag.face} size="md" title={tt(`face_${tag.face ?? "none"}` as "face_none")} />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className={CODE_HEADING} data-testid="admin-piece-code">{tag.publicCode}</h2>
          <PieceModelLine tag={tag} />
          <PieceStatusChips tag={tag} />
          <PieceFacts tag={tag} />
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
