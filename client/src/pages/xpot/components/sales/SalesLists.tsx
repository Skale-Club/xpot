// The Sales and Consignments sub-tabs: browse what was sold and what is out
// on other people's shelves.

import { useState, type ReactNode } from "react";
import { MousePointerClick, Package, PackagePlus, Tag, X, XCircle } from "lucide-react";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { SalesTable, ConsignmentsTable } from "./tables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/xpot/Field";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { EYEBROW, GLASS_CLASS } from "@/components/xpot/surface";
import { salesMessages } from "@/i18n/messages/sales";
import { formatCents } from "../../utils";
import { useLeads } from "../../hooks/useLeads";
import {
  useConsignments, useConsignmentDetail, useSalesMutations,
  usePaymentOptions, type ConsignmentWithRefs, type PaymentMethod, type PaymentStatus, type SaleWithItems,
} from "../../hooks/useSalesModule";
import { SaleCard, ConsignmentCard, MovementLedger, SaleDetail } from "./cards";
import { consignmentDue } from "./consignmentDue";
import { SaleDialog } from "./SaleDialog";
import { FilterBar, FilterChips, FilterSelect } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, useOffsetPages, usePagedList } from "@/components/xpot/pagination";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { DepositDialog, SettleDialog, ReturnDialog, AdjustDialog } from "./ConsignmentDialogs";
import { Field, MoneyInput, PrimaryButton, Select, SheetDialog, StatTile } from "./ui";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

function LeadPickerDialog({
  open, onOpenChange, onPick, title,
}: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (lead: { id: number; name: string }) => void; title: string }) {
  const t = useT(salesModuleMessages);
  const { leadsQuery } = useLeads();
  const [search, setSearch] = useState("");
  const leads = (leadsQuery.data ?? []).filter((l) => l.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchCompanies")} aria-label={t("searchCompanies")} autoFocus />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {leadsQuery.isLoading ? <ListSkeleton rows={4} rowClassName="h-11 rounded-xl" className="space-y-1" /> : null}
          {!leadsQuery.isLoading && leads.length === 0 && <EmptyState compact dense icon={Package} title={t("noCompaniesFound")} />}
          {leads.slice(0, 40).map((lead) => (
            <button key={lead.id} type="button"
              onClick={() => { onPick({ id: lead.id, name: lead.name }); onOpenChange(false); setSearch(""); }}
              className={`min-h-11 w-full rounded-xl px-3 py-2.5 text-left text-sm text-white/85 transition-colors hover:bg-white/[0.06] ${GLASS_CLASS}`}>
              {lead.name}
              {lead.industry ? <span className="ml-2 text-[11px] text-white/40">{lead.industry}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </SheetDialog>
  );
}

/** The desktop side pane around a sale or a consignment. */
function DetailCard({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const tc = useT(commonMessages);
  return (
    <div className={`overflow-hidden rounded-2xl ${GLASS_CLASS}`}>
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{title}</h2>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={tc("close")} title={tc("close")} className="-mr-2 text-white/45">
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function PickPlaceholder({ what }: { what: "sale" | "consignment" }) {
  const t = useT(salesModuleMessages);
  return <EmptyState icon={MousePointerClick} title={what === "sale" ? t("pickSale") : t("pickConsignment")} hint={t("pickHint")} />;
}

// ─── Sales list ──────────────────────────────────────────────────────────────

export function SalesList({ selectedId = null, onSelect }: {
  /** Desktop: the sale shown beside the list (from the URL). */
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
}) {
  const t = useT(salesModuleMessages);
  const tc = useT(commonMessages);
  const ts = useT(salesMessages);
  // ?period=30|90|all&origin=tags
  const filters = useUrlFilters({ period: "90", origin: "" });
  const period = (["30", "90", "all"] as const).find((value) => value === filters.values.period) ?? "90";
  const days = period === "all" ? undefined : Number(period);
  const source = filters.values.origin === "tags" ? "tags" : "";
  // 50 sales at a time; older ones load as you reach the end of the list.
  const salesPages = useOffsetPages<SaleWithItems>({
    queryKey: ["/api/xpot/sales", "list", { days, source }],
    url: (offset, limit) => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (days) params.set("days", String(days));
      if (source) params.set("source", source);
      return `/api/xpot/sales?${params}`;
    },
  });
  // A failed first page is an error, never "No sales yet".
  const failed = Boolean(salesPages.error) && salesPages.items.length === 0;
  const query = { data: salesPages.isLoading || failed ? undefined : salesPages.items, isLoading: salesPages.isLoading };
  const salesPager = <ListPager shown={salesPages.items.length} hasMore={salesPages.hasMore} onMore={salesPages.loadMore} loading={salesPages.loadingMore} />;
  const [detail, setDetail] = useState<SaleWithItems | null>(null);
  const isDesktop = useIsDesktop() && Boolean(onSelect);
  const selected = selectedId != null ? query.data?.find((r) => r.sale.id === selectedId) ?? null : null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<{ id: number; name: string } | null>(null);

  return (
    <div className="space-y-4">
      <FilterBar
        testId="sales-filters"
        controls={
          <FilterSelect
            value={source}
            onChange={(origin) => filters.set({ origin })}
            placeholder={t("allOrigins")}
            icon={Tag}
            options={[{ value: "tags", label: t("tagsOrigin") }]}
          />
        }
        actions={
          <Button type="button" variant="money" onClick={() => setPickerOpen(true)}>
            <Package aria-hidden="true" /> {t("newShort")}
          </Button>
        }
        secondary={
          <FilterChips
            items={[
              { id: "30", label: t("daysShort", { days: 30 }) },
              { id: "90", label: t("daysShort", { days: 90 }) },
              { id: "all", label: t("rangeAll") },
            ]}
            value={period}
            onChange={(next) => filters.set({ period: next })}
            ariaLabel={t("periodLabel")}
          />
        }
        summary={{ shown: query.data?.length ?? 0, active: filters.activeCount() > 0, onClear: () => filters.reset() }}
      />

      {query.isLoading && <ListSkeleton rows={4} testId="sales-loading" />}
      {failed && <ErrorState message={ts("listLoadFailed")} onRetry={() => void salesPages.refetch()} />}

      {query.data?.length === 0 && !query.isLoading && !(isDesktop && selectedId != null) && (
        <EmptyState compact icon={Package} title={t("noSalesYet")} />
      )}

      {isDesktop ? (
        ((query.data?.length ?? 0) > 0 || selectedId != null) && (
          <MasterDetail
            closeLabel={tc("close")}
            onClose={() => onSelect!(null)}
            list={query.data?.length ? (
              <>
                <SalesTable rows={query.data} selectedId={selectedId} onSelect={(row) => onSelect!(row.sale.id)} />
                {salesPager}
              </>
            ) : (
              <EmptyState compact icon={Package} title={t("noSalesYet")} />
            )}
            detail={selectedId == null ? null : selected ? (
              <DetailCard title={selected.lead?.name ?? t("saleFallback")} onClose={() => onSelect!(null)}>
                <SaleDetailBody key={selected.sale.id} row={selected} onDone={() => onSelect!(null)} />
              </DetailCard>
            ) : query.isLoading ? null : (
              <EmptyState compact icon={Package} title={t("saleNotInList")} />
            )}
            placeholder={<PickPlaceholder what="sale" />}
          />
        )
      ) : (
        <div className="space-y-2">
          {query.data?.map((row) => <SaleCard key={row.sale.id} row={row} onOpen={() => setDetail(row)} />)}
          {salesPager}
        </div>
      )}

      <LeadPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title={t("sellToWhich")} onPick={setTarget} />
      {target && (
        <SaleDialog open onOpenChange={(o) => { if (!o) setTarget(null); }} leadId={target.id} leadName={target.name} />
      )}
      <SaleDetailDialog row={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function SaleDetailDialog({ row, onClose }: { row: SaleWithItems | null; onClose: () => void }) {
  const t = useT(salesModuleMessages);
  if (!row) return null;
  return (
    <SheetDialog open onOpenChange={(o) => { if (!o) onClose(); }} title={row.lead?.name ?? t("saleFallback")}>
      <SaleDetailBody row={row} onDone={onClose} />
    </SheetDialog>
  );
}

/** A sale's lines and payment, with update/cancel. `onDone` runs after a change that closes it. */
function SaleDetailBody({ row, onDone }: { row: SaleWithItems; onDone: () => void }) {
  const onClose = onDone;
  const t = useT(salesModuleMessages);
  const { statusOptions, methodOptions } = usePaymentOptions();
  const { cancelSale, updatePayment } = useSalesMutations();
  const [editing, setEditing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [paidCents, setPaidCents] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { sale } = row;

  function startEditing() {
    setPaymentStatus(sale.paymentStatus as PaymentStatus);
    setPaymentMethod((sale.paymentMethod as PaymentMethod) ?? "");
    setPaidCents(sale.paidCents);
    setEditing(true);
  }

  return (
      <div className="space-y-4">
        <SaleDetail row={row} />

        {sale.status === "completed" && !editing && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={startEditing} className="flex-1">{t("updatePayment")}</Button>
            {sale.kind === "direct" && (
              <Button type="button" variant="ghost" onClick={() => setConfirmCancel(true)} disabled={cancelSale.isPending} className="text-red-300 hover:bg-red-500/[0.08] hover:text-red-200">
                <XCircle aria-hidden="true" /> {t("cancelSale")}
              </Button>
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          title={t("cancelSaleTitle")}
          description={t("cancelSaleDesc")}
          confirmLabel={t("cancelSale")}
          cancelLabel={t("keepSale")}
          destructive
          pending={cancelSale.isPending}
          onConfirm={async () => { await cancelSale.mutateAsync({ id: sale.id }); onClose(); }}
          testId="button-confirm-cancel-sale"
        />

        {sale.kind === "consignment_settlement" && !editing && (
          <p className="text-xs text-white/40">{t("settlementBillNote")}</p>
        )}

        {editing && (
          <div className={`space-y-3 rounded-2xl p-3.5 ${GLASS_CLASS}`}>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("payment")}>
                <Select value={paymentStatus} onChange={(v) => setPaymentStatus(v as PaymentStatus)}
                  options={statusOptions} />
              </Field>
              <Field label={t("method")}>
                <Select value={paymentMethod} onChange={(v) => setPaymentMethod(v as PaymentMethod)} placeholder="—" options={methodOptions} />
              </Field>
            </div>
            {paymentStatus === "partial" && (
              <Field label={t("amountReceived")}><MoneyInput valueCents={paidCents} onChangeCents={setPaidCents} currency={sale.currency} /></Field>
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
              {t("savePayment")}
            </PrimaryButton>
          </div>
        )}
      </div>
  );
}

// ─── Consignments list ───────────────────────────────────────────────────────

export function ConsignmentsList({ selectedId = null, onSelect }: {
  /** Desktop: the consignment shown beside the list (from the URL). */
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
}) {
  const t = useT(salesModuleMessages);
  const tc = useT(commonMessages);
  const ts = useT(salesMessages);
  const isDesktop = useIsDesktop() && Boolean(onSelect);
  // ?state=closed
  const filters = useUrlFilters({ state: "active" });
  const status = filters.values.state === "closed" ? "closed" : "active";
  const query = useConsignments({ status });
  const [settleRow, setSettleRow] = useState<ConsignmentWithRefs | null>(null);
  const [returnRow, setReturnRow] = useState<ConsignmentWithRefs | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [depositTarget, setDepositTarget] = useState<{ id: number; name: string } | null>(null);

  const rows = query.data ?? [];
  // Same rule as the cards and the desktop table: never overdue once closed.
  const overdue = rows.filter((r) => consignmentDue(r.consignment).overdue);
  const rest = rows.filter((r) => !overdue.includes(r));
  // Overdue first, then the rest; long histories (closed) render 50 at a time.
  const ordered = [...overdue, ...rest];
  const pagedRows = usePagedList(ordered, {
    resetKey: status,
    keepIndex: selectedId == null ? -1 : ordered.findIndex((r) => r.consignment.id === selectedId),
  });
  const pagedRest = usePagedList(rest, { resetKey: status });
  const unitsOut = rows.reduce((sum, r) => sum + r.consignment.quantityOnHand, 0);
  const valueOut = rows.reduce((sum, r) => sum + r.consignment.quantityOnHand * r.consignment.unitPriceCents, 0);

  return (
    <div className="space-y-4">
      <FilterBar
        testId="consignments-filters"
        actions={
          <Button type="button" variant="secondary" onClick={() => setPickerOpen(true)}>
            <PackagePlus aria-hidden="true" /> {t("leaveShort")}
          </Button>
        }
        secondary={
          <FilterChips
            items={(["active", "closed"] as const).map((v) => ({ id: v, label: t(`status_${v}`) }))}
            value={status}
            onChange={(state) => filters.set({ state })}
            ariaLabel={t("statusLabel")}
          />
        }
      />

      {status === "active" && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:max-w-xl">
          <StatTile label={t("unitsOut")} value={unitsOut} sub={t.plural("agreements", rows.length)} />
          <StatTile label={t("ifAllSells")} value={formatCents(valueOut)} />
        </div>
      )}

      {query.isLoading && <ListSkeleton rows={4} testId="consignments-loading" />}
      {query.isError && <ErrorState message={ts("listLoadFailed")} onRetry={() => void query.refetch()} />}

      {rows.length === 0 && !query.isLoading && !query.isError && !(isDesktop && selectedId != null) && (
        <EmptyState compact icon={PackagePlus} title={status === "active" ? t("noStockOut") : t("nothingClosed")} />
      )}

      {isDesktop && (rows.length > 0 || selectedId != null) && (
        <MasterDetail
          closeLabel={tc("close")}
          onClose={() => onSelect!(null)}
          list={rows.length === 0 ? (
            <EmptyState compact icon={PackagePlus} title={status === "active" ? t("noStockOut") : t("nothingClosed")} />
          ) : (
            <>
            <ConsignmentsTable
              rows={pagedRows.visible}
              selectedId={selectedId}
              onSelect={(row) => onSelect!(row.consignment.id)}
              onSettle={status === "active" ? setSettleRow : undefined}
              onRestock={status === "active" ? (row) => setDepositTarget({ id: row.consignment.leadId, name: row.lead?.name ?? "" }) : undefined}
              onReturn={status === "active" ? setReturnRow : undefined}
            />
            <ListPager shown={pagedRows.shown} total={pagedRows.total} hasMore={pagedRows.hasMore} onMore={pagedRows.showMore} />
            </>
          )}
          detail={selectedId == null ? null : (
            <ConsignmentDetailBody key={selectedId} id={selectedId} onClose={() => onSelect!(null)} framed />
          )}
          placeholder={<PickPlaceholder what="consignment" />}
        />
      )}

      {/* Overdue first — that is the reason to open this screen. */}
      {!isDesktop && overdue.length > 0 && (
        <div className="space-y-2">
          <div className={`px-1 ${EYEBROW} !text-red-300`}>
            {t("settlementOverdue")}
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

      <div className={isDesktop ? "hidden" : "space-y-2"}>
        {!isDesktop && pagedRest.visible.map((row) => (
          <ConsignmentCard key={row.consignment.id} row={row}
            onSettle={status === "active" ? () => setSettleRow(row) : undefined}
            onRestock={status === "active" ? () => setDepositTarget({ id: row.consignment.leadId, name: row.lead?.name ?? "" }) : undefined}
            onReturn={status === "active" ? () => setReturnRow(row) : undefined}
            onOpen={() => setDetailId(row.consignment.id)} />
        ))}
        {!isDesktop && <ListPager shown={pagedRest.shown} total={pagedRest.total} hasMore={pagedRest.hasMore} onMore={pagedRest.showMore} />}
      </div>

      <LeadPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title={t("leaveStockWhere")} onPick={setDepositTarget} />
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
  const t = useT(salesModuleMessages);
  const query = useConsignmentDetail(id);
  const data = query.data;
  if (id == null) return null;
  return (
    <SheetDialog open onOpenChange={(o) => { if (!o) onClose(); }}
      title={data ? t("stockTitle", { product: data.product?.name ?? t("productFallback"), lead: data.lead?.name ?? "" }) : t("consignment")}>
      <ConsignmentDetailBody id={id} onClose={onClose} />
    </SheetDialog>
  );
}

/** One consignment: the card, corrections and its ledger. `framed` wraps it for the desktop pane. */
function ConsignmentDetailBody({ id, onClose, framed }: { id: number; onClose: () => void; framed?: boolean }) {
  const t = useT(salesModuleMessages);
  const query = useConsignmentDetail(id);
  const { closeConsignment } = useSalesMutations();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const data = query.data;

  const body = (
    <>
        {query.isError ? (
          <EmptyState compact icon={PackagePlus} title={t("consignmentNotFound")} />
        ) : query.isLoading || !data ? (
          <ListSkeleton rows={3} />
        ) : (
          <div className="space-y-4">
            <ConsignmentCard row={data} />

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setAdjustOpen(true)} className="flex-1">{t("correctStock")}</Button>
              {data.consignment.status === "active" && data.consignment.quantityOnHand === 0 && (
                <Button type="button" variant="secondary" disabled={closeConsignment.isPending} onClick={() => setConfirmClose(true)}>
                  {t("closeAgreement")}
                </Button>
              )}
            </div>
            <ConfirmDialog
              open={confirmClose}
              onOpenChange={setConfirmClose}
              title={t("closeAgreementTitle")}
              description={t("closeAgreementDesc")}
              confirmLabel={t("closeAgreement")}
              cancelLabel={t("keepOpen")}
              pending={closeConsignment.isPending}
              onConfirm={async () => { await closeConsignment.mutateAsync(data.consignment.id); onClose(); }}
            />

            <div className="space-y-2">
              <div className={`px-1 ${EYEBROW}`}>{t("ledger")}</div>
              <MovementLedger movements={data.movements} currency={data.consignment.currency} />
            </div>
          </div>
        )}
      <AdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} row={data ?? null} onDone={() => query.refetch()} />
    </>
  );

  return framed ? (
    <DetailCard title={data ? t("stockTitle", { product: data.product?.name ?? t("productFallback"), lead: data.lead?.name ?? "" }) : t("consignment")} onClose={onClose}>
      {body}
    </DetailCard>
  ) : body;
}
