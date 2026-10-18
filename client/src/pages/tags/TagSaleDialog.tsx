import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Package, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { useToast } from "@/hooks/use-toast";
import type { TagListItem } from "@shared/tagsApi";
import { computeSaleTotals, resolveUnitPriceCents } from "@shared/pricing";
import { saleCustomerConflict, suggestSaleCustomer } from "@shared/tagSales";
import { canManage, isSuperAdmin } from "@shared/modules";
import type { ProductWithTiers, PaymentMethod, PaymentStatus } from "@/pages/xpot/hooks/useSalesModule";
import { usePaymentOptions } from "@/pages/xpot/hooks/useSalesModule";
import type { FullSalesLead, XpotMeResponse } from "@/pages/xpot/types";
import { centsToInput, formatCents, inputToCents } from "@/pages/xpot/utils";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";
import { tagsMessages } from "@/i18n/messages/tags";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import LeadPicker, { type LeadChoice } from "./LeadPicker";
import { errorText, getSellTo, haptic, tagsGet, tagsPostIdempotent } from "./lib";
import { CARD, INPUT_ACCENT, SHEET_TITLE } from "./ui";

type PriceState = Record<number, { cents: number; manual: boolean }>;
type SaleResult = { sale: { id: number; totalCents: number }; pieces: Array<{ tagId: string }> };

/** Dollars in the kit's Input, cents in state (the sale's prices, discount and amount received). */
function MoneyInput({ valueCents, onChangeCents, id }: { valueCents: number; onChangeCents: (cents: number) => void; id?: string }) {
  const [text, setText] = useState(() => centsToInput(valueCents));
  const [lastCents, setLastCents] = useState(valueCents);
  // Re-sync the text when the outside value changes (the catalog price arrived).
  if (valueCents !== lastCents) {
    setLastCents(valueCents);
    setText(centsToInput(valueCents));
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/35">$</span>
      <Input
        id={id}
        value={text}
        inputMode="decimal"
        placeholder="0.00"
        onChange={(e) => {
          setText(e.target.value);
          const cents = inputToCents(e.target.value);
          setLastCents(cents);
          onChangeCents(cents);
        }}
        onBlur={() => setText(centsToInput(inputToCents(text)))}
        className={`pl-7 tabular-nums ${INPUT_ACCENT}`}
      />
    </div>
  );
}

function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatCents(cents)}</span>;
}

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
  const { toast } = useToast();
  const { statusOptions, methodOptions } = usePaymentOptions();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], enabled: open, retry: false });
  const catalog = useQuery<ProductWithTiers[]>({
    queryKey: ["/api/xpot/tags/catalog"],
    queryFn: () => tagsGet<ProductWithTiers[]>("/api/xpot/tags/catalog"),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  // One sale per piece, opened from that piece (like activating it).
  const available = useMemo(() => pieces.filter((piece) => !piece.saleId && piece.status !== "retired" && piece.stockStatus === "available"), [pieces]);
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
    const piece = initialTagId ? available.find((item) => item.id === initialTagId) : undefined;
    setSelected(new Set(piece ? [piece.id] : []));
    setLead(suggestSaleCustomer({
      piece: piece?.leadId ? { leadId: piece.leadId, name: piece.leadName ?? "", placeId: null } : null,
      sellingTo: sellTo ? { leadId: sellTo.leadId, name: sellTo.name, placeId: sellTo.placeId } : null,
      visit: visitLead ? { leadId: visitLead.id, name: visitLead.name, placeId: visitLead.googlePlaceId ?? null } : null,
    }));
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
  // A piece linked to another customer still opens that customer's link; selling it
  // to someone else would leave it there. The server refuses it, so say so up front.
  const conflict = lead ? saleCustomerConflict(selectedPieces, lead.leadId) : null;
  const canSubmit = Boolean(lead && selectedPieces.length && !conflict && !unmapped && !missingCost && !unconfiguredPolicy && !catalogUnavailable && !partialInvalid && totals.totalCents >= 0 && !busy);


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
      // The dialog closes on success: say so, like a sale recorded in Visits.
      toast({ title: ts("toastSaleRecorded"), variant: "success" });
    } catch (err) {
      setError(errorText(err, ts("toastSaleRecordFailed")));
    } finally {
      setBusy(false);
    }
  }

  const warning = (text: string) => <InlineAlert tone="warning">{text}</InlineAlert>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className={`${SHEET_TITLE} pr-10 text-left`}>{t("tagSaleTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <InlineAlert tone="error">{error}</InlineAlert>}

          <Field label={t("customerField")}>
            <LeadPicker value={lead} onChange={(value) => { setLead(value); setError(null); attempt.current = null; }} />
          </Field>

          {conflict && (
            <div data-testid="sale-customer-conflict">
              <InlineAlert
                tone="warning"
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => { setLead({ leadId: conflict.leadId!, name: conflict.leadName ?? "", placeId: null }); attempt.current = null; }}
                  >
                    {t("saleUseLinkedCustomer", { name: conflict.leadName || t("customerUnnamed") })}
                  </Button>
                }
              >
                {t("saleLinkedElsewhere", { code: conflict.publicCode, name: conflict.leadName || t("customerUnnamed") })}
              </InlineAlert>
            </div>
          )}

          {me?.activeVisit && lead?.leadId === me.activeVisit.leadId && (
            <InlineAlert tone="info" icon={Check}>{ts("linkedToVisit")}</InlineAlert>
          )}

          {selectedPieces.length === 0 ? (
            <EmptyState compact tone="tags" icon={Package} title={t("noPiecesToSell")} />
          ) : selectedPieces.map((piece) => (
            <div key={piece.id} className={`${CARD} flex items-center gap-3 px-3 py-2.5`} data-testid="sale-piece">
              <TagPieceMention
                publicCode={piece.publicCode}
                productType={piece.productType}
                face={piece.face}
                batchCode={piece.batchCode}
                className="min-w-0 flex-1"
              />
            </div>
          ))}

          {groups.map((group) => {
            const product = catalog.data?.find((item) => item.id === group.productId);
            return (
              <div key={group.productId} className={`${CARD} p-3`}>
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

          {/* Each block names who fixes it: batches are the global admin's, separation and the
              cost rule a manager's. The person who can act reads where; a rep reads who to ask. */}
          {unmapped > 0 && warning(t.plural(isSuperAdmin(me) ? "missingProductMappingAdmin" : "missingProductMapping", unmapped))}
          {missingCost > 0 && warning(t.plural(canManage(me) ? "missingAcquisitionCostManager" : "missingAcquisitionCost", missingCost))}
          {unconfiguredPolicy && warning(t(canManage(me) ? "unconfiguredCostPolicyManager" : "unconfiguredCostPolicy"))}
          {catalogUnavailable && warning(t("saleCatalogUnavailable"))}

          <div className={`space-y-3 rounded-2xl p-3.5 ${GLASS_SUBTLE_CLASS}`}>
            <div className="flex items-center justify-between text-xs text-white/45"><span>{ts("subtotal")}</span><Money cents={totals.subtotalCents} /></div>
            <Field label={ts("discount")}><MoneyInput valueCents={discountCents} onChangeCents={(value) => { setDiscountCents(value); attempt.current = null; }} /></Field>
            <div className="flex items-center justify-between border-t border-white/10 pt-2.5"><span className="font-semibold text-white">{ts("total")}</span><Money cents={totals.totalCents} className="text-lg font-bold text-emerald-300" /></div>
            <div className="flex items-center justify-between text-xs text-white/45"><span>{t("saleCost")}</span><Money cents={totals.costCents} /></div>
            <div className="flex items-center justify-between text-xs text-white/45"><span>{t("saleGrossProfit")}</span><Money cents={totals.profitCents} className="font-semibold text-white" /></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label={ts("payment")}>
              <Select value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value as PaymentStatus); attempt.current = null; }} options={statusOptions} className={INPUT_ACCENT} />
            </Field>
            <Field label={ts("method")}>
              <Select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value as PaymentMethod); attempt.current = null; }} placeholder="—" options={methodOptions} className={INPUT_ACCENT} />
            </Field>
          </div>
          {paymentStatus === "partial" && (
            <Field label={ts("amountReceived")} hint={partialInvalid ? t("partialPaymentHint") : undefined}>
              <MoneyInput valueCents={paidCents} onChangeCents={(value) => { setPaidCents(value); attempt.current = null; }} />
            </Field>
          )}
          <Field label={ts("notes")}>
            <Textarea value={notes} onChange={(event) => { setNotes(event.target.value); attempt.current = null; }} rows={2}
              placeholder={ts("notesPlaceholder")} className={`min-h-0 ${INPUT_ACCENT}`} />
          </Field>

          {/* The same money button as "Sell this piece" on the piece screen. */}
          <Button type="button" variant="money" size="lg" onClick={() => void submit()} disabled={!canSubmit} loading={busy} className="w-full">
            {selectedPieces.length > 1 ? <ShoppingCart className="!size-5" /> : <Package className="!size-5" />}
            {ts("recordSale", { amount: formatCents(totals.totalCents) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
