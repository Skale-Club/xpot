// The sales panel for one company. Drops into the active-visit card during a
// check-in (visitId set, so everything is linked to the visit) and into the
// company card outside a visit.
//
// This is the surface the whole module exists for: sell here, leave stock here,
// settle here.

import { useState } from "react";
import { Package, PackagePlus, TrendingUp } from "lucide-react";
import { formatCents, formatShortDate } from "../../utils";
import { useLeadSalesSnapshot, type ConsignmentWithRefs } from "../../hooks/useSalesModule";
import { SaleDialog } from "./SaleDialog";
import { DepositDialog, SettleDialog, ReturnDialog } from "./ConsignmentDialogs";
import { ConsignmentCard } from "./cards";
import { SectionLabel } from "./ui";

export function LeadSalesPanel({
  leadId, leadName, visitId, compact,
}: {
  leadId: number;
  leadName?: string;
  visitId?: number | null;
  /** Inside the visit card: tighter, no section heading. */
  compact?: boolean;
}) {
  const snapshot = useLeadSalesSnapshot(leadId);
  const [saleOpen, setSaleOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [settleRow, setSettleRow] = useState<ConsignmentWithRefs | null>(null);
  const [returnRow, setReturnRow] = useState<ConsignmentWithRefs | null>(null);

  const data = snapshot.data;
  const consignments = data?.activeConsignments ?? [];
  const refresh = () => snapshot.refetch();

  return (
    <div className="space-y-3">
      {!compact && <SectionLabel>Sales</SectionLabel>}

      {/* Lifetime with this company */}
      <div className="flex items-stretch gap-2">
        <div className="flex-1 rounded-2xl px-3.5 py-3"
          style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Sold here</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-emerald-400">
            {formatCents(data?.lifetimeCents ?? 0)}
          </div>
          <div className="text-[10px] text-white/35">
            {data?.salesCount ?? 0} {data?.salesCount === 1 ? "sale" : "sales"}
            {data?.lastSaleAt ? ` · last ${formatShortDate(data.lastSaleAt)}` : ""}
          </div>
        </div>
        <div className="flex-1 rounded-2xl px-3.5 py-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">You kept</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-white">
            {formatCents(data?.lifetimeProfitCents ?? 0)}
          </div>
          <div className="text-[10px] text-white/35">after production cost</div>
        </div>
      </div>

      {/* The two actions */}
      <div className="flex gap-2">
        <button type="button" onClick={() => setSaleOpen(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] touch-manipulation"
          style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }}>
          <Package className="h-4 w-4" /> New sale
        </button>
        <button type="button" onClick={() => setDepositOpen(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 touch-manipulation"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <PackagePlus className="h-4 w-4" /> Leave stock
        </button>
      </div>

      {/* Stock sitting here */}
      {consignments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            <TrendingUp className="h-3 w-3" /> On consignment here
          </div>
          {consignments.map((row) => (
            <ConsignmentCard
              key={row.consignment.id}
              row={row}
              compact
              onSettle={() => setSettleRow(row)}
              onRestock={() => setDepositOpen(true)}
              onReturn={() => setReturnRow(row)}
            />
          ))}
        </div>
      )}

      <SaleDialog
        open={saleOpen} onOpenChange={setSaleOpen}
        leadId={leadId} leadName={leadName} visitId={visitId} onDone={refresh}
      />
      <DepositDialog
        open={depositOpen} onOpenChange={setDepositOpen}
        leadId={leadId} leadName={leadName} visitId={visitId}
        existing={consignments} onDone={refresh}
      />
      <SettleDialog
        open={Boolean(settleRow)} onOpenChange={(o) => !o && setSettleRow(null)}
        row={settleRow} visitId={visitId} onDone={refresh}
      />
      <ReturnDialog
        open={Boolean(returnRow)} onOpenChange={(o) => !o && setReturnRow(null)}
        row={returnRow} visitId={visitId} onDone={refresh}
      />
    </div>
  );
}
