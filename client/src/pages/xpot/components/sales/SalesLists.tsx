// The Sales and Consignments sub-tabs: browse what was sold and what is out
// on other people's shelves.

import { useState } from "react";
import { Package, PackagePlus, XCircle } from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { formatCents } from "../../utils";
import { useLeads } from "../../hooks/useLeads";
import {
  useSalesList, useConsignments, useConsignmentDetail, useSalesMutations,
  PAYMENT_METHODS, type ConsignmentWithRefs, type PaymentMethod, type PaymentStatus, type SaleWithItems,
} from "../../hooks/useSalesModule";
import { SaleCard, ConsignmentCard, MovementLedger, SaleDetail } from "./cards";
import { SaleDialog } from "./SaleDialog";
import { DepositDialog, SettleDialog, ReturnDialog, AdjustDialog } from "./ConsignmentDialogs";
import { Field, GhostButton, MoneyInput, PrimaryButton, Select, SheetDialog, StatTile } from "./ui";

function LeadPickerDialog({
  open, onOpenChange, onPick, title,
}: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (lead: { id: number; name: string }) => void; title: string }) {
  const { leadsQuery } = useLeads();
  const [search, setSearch] = useState("");
  const leads = (leadsQuery.data ?? []).filter((l) => l.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies…"
          className="w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 focus:outline-none"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }} autoFocus />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {leads.length === 0 && <div className="px-3 py-6 text-center text-xs text-white/30">No companies found.</div>}
          {leads.slice(0, 40).map((lead) => (
            <button key={lead.id} type="button"
              onClick={() => { onPick({ id: lead.id, name: lead.name }); onOpenChange(false); setSearch(""); }}
              className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-white/85 transition-colors hover:bg-white/[0.06]"
              style={{ background: "rgba(255,255,255,0.03)" }}>
              {lead.name}
              {lead.industry ? <span className="ml-2 text-[11px] text-white/30">{lead.industry}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </SheetDialog>
  );
}

// ─── Sales list ──────────────────────────────────────────────────────────────

export function SalesList() {
  const [days, setDays] = useState<number | undefined>(90);
  const query = useSalesList({ days, limit: 100 });
  const [detail, setDetail] = useState<SaleWithItems | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<{ id: number; name: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5">
          {[{ v: 30, l: "30d" }, { v: 90, l: "90d" }, { v: undefined, l: "All" }].map(({ v, l }) => (
            <button key={l} type="button" onClick={() => setDays(v)}
              className="flex-1 rounded-xl py-1.5 text-xs font-semibold transition-all"
              style={days === v
                ? { background: "rgba(99,102,241,0.25)", color: "white", border: "1px solid rgba(99,102,241,0.4)" }
                : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {l}
            </button>
          ))}
        </div>
        <GhostButton onClick={() => setPickerOpen(true)}>
          <Package className="h-3.5 w-3.5" /> New
        </GhostButton>
      </div>

      {query.isLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>}

      {query.data?.length === 0 && !query.isLoading && (
        <div className="flex flex-col items-center gap-2 rounded-2xl py-10 text-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
          <Package className="h-6 w-6 text-white/20" />
          <div className="text-xs text-white/30">No sales recorded yet.</div>
        </div>
      )}

      <div className="space-y-2">
        {query.data?.map((row) => <SaleCard key={row.sale.id} row={row} onOpen={() => setDetail(row)} />)}
      </div>

      <LeadPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Sell to which company?" onPick={setTarget} />
      {target && (
        <SaleDialog open onOpenChange={(o) => { if (!o) setTarget(null); }} leadId={target.id} leadName={target.name} />
      )}
      <SaleDetailDialog row={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function SaleDetailDialog({ row, onClose }: { row: SaleWithItems | null; onClose: () => void }) {
  const { cancelSale, updatePayment } = useSalesMutations();
  const [editing, setEditing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [paidCents, setPaidCents] = useState(0);

  if (!row) return null;
  const { sale } = row;

  function startEditing() {
    setPaymentStatus(sale.paymentStatus as PaymentStatus);
    setPaymentMethod((sale.paymentMethod as PaymentMethod) ?? "");
    setPaidCents(sale.paidCents);
    setEditing(true);
  }

  return (
    <SheetDialog open onOpenChange={(o) => { if (!o) { setEditing(false); onClose(); } }} title={row.lead?.name ?? "Sale"}>
      <div className="space-y-4">
        <SaleDetail row={row} />

        {sale.status === "completed" && !editing && (
          <div className="flex gap-2">
            <GhostButton onClick={startEditing} className="flex-1">Update payment</GhostButton>
            {sale.kind === "direct" && (
              <GhostButton
                onClick={async () => { await cancelSale.mutateAsync({ id: sale.id }); onClose(); }}
                disabled={cancelSale.isPending}>
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </GhostButton>
            )}
          </div>
        )}

        {sale.kind === "consignment_settlement" && !editing && (
          <p className="text-[11px] text-white/30">
            This bill came from a stock settlement. To correct it, record an adjustment on the consignment.
          </p>
        )}

        {editing && (
          <div className="space-y-3 rounded-2xl p-3.5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Payment">
                <Select value={paymentStatus} onChange={(v) => setPaymentStatus(v as PaymentStatus)}
                  options={[{ value: "paid", label: "Paid" }, { value: "partial", label: "Partial" }, { value: "unpaid", label: "Unpaid" }]} />
              </Field>
              <Field label="Method">
                <Select value={paymentMethod} onChange={(v) => setPaymentMethod(v as PaymentMethod)} placeholder="—" options={PAYMENT_METHODS} />
              </Field>
            </div>
            {paymentStatus === "partial" && (
              <Field label="Amount received"><MoneyInput valueCents={paidCents} onChangeCents={setPaidCents} /></Field>
            )}
            <PrimaryButton tone="emerald" loading={updatePayment.isPending}
              onClick={async () => {
                await updatePayment.mutateAsync({
                  id: sale.id, paymentStatus,
                  paymentMethod: paymentMethod || null,
                  paidCents: paymentStatus === "partial" ? paidCents : undefined,
                });
                setEditing(false); onClose();
              }}>
              Save payment
            </PrimaryButton>
          </div>
        )}
      </div>
    </SheetDialog>
  );
}

// ─── Consignments list ───────────────────────────────────────────────────────

export function ConsignmentsList() {
  const [status, setStatus] = useState<"active" | "closed">("active");
  const query = useConsignments({ status });
  const [settleRow, setSettleRow] = useState<ConsignmentWithRefs | null>(null);
  const [returnRow, setReturnRow] = useState<ConsignmentWithRefs | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [depositTarget, setDepositTarget] = useState<{ id: number; name: string } | null>(null);

  const rows = query.data ?? [];
  const overdue = rows.filter((r) => r.consignment.nextVisitDueAt && new Date(r.consignment.nextVisitDueAt) < new Date());
  const rest = rows.filter((r) => !overdue.includes(r));
  const unitsOut = rows.reduce((sum, r) => sum + r.consignment.quantityOnHand, 0);
  const valueOut = rows.reduce((sum, r) => sum + r.consignment.quantityOnHand * r.consignment.unitPriceCents, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5">
          {(["active", "closed"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setStatus(v)}
              className="flex-1 rounded-xl py-1.5 text-xs font-semibold capitalize transition-all"
              style={status === v
                ? { background: "rgba(99,102,241,0.25)", color: "white", border: "1px solid rgba(99,102,241,0.4)" }
                : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {v}
            </button>
          ))}
        </div>
        <GhostButton onClick={() => setPickerOpen(true)}>
          <PackagePlus className="h-3.5 w-3.5" /> Leave
        </GhostButton>
      </div>

      {status === "active" && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Units out" value={unitsOut} sub={`${rows.length} agreements`} />
          <StatTile tone="indigo" label="If it all sells" value={formatCents(valueOut)} />
        </div>
      )}

      {query.isLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>}

      {rows.length === 0 && !query.isLoading && (
        <div className="flex flex-col items-center gap-2 rounded-2xl py-10 text-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
          <PackagePlus className="h-6 w-6 text-white/20" />
          <div className="text-xs text-white/30">
            {status === "active" ? "No stock out on consignment." : "Nothing closed yet."}
          </div>
        </div>
      )}

      {/* Overdue first — that is the reason to open this screen. */}
      {overdue.length > 0 && (
        <div className="space-y-2">
          <div className="px-1 text-xs font-semibold uppercase tracking-widest text-red-400/70">
            Settlement overdue
          </div>
          {overdue.map((row) => (
            <ConsignmentCard key={row.consignment.id} row={row}
              onSettle={() => setSettleRow(row)}
              onRestock={() => setDepositTarget({ id: row.consignment.leadId, name: row.lead?.name ?? "" })}
              onReturn={() => setReturnRow(row)}
              onOpen={() => setDetailId(row.consignment.id)} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {rest.map((row) => (
          <ConsignmentCard key={row.consignment.id} row={row}
            onSettle={status === "active" ? () => setSettleRow(row) : undefined}
            onRestock={status === "active" ? () => setDepositTarget({ id: row.consignment.leadId, name: row.lead?.name ?? "" }) : undefined}
            onReturn={status === "active" ? () => setReturnRow(row) : undefined}
            onOpen={() => setDetailId(row.consignment.id)} />
        ))}
      </div>

      <LeadPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Leave stock where?" onPick={setDepositTarget} />
      {depositTarget && (
        <DepositDialog open onOpenChange={(o) => { if (!o) setDepositTarget(null); }}
          leadId={depositTarget.id} leadName={depositTarget.name}
          existing={rows.filter((r) => r.consignment.leadId === depositTarget.id)} />
      )}
      <SettleDialog open={Boolean(settleRow)} onOpenChange={(o) => !o && setSettleRow(null)} row={settleRow} />
      <ReturnDialog open={Boolean(returnRow)} onOpenChange={(o) => !o && setReturnRow(null)} row={returnRow} />
      <ConsignmentDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function ConsignmentDetailDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const query = useConsignmentDetail(id);
  const { closeConsignment } = useSalesMutations();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const data = query.data;

  if (id == null) return null;

  return (
    <>
      <SheetDialog open onOpenChange={(o) => { if (!o) onClose(); }}
        title={data ? `${data.product?.name ?? "Stock"} — ${data.lead?.name ?? ""}` : "Consignment"}>
        {query.isLoading || !data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>
        ) : (
          <div className="space-y-4">
            <ConsignmentCard row={data} />

            <div className="flex gap-2">
              <GhostButton onClick={() => setAdjustOpen(true)} className="flex-1">Correct stock</GhostButton>
              {data.consignment.status === "active" && data.consignment.quantityOnHand === 0 && (
                <GhostButton disabled={closeConsignment.isPending}
                  onClick={async () => { await closeConsignment.mutateAsync(data.consignment.id); onClose(); }}>
                  Close
                </GhostButton>
              )}
            </div>

            <div className="space-y-2">
              <div className="px-1 text-xs font-semibold uppercase tracking-widest text-white/30">Ledger</div>
              <MovementLedger movements={data.movements} currency={data.consignment.currency} />
            </div>
          </div>
        )}
      </SheetDialog>
      <AdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} row={data ?? null} onDone={() => query.refetch()} />
    </>
  );
}
