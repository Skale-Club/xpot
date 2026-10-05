// Desktop tables for the Sales and Stock tabs. The phone keeps the cards in
// cards.tsx; both open the same detail.

import { ArrowDownLeft, Handshake, Package, Undo2 } from "lucide-react";
import { daysUntil, formatCents, formatShortDate } from "../../utils";
import type { ConsignmentWithRefs, SaleWithItems } from "../../hooks/useSalesModule";
import { paymentTone } from "./cards";
import { Chip, Money } from "./ui";

const TABLE_STYLE = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" };
const TH = "whitespace-nowrap px-3 py-2.5 font-semibold";

function rowClass(selected: boolean) {
  return `cursor-pointer outline-none transition-colors focus-visible:bg-white/[0.05] ${selected ? "bg-blue-500/[0.12]" : "hover:bg-white/[0.03]"}`;
}

function onRowKey(run: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(); }
  };
}

export function SalesTable({ rows, selectedId, onSelect }: {
  rows: SaleWithItems[];
  selectedId: number | null;
  onSelect: (row: SaleWithItems) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl" style={TABLE_STYLE}>
      <table className="w-full text-left text-sm" data-testid="sales-table">
        <thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-widest text-white/35">
          <tr>
            <th className={TH}>Date</th>
            <th className={TH}>Company</th>
            <th className={`${TH} hidden 2xl:table-cell`}>Items</th>
            <th className={TH}>Payment</th>
            <th className={`${TH} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((row) => {
            const { sale, items, lead } = row;
            const cancelled = sale.status === "cancelled";
            const settlement = sale.kind === "consignment_settlement";
            const open = () => onSelect(row);
            return (
              <tr
                key={sale.id}
                tabIndex={0}
                aria-selected={selectedId === sale.id}
                onClick={open}
                onKeyDown={onRowKey(open)}
                className={`${rowClass(selectedId === sale.id)} ${cancelled ? "opacity-50" : ""}`}
                data-testid={`sale-row-${sale.id}`}
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-white/60">{formatShortDate(sale.soldAt)}</td>
                <td className="max-w-0 px-3 py-2.5" style={{ width: "45%" }}>
                  <div className="flex items-center gap-2">
                    {settlement
                      ? <Handshake className="h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
                      : <Package className="h-3.5 w-3.5 shrink-0 text-emerald-400/70" />}
                    <span className="truncate font-semibold text-white">{lead?.name ?? `Lead #${sale.leadId}`}</span>
                  </div>
                  <div className="truncate text-[11px] text-white/35 2xl:hidden">
                    {items.map((i) => `${i.quantity}× ${i.description}`).join(" · ") || "—"}
                  </div>
                </td>
                <td className="hidden max-w-0 truncate px-3 py-2.5 text-xs text-white/50 2xl:table-cell">
                  {items.map((i) => `${i.quantity}× ${i.description}`).join(" · ") || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {settlement ? <Chip tone="purple">Settlement</Chip> : null}
                    {cancelled ? <Chip tone="neutral">Cancelled</Chip> : <Chip tone={paymentTone(sale.paymentStatus)}>{sale.paymentStatus}</Chip>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <Money cents={sale.totalCents} currency={sale.currency} className={`font-bold ${cancelled ? "text-white/40 line-through" : "text-emerald-400"}`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ConsignmentsTable({ rows, selectedId, onSelect, onSettle, onRestock, onReturn }: {
  rows: ConsignmentWithRefs[];
  selectedId: number | null;
  onSelect: (row: ConsignmentWithRefs) => void;
  onSettle?: (row: ConsignmentWithRefs) => void;
  onRestock?: (row: ConsignmentWithRefs) => void;
  onReturn?: (row: ConsignmentWithRefs) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl" style={TABLE_STYLE}>
      <table className="w-full text-left text-sm" data-testid="consignments-table">
        <thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-widest text-white/35">
          <tr>
            <th className={TH}>Shop</th>
            <th className={TH}>Settle</th>
            <th className={`${TH} text-right`}>On shelf</th>
            <th className={`${TH} hidden text-right 2xl:table-cell`}>Billed</th>
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((row) => {
            const c = row.consignment;
            const due = daysUntil(c.nextVisitDueAt);
            const overdue = due !== null && due < 0;
            const dueSoon = due !== null && due >= 0 && due <= 7;
            const closed = c.status === "closed";
            const open = () => onSelect(row);
            return (
              <tr
                key={c.id}
                tabIndex={0}
                aria-selected={selectedId === c.id}
                onClick={open}
                onKeyDown={onRowKey(open)}
                className={`${rowClass(selectedId === c.id)} ${closed ? "opacity-60" : ""} ${overdue && selectedId !== c.id ? "bg-red-500/[0.05]" : ""}`}
                data-testid={`consignment-row-${c.id}`}
              >
                <td className="max-w-0 px-3 py-2.5" style={{ width: "42%" }}>
                  <div className="truncate font-semibold text-white">{row.lead?.name ?? `Lead #${c.leadId}`}</div>
                  <div className="truncate text-[11px] text-white/40">
                    {row.product?.name ?? "Product"} · {formatCents(c.unitPriceCents, c.currency)} / unit
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {closed ? (
                    <Chip tone="neutral">Closed</Chip>
                  ) : overdue ? (
                    <Chip tone="red">{`${Math.abs(due!)}d overdue`}</Chip>
                  ) : dueSoon ? (
                    <Chip tone="amber">{due === 0 ? "Due today" : `Due in ${due}d`}</Chip>
                  ) : c.nextVisitDueAt ? (
                    <span className="text-xs text-white/50">{formatShortDate(c.nextVisitDueAt)}</span>
                  ) : (
                    <span className="text-white/20">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-lg font-bold tabular-nums text-white">{c.quantityOnHand}</td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-white/60 2xl:table-cell">
                  {formatCents(c.totalSettledCents, c.currency)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {!closed && (
                    <div className="flex items-center justify-end gap-1">
                      {onSettle && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onSettle(row); }}
                          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white"
                          style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }}>
                          <Handshake className="h-3.5 w-3.5" /> Settle
                        </button>
                      )}
                      {onRestock && (
                        <button type="button" title="Restock" aria-label="Restock" onClick={(e) => { e.stopPropagation(); onRestock(row); }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white">
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onReturn && (
                        <button type="button" title="Take back" aria-label="Take back" onClick={(e) => { e.stopPropagation(); onReturn(row); }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white">
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
