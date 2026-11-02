// The selling buttons of a visit in progress, one verb each: count and bill what is on the shelf here (first, because
// that is why the rep came back), a new sale, leave stock. Each opens its own dialog, linked to the visit.

import { useState } from "react";
import { Handshake, Package, PackagePlus } from "lucide-react";
import { VisitAction } from "../VisitAction";
import { AdjustDialog, DepositDialog, SettleDialog } from "./ConsignmentDialogs";
import { SaleDialog } from "./SaleDialog";
import { useLeadSalesSnapshot, type ConsignmentWithRefs } from "../../hooks/useSalesModule";
import { useLeadAccess, type LeadOwnership } from "../../leadAccess";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

export function VisitSaleActions({ lead, visitId, saleOpen, onSaleOpenChange }: {
  lead: LeadOwnership & { id: number; name: string };
  visitId: number;
  /** The new-sale dialog is controlled by the visit screen, which also opens it when "Sale made" is chosen with no sale. */
  saleOpen: boolean;
  onSaleOpenChange: (open: boolean) => void;
}) {
  const t = useT(salesModuleMessages);
  // A sale or stock is filed under the company's organization; outside it the server refuses.
  const canRecord = useLeadAccess(lead).records;
  const snapshot = useLeadSalesSnapshot(lead.id);
  const consignments = snapshot.data?.activeConsignments ?? [];
  const refresh = () => snapshot.refetch();
  const [depositOpen, setDepositOpen] = useState(false);
  const [settleRow, setSettleRow] = useState<ConsignmentWithRefs | null>(null);
  const [correct, setCorrect] = useState<{ row: ConsignmentWithRefs; delta: number } | null>(null);

  return (
    <>
      {consignments.map((row) => (
        <VisitAction
          key={row.consignment.id}
          className="col-span-2"
          icon={Handshake}
          tone="emerald"
          title={`${t("actionSettle")} · ${t("onShelfN", { count: row.consignment.quantityOnHand })}`}
          hint={row.product?.name}
          disabled={!canRecord}
          onClick={() => setSettleRow(row)}
          testId={`visit-count-and-bill-${row.consignment.id}`}
        />
      ))}
      <VisitAction icon={Package} tone="emerald" title={t("newSale")} disabled={!canRecord} onClick={() => onSaleOpenChange(true)} testId="visit-new-sale" />
      <VisitAction icon={PackagePlus} tone="emerald" title={t("leaveStock")} disabled={!canRecord} onClick={() => setDepositOpen(true)} testId="visit-leave-stock" />

      <SaleDialog open={saleOpen} onOpenChange={onSaleOpenChange} leadId={lead.id} leadName={lead.name} visitId={visitId} onDone={refresh} />
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} leadId={lead.id} leadName={lead.name} visitId={visitId} existing={consignments} onDone={refresh} />
      <SettleDialog
        open={Boolean(settleRow)} onOpenChange={(o) => !o && setSettleRow(null)}
        row={settleRow} visitId={visitId} onDone={refresh}
        onCorrectStock={(row, delta) => { setSettleRow(null); setCorrect({ row, delta }); }}
      />
      <AdjustDialog
        open={Boolean(correct)} onOpenChange={(o) => !o && setCorrect(null)}
        row={correct?.row ?? null} initialDelta={correct?.delta} visitId={visitId} onDone={refresh}
      />
    </>
  );
}
