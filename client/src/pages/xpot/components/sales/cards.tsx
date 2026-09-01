// Read-only pieces: a sale in a list, a consignment agreement, and the ledger.

import { Package, Handshake, AlertCircle, ArrowDownLeft, ArrowUpRight, SlidersHorizontal, Undo2 } from "lucide-react";
import type { SalesConsignmentMovement } from "#shared/schema.js";
import { formatCents, formatDateTime, formatShortDate, daysUntil } from "../../utils";
import type { ConsignmentWithRefs, SaleWithItems } from "../../hooks/useSalesModule";
import { Chip, Money } from "./ui";

export function paymentTone(status: string) {
  return status === "paid" ? "green" : status === "partial" ? "amber" : "red";
}

export function SaleCard({ row, onOpen }: { row: SaleWithItems; onOpen?: () => void }) {
  const { sale, items, lead } = row;
  const cancelled = sale.status === "cancelled";
  const isSettlement = sale.kind === "consignment_settlement";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.995]"
      style={{
        background: cancelled ? "rgba(255,255,255,0.02)" : "rgba(16,185,129,0.06)",
        border: `1px solid ${cancelled ? "rgba(255,255,255,0.06)" : "rgba(16,185,129,0.18)"}`,
        opacity: cancelled ? 0.55 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isSettlement
              ? <Handshake className="h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
              : <Package className="h-3.5 w-3.5 shrink-0 text-emerald-400/70" />}
            <span className="truncate text-sm font-semibold text-white">{lead?.name ?? `Lead #${sale.leadId}`}</span>
          </div>
          <div className="mt-1 truncate text-xs text-white/45">
            {items.map((i) => `${i.quantity}× ${i.description}`).join(" · ") || "—"}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/25">
              {formatShortDate(sale.soldAt)}
            </span>
            {isSettlement ? <Chip tone="purple">Settlement</Chip> : null}
            {cancelled
              ? <Chip tone="neutral">Cancelled</Chip>
              : <Chip tone={paymentTone(sale.paymentStatus)}>{sale.paymentStatus}</Chip>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Money
            cents={sale.totalCents}
            currency={sale.currency}
            className={`text-base font-bold ${cancelled ? "text-white/40 line-through" : "text-emerald-400"}`}
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
  const c = row.consignment;
  const due = daysUntil(c.nextVisitDueAt);
  const overdue = due !== null && due < 0;
  const dueSoon = due !== null && due >= 0 && due <= 7;
  const closed = c.status === "closed";

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: overdue ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${overdue ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.09)"}`,
        opacity: closed ? 0.6 : 1,
      }}
    >
      <button type="button" onClick={onOpen} className="w-full text-left" disabled={!onOpen}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{row.product?.name ?? "Product"}</div>
            {!compact && (
              <div className="truncate text-xs text-white/45">{row.lead?.name ?? `Lead #${c.leadId}`}</div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {closed ? (
                <Chip tone="neutral">Closed</Chip>
              ) : overdue ? (
                <Chip tone="red">{`${Math.abs(due!)}d overdue`}</Chip>
              ) : dueSoon ? (
                <Chip tone="amber">{due === 0 ? "Due today" : `Due in ${due}d`}</Chip>
              ) : c.nextVisitDueAt ? (
                <Chip tone="neutral">{`Settle ${formatShortDate(c.nextVisitDueAt)}`}</Chip>
              ) : null}
              <span className="text-[10px] uppercase tracking-wider text-white/25">
                {formatCents(c.unitPriceCents, c.currency)} / unit
              </span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-bold tabular-nums text-white">{c.quantityOnHand}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/30">on shelf</div>
          </div>
        </div>

        {!compact && (
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-2.5">
            {[
              { label: "Left", value: c.totalDeposited },
              { label: "Sold", value: c.totalSold },
              { label: "Billed", value: formatCents(c.totalSettledCents, c.currency) },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-white/25">{s.label}</div>
                <div className="text-xs tabular-nums text-white/70">{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </button>

      {!closed && (onSettle || onRestock || onReturn) && (
        <div className="mt-3 flex gap-1.5">
          {onSettle && (
            <button type="button" onClick={onSettle}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-white transition-all active:scale-[0.98] touch-manipulation"
              style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }}>
              <Handshake className="h-3.5 w-3.5" /> Settle
            </button>
          )}
          {onRestock && (
            <button type="button" onClick={onRestock}
              className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 touch-manipulation"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <ArrowDownLeft className="h-3.5 w-3.5" /> Restock
            </button>
          )}
          {onReturn && (
            <button type="button" onClick={onReturn} title="Take back"
              className="flex items-center justify-center rounded-xl px-3 py-2 text-white/50 transition-colors hover:bg-white/10 touch-manipulation"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const MOVEMENT_META: Record<string, { label: string; icon: typeof Package; tone: string }> = {
  deposit: { label: "Left stock", icon: ArrowDownLeft, tone: "#60a5fa" },
  settlement: { label: "Settled", icon: Handshake, tone: "#34d399" },
  return: { label: "Taken back", icon: Undo2, tone: "#fbbf24" },
  adjustment: { label: "Corrected", icon: SlidersHorizontal, tone: "#a78bfa" },
};

/** The ledger. This is the answer when the shop owner remembers it differently. */
export function MovementLedger({ movements, currency }: { movements: SalesConsignmentMovement[]; currency: string }) {
  if (!movements.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-3 py-4 text-xs text-white/35"
        style={{ background: "rgba(255,255,255,0.03)" }}>
        <AlertCircle className="h-3.5 w-3.5" /> No movements yet.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {movements.map((m) => {
        const meta = MOVEMENT_META[m.type] ?? MOVEMENT_META.adjustment;
        const Icon = meta.icon;
        const signed = m.type === "deposit" ? `+${m.quantity}` : m.type === "adjustment" ? (m.quantity > 0 ? `+${m.quantity}` : String(m.quantity)) : `−${m.quantity}`;
        return (
          <div key={m.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${meta.tone}22` }}>
              <Icon className="h-3 w-3" style={{ color: meta.tone }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-white/85">{meta.label}</span>
                <span className="shrink-0 tabular-nums text-xs font-semibold" style={{ color: meta.tone }}>{signed}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/35">
                <span>{formatDateTime(m.occurredAt)}</span>
                <span>shelf {m.onHandBefore} → {m.onHandAfter}</span>
                {m.countedRemaining != null && <span>counted {m.countedRemaining}</span>}
                {m.amountCents ? <span className="text-emerald-400/70">{formatCents(m.amountCents, currency)}</span> : null}
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
  const { sale, items } = row;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-baseline justify-between gap-3 rounded-xl px-3 py-2.5"
            style={{ background: "rgba(255,255,255,0.04)" }}>
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

      <div className="space-y-1.5 rounded-xl px-3 py-3" style={{ background: "rgba(16,185,129,0.06)" }}>
        {sale.discountCents > 0 && (
          <>
            <Row label="Subtotal"><Money cents={sale.subtotalCents} currency={sale.currency} /></Row>
            <Row label="Discount"><Money cents={-sale.discountCents} currency={sale.currency} /></Row>
          </>
        )}
        <div className="flex items-center justify-between border-t border-white/10 pt-2">
          <span className="text-sm font-semibold text-white">Total</span>
          <Money cents={sale.totalCents} currency={sale.currency} className="text-lg font-bold text-emerald-400" />
        </div>
        <Row label="Payment">
          <span className="flex items-center gap-2">
            <Chip tone={paymentTone(sale.paymentStatus)}>{sale.paymentStatus}</Chip>
            {sale.paymentStatus === "partial" && (
              <span className="text-xs tabular-nums text-white/50">
                {formatCents(sale.paidCents, sale.currency)} received
              </span>
            )}
          </span>
        </Row>
        {sale.paymentMethod ? <Row label="Method"><span className="text-xs capitalize text-white/60">{sale.paymentMethod}</span></Row> : null}
        <Row label="Date"><span className="text-xs text-white/60">{formatDateTime(sale.soldAt)}</span></Row>
      </div>

      {sale.notes ? (
        <div className="rounded-xl px-3 py-2.5 text-xs text-white/60" style={{ background: "rgba(255,255,255,0.03)" }}>
          {sale.notes}
        </div>
      ) : null}

      {sale.status === "cancelled" ? (
        <div className="rounded-xl px-3 py-2.5 text-xs text-red-300"
          style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
          Cancelled {formatShortDate(sale.cancelledAt)}{sale.cancelReason ? ` — ${sale.cancelReason}` : ""}
        </div>
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
