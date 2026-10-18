import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Ban, DollarSign, ExternalLink } from "lucide-react";
import { stockBlock } from "@shared/tags";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { PAYMENT_STATUS_TONE, Pill, SOLD_TONE, toneOf } from "@/components/xpot/StatusPill";
import { formatDate } from "@/lib/dates";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { salesModuleMessages } from "@/i18n/messages/salesModule";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { salesPath } from "@/pages/xpot/salesPath";
import { formatCents } from "@/pages/xpot/utils";
import TagSaleDialog from "@/pages/tags/TagSaleDialog";
import { errorText } from "@/pages/tags/lib";
import { CARD, EYEBROW_MUTED } from "@/pages/tags/ui";
import { invalidatePieceViews, pieceSend, usePiece, usePieceActivity } from "./PieceContext";
import { canCancelPieceSale } from "./pieceView";

// Sale: the financial sale, the only thing that makes a piece "sold" (going live
// never does). Record it (TagSaleDialog, the same on both screens); once sold,
// see it (price, date, seller, payment, and its page in Sales for Visits users);
// a manager, or the seller themselves (with Visits), can cancel it, which gives
// the piece back to the seller's stock.

export function SaleSection() {
  const { tag, viewer, notify, refresh } = usePiece();
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const ts = useT(salesModuleMessages);
  const tm = useT(manageTagsPiecesMessages);
  const tp = useT(pieceScreenMessages);
  const qc = useQueryClient();
  const [saleOpen, setSaleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { data: activity } = usePieceActivity(tag.id, tag.updatedAt);

  const stock = stockBlock(tag.stockStatus);
  const sellable = tag.stockStatus === "available" && tag.status !== "retired";
  const sale = tag.saleId !== null ? activity?.sales.find((s) => s.saleId === tag.saleId && s.status === "active") : undefined;
  const seller = sale?.sellerName ?? tag.repName ?? (tag.repId !== null ? tm("resellerNumber", { id: tag.repId }) : null);
  const mayCancel = canCancelPieceSale(viewer, sale);

  const cancelSale = async (reason: string) => {
    if (tag.saleId === null) return;
    setCancelError(null);
    try {
      await pieceSend("POST", `/api/xpot/sales/${tag.saleId}/cancel`, { reason: reason || null });
      invalidatePieceViews(qc);
      void qc.invalidateQueries({ queryKey: ["/api/xpot/sales"] });
      void qc.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
      refresh();
      notify({ tone: "ok", text: tp("saleCancelled") });
    } catch (err) {
      setCancelError(errorText(err, tc("requestFailed")));
      throw err;
    }
  };

  if (tag.saleId === null) {
    return (
      <section className={`${CARD} p-4`} data-testid="piece-sale">
        <p className={EYEBROW_MUTED}>{tp("saleTitle")}</p>
        <p className="mt-1 text-sm text-white/50">{tp("saleNotYet")}</p>
        <Button type="button" variant="money" size="lg" onClick={() => setSaleOpen(true)} disabled={!sellable} className="mt-3 w-full" data-testid="button-sell-this-piece">
          <DollarSign className="!size-5" /> {t("sellThisPiece")}
        </Button>
        {/* Only stock in hand sells (server/tags/sales.ts). */}
        {!sellable && (
          <p className="mt-2 px-1 text-sm text-white/50" data-testid="text-sell-blocked">{stock ? t(`stockBlocked_${stock}`) : t("stockNotForSale")}</p>
        )}
        <TagSaleDialog
          open={saleOpen}
          onOpenChange={setSaleOpen}
          pieces={[tag]}
          initialTagId={tag.id}
          // Management sells a reseller's piece in that reseller's name (the server allows managers to).
          sellerRepId={viewer.canManage && tag.repId !== null ? tag.repId : undefined}
        />
      </section>
    );
  }

  return (
    <section className={`${CARD} p-4`} data-testid="piece-sold">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={EYEBROW_MUTED}>{tp("saleTitle")}</p>
        <span className="font-mono text-xs text-white/40">#{tag.saleId}</span>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        <Pill tone={SOLD_TONE}>{t("soldBadge")}</Pill>
        <p className="text-base font-bold text-white">{t("soldFor", { amount: formatCents(sale?.priceCents ?? tag.soldPriceCents) })}</p>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        {tag.soldAt ? (
          <>
            <dt className="text-white/45">{tp("saleDate")}</dt>
            <dd className="truncate text-right text-white/80">{formatDate(tag.soldAt)}</dd>
          </>
        ) : null}
        {seller ? (
          <>
            <dt className="text-white/45">{tp("saleSeller")}</dt>
            <dd className="truncate text-right text-white/80">{seller}</dd>
          </>
        ) : null}
        {sale ? (
          <>
            <dt className="text-white/45">{tp("salePayment")}</dt>
            <dd className="text-right">
              <Pill tone={toneOf(PAYMENT_STATUS_TONE, sale.paymentStatus)}>{ts(`payment_${sale.paymentStatus}` as "payment_paid")}</Pill>
            </dd>
          </>
        ) : null}
      </dl>
      {(viewer.hasVisits || mayCancel) && (
        <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.08] pt-3 sm:flex-row sm:flex-wrap">
          {viewer.hasVisits && (
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href={salesPath("sales", tag.saleId)} data-testid="link-open-sale">
                <ExternalLink className="!size-4" />
                {tp("openSale")}
              </Link>
            </Button>
          )}
          {mayCancel && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCancelError(null);
                setCancelOpen(true);
              }}
              className="w-full sm:w-auto"
              data-testid="button-cancel-sale"
            >
              <Ban className="!size-4 text-red-400" />
              {tp("cancelSale")}
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        tone="danger"
        title={tp("cancelSaleTitle", { code: tag.publicCode })}
        description={tp("cancelSaleDescription", { name: seller ?? tm("houseStockTarget") })}
        confirmLabel={tp("cancelSale")}
        cancelLabel={tp("keepSale")}
        reason="optional"
        reasonPlaceholder={tp("cancelSaleReason")}
        error={cancelError}
        testId="button-cancel-sale-confirm"
        onConfirm={(reason) => cancelSale(reason)}
      />
    </section>
  );
}
