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
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { ErrorState } from "@/components/xpot/EmptyState";
import { Button } from "@/components/ui/button";
import { EYEBROW, GLASS_CLASS } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { salesMessages } from "@/i18n/messages/sales";
import { salesModuleMessages } from "@/i18n/messages/salesModule";
import { apiErrorMessages } from "@/i18n/messages/apiErrors";
import { useLeadAccess, type LeadOwnership } from "../../leadAccess";

export function LeadSalesPanel({
  leadId, leadName, lead, visitId, compact,
}: {
  leadId: number;
  leadName?: string;
  /** Its owner and organization: who may record a sale or leave stock here (leadAccess). */
  lead?: LeadOwnership;
  visitId?: number | null;
  /** Inside the visit card: tighter, no section heading. */
  compact?: boolean;
}) {
  const t = useT(salesModuleMessages);
  const ts = useT(salesMessages);
  const te = useT(apiErrorMessages);
  // A sale or stock is filed under the company's organization; outside it the server refuses.
  const canRecord = useLeadAccess(lead).records;
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
      {!compact && <SectionLabel>{ts("tabSales")}</SectionLabel>}

      {/* Lifetime with this company; never a $0.00 placeholder while it loads. */}
      {snapshot.isLoading ? (
        <ListSkeleton rows={2} className="flex items-stretch gap-2" rowClassName="h-[76px] flex-1 rounded-2xl" testId="lead-sales-loading" />
      ) : snapshot.isError ? (
        <ErrorState compact dense message={t("companySalesLoadFailed")} onRetry={refresh} />
      ) : (
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] px-3.5 py-3">
          <div className={EYEBROW}>{t("soldHere")}</div>
          <div className="mt-0.5 truncate text-xl font-bold tabular-nums text-emerald-300">
            {formatCents(data?.lifetimeCents ?? 0)}
          </div>
          <div className="text-[11px] text-white/40">
            {t.plural("salesCount", data?.salesCount ?? 0)}
            {data?.lastSaleAt ? ` · ${t("lastSale", { date: formatShortDate(data.lastSaleAt) })}` : ""}
          </div>
        </div>
        <div className={`min-w-0 flex-1 rounded-2xl px-3.5 py-3 ${GLASS_CLASS}`}>
          <div className={EYEBROW}>{t("youKept")}</div>
          <div className="mt-0.5 truncate text-xl font-bold tabular-nums text-white">
            {formatCents(data?.lifetimeProfitCents ?? 0)}
          </div>
          <div className="text-[11px] text-white/40">{t("afterProductionCost")}</div>
        </div>
      </div>
      )}

      {/* The two actions */}
      <div className="flex gap-2">
        <Button type="button" variant="money" onClick={() => setSaleOpen(true)} disabled={!canRecord} className="flex-1">
          <Package aria-hidden="true" /> {t("newSale")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setDepositOpen(true)} disabled={!canRecord} className="flex-1">
          <PackagePlus aria-hidden="true" /> {t("leaveStock")}
        </Button>
      </div>
      {!canRecord ? <p className="text-xs text-white/45" data-testid="lead-sales-other-organization">{te("srv_lead_other_organization")}</p> : null}

      {/* Stock sitting here */}
      {consignments.length > 0 && (
        <div className="space-y-2">
          <div className={`flex items-center gap-1.5 px-1 ${EYEBROW}`}>
            <TrendingUp className="h-3 w-3" aria-hidden="true" /> {t("onConsignmentHere")}
          </div>
          {consignments.map((row) => (
            <ConsignmentCard
              key={row.consignment.id}
              row={row}
              compact
              onSettle={() => setSettleRow(row)}
              onRestock={canRecord ? () => setDepositOpen(true) : undefined}
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
