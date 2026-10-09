import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Package, ShoppingCart } from "lucide-react";
import type { TagListItem } from "@shared/tagsApi";
import { computeSaleTotals, resolveUnitPriceCents } from "@shared/pricing";
import type { ProductWithTiers, PaymentMethod, PaymentStatus } from "@/pages/xpot/hooks/useSalesModule";
import { usePaymentOptions } from "@/pages/xpot/hooks/useSalesModule";
import type { FullSalesLead, XpotMeResponse } from "@/pages/xpot/types";
import { formatCents } from "@/pages/xpot/utils";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";
import { tagsMessages } from "@/i18n/messages/tags";
import { TagModelChips, TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import LeadPicker, { type LeadChoice } from "./LeadPicker";
import { errorText, getSellTo, haptic, tagsGet, tagsPostIdempotent } from "./lib";
import { Field, Money, MoneyInput, PrimaryButton, Select, SheetDialog, inputStyle } from "@/pages/xpot/components/sales/ui";

type PriceState = Record<number, { cents: number; manual: boolean }>;
type SaleResult = { sale: { id: number; totalCents: number }; pieces: Array<{ tagId: string }> };

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `tag-sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function TagSaleDialog({
  open,
  onOpenChange,
  pieces,
  initialTagId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pieces: TagListItem[];
  initialTagId?: string;
}) {
  const t = useT(tagsMessages);
  const ts = useT(salesModuleMessages);
  const qc = useQueryClient();
  const { statusOptions, methodOptions } = usePaymentOptions();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], enabled: open, retry: false });
  const catalog = useQuery<ProductWithTiers[]>({
    queryKey: ["/api/xpot/tags/catalog"],
    queryFn: () => tagsGet<ProductWithTiers[]>("/api/xpot/tags/catalog"),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  // One sale per piece, opened from that piece (like activating it).
  const available = useMemo(() => pieces.filter((piece) => !piece.saleId && piece.status !== "retired"), [pieces]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lead, setLead] = useState<LeadChoice>(null);
  const [prices, setPrices] = useState<PriceState>({});
  const [discountCents, setDiscountCents] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("cash");
  const [paidCents, setPaidCents] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const visitLead = me?.activeVisit?.lead;
    const sellTo = getSellTo();
    const suggested = visitLead
      ? { leadId: visitLead.id, name: visitLead.name, placeId: visitLead.googlePlaceId ?? null }
      : sellTo
        ? { leadId: sellTo.leadId, name: sellTo.name, placeId: sellTo.placeId }
        : null;
    // Selling one piece that already has a customer: that customer, unless a visit says otherwise.
    const pieceLead = initialTagId ? available.find((piece) => piece.id === initialTagId) : undefined;
    const fromPiece = pieceLead?.leadId && pieceLead.leadName ? { leadId: pieceLead.leadId, name: pieceLead.leadName, placeId: null } : null;
    setSelected(new Set(initialTagId && available.some((piece) => piece.id === initialTagId) ? [initialTagId] : []));
    setLead(suggested ?? fromPiece);
    setPrices({});
    setDiscountCents(0);
    setPaymentStatus("paid");
    setPaymentMethod("cash");
    setPaidCents(0);
    setNotes("");
    setError(null);
    attempt.current = null;
  }, [open, initialTagId, me?.activeVisit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPieces = useMemo(() => available.filter((piece) => selected.has(piece.id)), [available, selected]);
  const groups = useMemo(() => {
    const grouped = new Map<number, TagListItem[]>();
    for (const piece of selectedPieces) {
      if (!piece.salesProductId) continue;
      const current = grouped.get(piece.salesProductId) ?? [];
      current.push(piece);
      grouped.set(piece.salesProductId, current);
    }
    return Array.from(grouped, ([productId, tags]) => ({ productId, tags }));
  }, [selectedPieces]);
  const groupSignature = groups.map((group) => `${group.productId}:${group.tags.length}`).join("|");

  useEffect(() => {
    if (!open || !catalog.data) return;
    setPrices((current) => {
      const next = { ...current };
      let changed = false;
      for (const group of groups) {
        if (next[group.productId]?.manual) continue;
        const product = catalog.data.find((item) => item.id === group.productId);
        if (!product) continue;
        const cents = resolveUnitPriceCents(product.basePriceCents, product.tiers, group.tags.length);
        if (next[group.productId]?.cents !== cents) {
          next[group.productId] = { cents, manual: false };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [catalog.data, groupSignature, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const unmapped = selectedPieces.filter((piece) => !piece.salesProductId).length;
  const missingCost = me?.rep.costPolicy === "acquisition"
    ? selectedPieces.filter((piece) => piece.acquisitionCostCents == null).length
    : 0;
  const unconfiguredPolicy = me ? !me.rep.costPolicyConfiguredAt : false;
  const catalogUnavailable = selectedPieces.length > 0 && (
    catalog.isError || !catalog.data || groups.some((group) => !catalog.data.some((product) => product.id === group.productId))
  );
  const lineInputs = groups.map((group) => ({
    quantity: group.tags.length,
    unitPriceCents: prices[group.productId]?.cents ?? 0,
    unitCostCents: me?.rep.costPolicy === "zero"
      ? 0
      : group.tags.reduce((sum, piece) => sum + (piece.acquisitionCostCents ?? 0), 0) / group.tags.length,
  }));
  const totals = computeSaleTotals(lineInputs, discountCents);
  const partialInvalid = paymentStatus === "partial" && (paidCents <= 0 || paidCents >= totals.totalCents);
  const canSubmit = Boolean(lead && selectedPieces.length && !unmapped && !missingCost && !unconfiguredPolicy && !catalogUnavailable && !partialInvalid && totals.totalCents >= 0 && !busy);


  async function resolveLeadId(): Promise<number> {
    if (!lead) throw new Error(t("chooseCustomer"));
    if (lead.leadId) return lead.leadId;
    const response = await apiRequest("POST", "/api/xpot/leads", { name: lead.name, source: "tag_sale", status: "lead" });
    const created = await response.json() as { lead: FullSalesLead };
    await qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
    setLead({ leadId: created.lead.id, name: created.lead.name, placeId: created.lead.googlePlaceId ?? null });
    return created.lead.id;
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const leadId = await resolveLeadId();
      const visitId = me?.activeVisit?.leadId === leadId ? me.activeVisit.id : null;
      const body = {
        leadId,
        visitId,
        lines: groups.map((group) => ({
          salesProductId: group.productId,
          tagIds: group.tags.map((piece) => piece.id),
          unitPriceCents: prices[group.productId]?.cents ?? 0,
        })),
        discountCents: discountCents || undefined,
        paymentStatus,
        paymentMethod: paymentMethod || null,
        paidCents: paymentStatus === "partial" ? paidCents : undefined,
        notes: notes.trim() || null,
      };
      const signature = JSON.stringify(body);
      if (!attempt.current || attempt.current.signature !== signature) {
        attempt.current = { signature, key: newIdempotencyKey() };
      }
      await tagsPostIdempotent<SaleResult>("/api/xpot/tag-sales", body, attempt.current.key);
      haptic([40, 30, 60]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tags", "list"] }),
        qc.invalidateQueries({ queryKey: ["tags", "piece"] }),
        qc.invalidateQueries({ queryKey: ["/api/xpot/tags/summary"] }),
        qc.invalidateQueries({ queryKey: ["/api/xpot/tags/by-lead"] }),
        qc.invalidateQueries({ queryKey: ["/api/xpot/sales"] }),
        qc.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] }),
        qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] }),
      ]);
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err, ts("toastSaleRecordFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={t("tagSaleTitle")} wide>
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>}

        <Field label={t("customerField")}>
          <LeadPicker value={lead} onChange={(value) => { setLead(value); setError(null); attempt.current = null; }} />
        </Field>

        {me?.activeVisit && lead?.leadId === me.activeVisit.leadId && (
          <div className="flex items-center gap-2 rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
            <Check className="h-4 w-4" /> {ts("linkedToVisit")}
          </div>
        )}

        {selectedPieces.length === 0 ? (
          <p className="rounded-2xl border border-white/10 px-4 py-6 text-center text-sm text-white/45">{t("noPiecesToSell")}</p>
        ) : selectedPieces.map((piece) => (
          <div key={piece.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2.5" data-testid="sale-piece">
            <TagPieceVisual productType={piece.productType} face={piece.face} />
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-sm font-semibold tracking-wider text-white">{piece.publicCode}</span>
              <TagModelChips productType={piece.productType} face={piece.face} batchCode={piece.batchCode} className="mt-1" />
            </span>
          </div>
        ))}

        {groups.map((group) => {
          const product = catalog.data?.find((item) => item.id === group.productId);
          return (
            <div key={group.productId} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-white">{product?.name ?? t("unknownSaleProduct")}</span>
                <span className="shrink-0 text-xs text-white/40">{t.plural("salePiecesSelected", group.tags.length)}</span>
              </div>
              <Field label={ts("unitPrice")} hint={prices[group.productId]?.manual ? undefined : ts("hintCatalog")}>
                <MoneyInput valueCents={prices[group.productId]?.cents ?? 0} onChangeCents={(cents) => {
                  setPrices((current) => ({ ...current, [group.productId]: { cents, manual: true } }));
                  attempt.current = null;
                }} />
              </Field>
            </div>
          );
        })}

        {unmapped > 0 && <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{t.plural("missingProductMapping", unmapped)}</p>}
        {missingCost > 0 && <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{t.plural("missingAcquisitionCost", missingCost)}</p>}
        {unconfiguredPolicy && <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{t("unconfiguredCostPolicy")}</p>}
        {catalogUnavailable && <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{t("saleCatalogUnavailable")}</p>}

        <div className="space-y-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-3.5">
          <div className="flex items-center justify-between text-xs text-white/45"><span>{ts("subtotal")}</span><Money cents={totals.subtotalCents} /></div>
          <Field label={ts("discount")}><MoneyInput valueCents={discountCents} onChangeCents={(value) => { setDiscountCents(value); attempt.current = null; }} /></Field>
          <div className="flex items-center justify-between border-t border-white/10 pt-2.5"><span className="font-semibold text-white">{ts("total")}</span><Money cents={totals.totalCents} className="text-lg font-bold text-emerald-300" /></div>
          <div className="flex items-center justify-between text-xs text-white/45"><span>{t("saleCost")}</span><Money cents={totals.costCents} /></div>
          <div className="flex items-center justify-between text-xs text-white/45"><span>{t("saleGrossProfit")}</span><Money cents={totals.profitCents} className="font-semibold text-white" /></div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={ts("payment")}><Select value={paymentStatus} onChange={(value) => { setPaymentStatus(value as PaymentStatus); attempt.current = null; }} options={statusOptions} /></Field>
          <Field label={ts("method")}><Select value={paymentMethod} onChange={(value) => { setPaymentMethod(value as PaymentMethod); attempt.current = null; }} placeholder="—" options={methodOptions} /></Field>
        </div>
        {paymentStatus === "partial" && (
          <Field label={ts("amountReceived")} hint={partialInvalid ? t("partialPaymentHint") : undefined}>
            <MoneyInput valueCents={paidCents} onChangeCents={(value) => { setPaidCents(value); attempt.current = null; }} />
          </Field>
        )}
        <Field label={ts("notes")}>
          <textarea value={notes} onChange={(event) => { setNotes(event.target.value); attempt.current = null; }} rows={2}
            placeholder={ts("notesPlaceholder")} className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none" style={inputStyle} />
        </Field>

        <PrimaryButton tone="emerald" onClick={submit} disabled={!canSubmit} loading={busy}>
          {selectedPieces.length > 1 ? <ShoppingCart className="h-4 w-4" /> : <Package className="h-4 w-4" />}
          {ts("recordSale", { amount: formatCents(totals.totalCents) })}
        </PrimaryButton>
      </div>
    </SheetDialog>
  );
}
