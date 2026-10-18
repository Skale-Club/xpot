import { useT } from "@/i18n";
import { buttonVariants } from "@/components/ui/button";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { Pill, PIECE_STATUS_TONE, SOLD_TONE, STOCK_STATUS_TONE, toneOf } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsMessages } from "@/i18n/messages/manageTags";

// A piece's status pills for the Tags admin, on the shared Pill and tone maps.
// Everything else (buttons, fields, cards, tables, empty/error/loading) comes
// from the shared kit (docs/UI_KIT.md).

/** The digital status: the piece's link (not set up, set up, live, off, retired). */
export function StatusPill({ status }: { status: string }) {
  const tt = useT(tagsMessages);
  const key = `status_${status}`;
  const label = tt(key as never);
  return <Pill tone={toneOf(PIECE_STATUS_TONE, status)}>{label === key ? status : label}</Pill>;
}

/** The physical piece: not received, in stock, damaged…; "Sold" (blue, as in the rep app) once a financial sale is recorded. */
export function StockPill({ stockStatus, saleId }: { stockStatus: string; saleId: number | null }) {
  const tt = useT(tagsMessages);
  const t = useT(manageTagsMessages);
  if (saleId !== null) return <Pill tone={SOLD_TONE}>{tt("soldBadge")}</Pill>;
  const key = `stock_${stockStatus}`;
  const label = t(key as never);
  return <Pill tone={toneOf(STOCK_STATUS_TONE, stockStatus)}>{label === key ? stockStatus : label}</Pill>;
}

/** Both dimensions of a piece: its digital status (link) and its physical stock status (or its sale). */
export function PieceStatusPill({ status, stockStatus, saleId, className = "" }: { status: string; stockStatus: string; saleId: number | null; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      <StatusPill status={status} />
      <StockPill stockStatus={stockStatus} saleId={saleId} />
    </span>
  );
}

// ─── Kept for JourneyMcpCard (moving to Integrations) ─────────────────────────
// Thin class aliases over the kit so that file keeps compiling until it moves;
// nothing in the Tags admin uses them. Delete once JourneyMcpCard stops importing them.

/** @deprecated GLASS_CLASS card. */
export const CARD = `rounded-2xl ${GLASS_CLASS}`;
/** @deprecated The kit Input (components/xpot/Field). */
export const INPUT = `${FIELD_CONTROL} py-2`;
/** @deprecated <Button variant="brand">. */
export const BTN = buttonVariants({ variant: "brand" });
/** @deprecated <Button variant="danger">. */
export const BTN_DANGER = buttonVariants({ variant: "danger" });
