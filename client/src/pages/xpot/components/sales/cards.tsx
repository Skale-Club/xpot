// Read-only pieces: a sale in a list, a consignment agreement, and the ledger.

import { Package, Handshake, AlertCircle, ArrowDownLeft, SlidersHorizontal, Undo2 } from "lucide-react";
import type { SalesConsignmentMovement } from "#shared/schema.js";
import { formatCents, formatDateTime, formatShortDate } from "../../utils";
import { consignmentDue } from "./consignmentDue";
import type { ConsignmentWithRefs, PaymentMethod, PaymentStatus, SaleWithItems } from "../../hooks/useSalesModule";
import { Money } from "./ui";
import { Button } from "@/components/ui/button";
import { CONSIGNMENT_STATUS_TONE, PAYMENT_STATUS_TONE, Pill, SALE_STATUS_TONE, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import { EmptyState } from "@/components/xpot/EmptyState";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { salesMessages } from "@/i18n/messages/sales";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

/** Paid green, partly paid amber, unpaid red (PAYMENT_STATUS_TONE). */
export function paymentTone(status: string): PillTone {
  return toneOf(PAYMENT_STATUS_TONE, status, "red");
}

/** A settlement is a sale made from stock left on consignment: blue like an active agreement. */
const SETTLEMENT_TONE: PillTone = CONSIGNMENT_STATUS_TONE.active;

/** The pills of a sale in a list: settlement, then cancelled or how much is paid. */
export function SaleStatusPills({ sale }: { sale: SaleWithItems["sale"] }) {
  const t = useT(salesModuleMessages);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {sale.kind === "consignment_settlement" ? <Pill tone={SETTLEMENT_TONE}>{t("chipSettlement")}</Pill> : null}
      {sale.status === "cancelled"
        ? <Pill tone={SALE_STATUS_TONE.cancelled}>{t("chipCancelled")}</Pill>
        : <Pill tone={paymentTone(sale.paymentStatus)}>{t(`payment_${sale.paymentStatus as PaymentStatus}`)}</Pill>}
    </span>
  );
}

/** Where an agreement stands: closed, late (red), due soon (amber), or its next date. */
export function ConsignmentDuePill({ consignment, emptyAsDash = false }: {
  consignment: ConsignmentWithRefs["consignment"];
  /** Tables show "—" when there is nothing to say; cards show nothing. */
  emptyAsDash?: boolean;
}) {
  const t = useT(salesModuleMessages);
  const { closed, overdue, daysOverdue, dueInDays } = consignmentDue(consignment);
  if (closed) return <Pill tone={CONSIGNMENT_STATUS_TONE.closed}>{t("chipClosed")}</Pill>;
  if (overdue) return <Pill tone="red">{t("daysOverdue", { days: daysOverdue })}</Pill>;
  if (dueInDays !== null) return <Pill tone="amber">{dueInDays === 0 ? t("dueToday") : t("dueInDays", { days: dueInDays })}</Pill>;
  if (consignment.nextVisitDueAt) return <Pill tone="slate">{t("settleOn", { date: formatShortDate(consignment.nextVisitDueAt) })}</Pill>;
  return emptyAsDash ? <span className="text-white/20">—</span> : null;
}

export function SaleCard({ row, onOpen }: { row: SaleWithItems; onOpen?: () => void }) {
  const ts = useT(salesMessages);
  const { sale, items, lead } = row;
  const cancelled = sale.status === "cancelled";
  const isSettlement = sale.kind === "consignment_settlement";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-2xl p-4 text-left transition-colors hover:bg-white/[0.06] active:scale-[0.995] ${GLASS_CLASS} ${cancelled ? "opacity-55" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isSettlement
              ? <Handshake className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden="true" />
              : <Package className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden="true" />}
            <span className="truncate text-sm font-semibold text-white">{lead?.name ?? ts("leadNumber", { id: sale.leadId })}</span>
          </div>
          <div className="mt-1 truncate text-xs text-white/45">
            {items.map((i) => `${i.quantity}× ${i.description}`).join(" · ") || "—"}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-white/40">
              {formatShortDate(sale.soldAt)}
            </span>
            <SaleStatusPills sale={sale} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Money
            cents={sale.totalCents}
            currency={sale.currency}
            className={`text-base font-bold ${cancelled ? "text-white/40 line-through" : "text-emerald-300"}`}
          />
        </div>
      </div>
    </button>
  );
}

export function ConsignmentCard({
  row, onSettle, onRestock, onReturn, onOpen, compact,
}: {
  row: ConsignmentWithRefs;
  onSettle?: () => void;
  onRestock?: () => void;
  onReturn?: () => void;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const t = useT(salesModuleMessages);
  const ts = useT(salesMessages);
  const c = row.consignment;
  const { closed, overdue } = consignmentDue(c);

  return (
    <div
      className={`rounded-2xl p-4 ${overdue ? "border border-red-400/25 bg-red-500/[0.07]" : GLASS_CLASS} ${closed ? "opacity-60" : ""}`}
    >
      <button type="button" onClick={onOpen} className="w-full text-left" disabled={!onOpen}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{row.product?.name ?? t("productFallback")}</div>
            {!compact && (
              <div className="truncate text-xs text-white/45">{row.lead?.name ?? ts("leadNumber", { id: c.leadId })}</div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ConsignmentDuePill consignment={c} />
              <span className="text-[11px] text-white/40">
                {t("pricePerUnit", { price: formatCents(c.unitPriceCents, c.currency) })}
              </span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-bold tabular-nums text-white">{c.quantityOnHand}</div>
            <div className="text-[11px] text-white/40">{t("onShelf")}</div>
          </div>
        </div>

        {!compact && (
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-2.5">
            {[
              { label: t("statLeft"), value: c.totalDeposited },
              { label: t("statSold"), value: c.totalSold },
              { label: t("statBilled"), value: formatCents(c.totalSettledCents, c.currency) },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[11px] text-white/40">{s.label}</div>
                <div className="text-xs tabular-nums text-white/70">{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </button>

      {!closed && (onSettle || onRestock || onReturn) && (
        <div className="mt-3 flex gap-1.5">
          {onSettle && (
            <Button type="button" variant="money" className="min-h-10 flex-1" onClick={onSettle}>
              <Handshake aria-hidden="true" /> {t("actionSettle")}
            </Button>
          )}
          {onRestock && (
            <Button type="button" variant="secondary" className="min-h-10" onClick={onRestock}>
              <ArrowDownLeft aria-hidden="true" /> {t("actionRestock")}
            </Button>
          )}
          {onReturn && (
            <Button type="button" variant="secondary" size="icon" className="h-10 w-10" onClick={onReturn} title={t("actionTakeBack")} aria-label={t("actionTakeBack")}>
              <Undo2 aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

type MovementType = "deposit" | "settlement" | "return" | "adjustment";

// Stock in is blue, a settlement is money (green), stock coming back is a
// step (amber), a correction is neutral. Tailwind classes so the colours stay the kit's.
const MOVEMENT_META: Record<MovementType, { icon: typeof Package; tile: string; text: string }> = {
  deposit: { icon: ArrowDownLeft, tile: "bg-blue-400/15", text: "text-blue-300" },
  settlement: { icon: Handshake, tile: "bg-emerald-400/15", text: "text-emerald-300" },
  return: { icon: Undo2, tile: "bg-amber-400/15", text: "text-amber-300" },
  adjustment: { icon: SlidersHorizontal, tile: "bg-white/10", text: "text-white/60" },
};

/** The ledger. This is the answer when the shop owner remembers it differently. */
export function MovementLedger({ movements, currency }: { movements: SalesConsignmentMovement[]; currency: string }) {
  const t = useT(salesModuleMessages);
  if (!movements.length) {
    return <EmptyState compact dense icon={AlertCircle} title={t("noMovements")} />;
  }
  return (
    <div className="space-y-1.5">
      {movements.map((m) => {
        const type: MovementType = m.type in MOVEMENT_META ? (m.type as MovementType) : "adjustment";
        const meta = MOVEMENT_META[type];
        const Icon = meta.icon;
        const signed = m.type === "deposit" ? `+${m.quantity}` : m.type === "adjustment" ? (m.quantity > 0 ? `+${m.quantity}` : String(m.quantity)) : `−${m.quantity}`;
        return (
          <div key={m.id} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${GLASS_CLASS}`}>
            <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${meta.tile}`}>
              <Icon className={`h-3 w-3 ${meta.text}`} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-white/85">{t(`movement_${type}`)}</span>
                <span className={`shrink-0 tabular-nums text-xs font-semibold ${meta.text}`}>{signed}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/35">
                <span>{formatDateTime(m.occurredAt)}</span>
                <span>{t("shelfChange", { before: m.onHandBefore, after: m.onHandAfter })}</span>
                {m.countedRemaining != null && <span>{t("countedN", { count: m.countedRemaining })}</span>}
                {m.amountCents ? <span className="text-emerald-300/80">{formatCents(m.amountCents, currency)}</span> : null}
              </div>
              {m.notes ? <div className="mt-1 text-[11px] text-white/45">{m.notes}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SaleDetail({ row }: { row: SaleWithItems }) {
  const t = useT(salesModuleMessages);
  const { sale, items, pieces } = row;
  const costCents = items.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className={`flex items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 ${GLASS_CLASS}`}>
            <div className="min-w-0">
              <div className="truncate text-sm text-white/85">{item.description}</div>
              <div className="text-[11px] text-white/35">
                {item.quantity} × {formatCents(item.unitPriceCents, sale.currency)}
              </div>
            </div>
            <Money cents={item.totalCents} currency={sale.currency} className="shrink-0 text-sm font-semibold text-white" />
          </div>
        ))}
      </div>

      {pieces.length > 0 && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.07] px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-blue-200">{t("tagPieces")}</span>
            <Pill tone="blue">{t("source_tags")}</Pill>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pieces.map((piece) => <span key={piece.tagId} className="rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-xs tracking-wider text-white/75">{piece.publicCode}</span>)}
          </div>
        </div>
      )}

      <div className="space-y-1.5 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-3">
        {sale.discountCents > 0 && (
          <>
            <Row label={t("subtotal")}><Money cents={sale.subtotalCents} currency={sale.currency} /></Row>
            <Row label={t("discount")}><Money cents={-sale.discountCents} currency={sale.currency} /></Row>
          </>
        )}
        <div className="flex items-center justify-between border-t border-white/10 pt-2">
          <span className="text-sm font-semibold text-white">{t("total")}</span>
          <Money cents={sale.totalCents} currency={sale.currency} className="text-lg font-bold text-emerald-300" />
        </div>
        <Row label={t("payment")}>
          <span className="flex items-center gap-2">
            <Pill tone={paymentTone(sale.paymentStatus)}>{t(`payment_${sale.paymentStatus as PaymentStatus}`)}</Pill>
            {sale.paymentStatus === "partial" && (
              <span className="text-xs tabular-nums text-white/50">
                {t("amountReceivedInline", { amount: formatCents(sale.paidCents, sale.currency) })}
              </span>
            )}
          </span>
        </Row>
        {sale.paymentMethod ? <Row label={t("method")}><span className="text-xs text-white/60">{t(`method_${sale.paymentMethod as PaymentMethod}`)}</span></Row> : null}
        <Row label={t("date")}><span className="text-xs text-white/60">{formatDateTime(sale.soldAt)}</span></Row>
        {pieces.length > 0 && <Row label={t("costOfGoods")}><Money cents={costCents} currency={sale.currency} /></Row>}
        {pieces.length > 0 && <Row label={t("grossProfit")}><Money cents={sale.totalCents - costCents} currency={sale.currency} /></Row>}
      </div>

      {sale.notes ? (
        <div className={`rounded-xl px-3 py-2.5 text-xs text-white/60 ${GLASS_CLASS}`}>
          {sale.notes}
        </div>
      ) : null}

      {sale.status === "cancelled" ? (
        <InlineAlert tone="error">
          {t("cancelledOn", { date: formatShortDate(sale.cancelledAt) })}{sale.cancelReason ? ` — ${sale.cancelReason}` : ""}
        </InlineAlert>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs text-white/70">{children}</span>
    </div>
  );
}
