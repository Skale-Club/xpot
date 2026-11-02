// Consignment: leave stock, settle it, take it back, correct it.
//
// The settlement dialog is the one that matters most — it is what the rep and
// the shop owner look at together across the counter. It computes with the same
// shared/pricing function the server uses, so the number on screen is the number
// that gets billed.

import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Handshake, Undo2, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeSettlement } from "#shared/pricing.js";
import { formatCents } from "../../utils";
import {
  useProducts,
  useSalesMutations,
  type ConsignmentWithRefs,
} from "../../hooks/useSalesModule";
import { useShowProfit } from "../../hooks/useShowProfit";
import {
  CountInput, Field, Money, MoneyInput, PrimaryButton, QtyInput, Select, SheetDialog, inputCls, inputStyle,
} from "./ui";
import { overCountDelta, settleCountState, settlePayment, takeBackState } from "./settleCount";
import { NO_PAYMENT_CHOSEN, PaymentChoice, type PaymentChoiceState } from "./PaymentChoice";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

// ─── Leave stock ─────────────────────────────────────────────────────────────

export function DepositDialog({
  open, onOpenChange, leadId, leadName, visitId, existing, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: number;
  leadName?: string;
  visitId?: number | null;
  /** Active agreements for this lead, so a top-up shows what is already there. */
  existing?: ConsignmentWithRefs[];
  onDone?: () => void;
}) {
  const t = useT(salesModuleMessages);
  const tc = useT(commonMessages);
  const productsQuery = useProducts({ enabled: open });
  const { deposit } = useSalesMutations();

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(30);
  const [unitPriceCents, setUnitPriceCents] = useState(0);
  const [priceTouched, setPriceTouched] = useState(false);
  const [intervalDays, setIntervalDays] = useState(30);
  const [notes, setNotes] = useState("");

  const consignable = (productsQuery.data ?? []).filter((p) => p.consignable);
  const product = consignable.find((p) => String(p.id) === productId);
  const openAgreement = existing?.find((c) => c.consignment.productId === product?.id);

  // Catalog price follows the quantity until the rep sets one by hand; an open
  // agreement keeps the price already negotiated with this shop.
  useEffect(() => {
    if (!product || priceTouched) return;
    if (openAgreement) { setUnitPriceCents(openAgreement.consignment.unitPriceCents); return; }
    let best: { minQuantity: number; unitPriceCents: number } | null = null;
    for (const tier of product.tiers) {
      if (tier.minQuantity <= quantity && (!best || tier.minQuantity > best.minQuantity)) best = tier;
    }
    setUnitPriceCents(best ? best.unitPriceCents : product.basePriceCents);
  }, [product, quantity, priceTouched, openAgreement]);

  async function submit() {
    if (!product) return;
    await deposit.mutateAsync({
      leadId,
      productId: product.id,
      quantity,
      unitPriceCents,
      settlementIntervalDays: intervalDays,
      visitId: visitId ?? null,
      notes: notes.trim() || null,
    });
    setProductId(""); setQuantity(30); setPriceTouched(false); setNotes("");
    onOpenChange(false);
    onDone?.();
  }

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={leadName ? t("leaveStockFor", { name: leadName }) : t("leaveStock")}>
      <div className="space-y-4">
        <Field label={t("product")}>
          <Select
            value={productId}
            onChange={(v) => { setProductId(v); setPriceTouched(false); }}
            placeholder={productsQuery.isLoading ? `${tc("loading")}…` : t("chooseProduct")}
            options={consignable.map((p) => ({ value: String(p.id), label: p.name }))}
          />
        </Field>

        {consignable.length === 0 && !productsQuery.isLoading && (
          <p className="text-xs text-white/40">{t("noConsignableProducts")}</p>
        )}

        {openAgreement && (
          <div className="rounded-xl px-3 py-2.5 text-xs text-amber-100 border border-amber-400/25 bg-amber-500/[0.08]">
            {t("alreadyOnShelf", {
              count: openAgreement.consignment.quantityOnHand,
              price: formatCents(openAgreement.consignment.unitPriceCents, openAgreement.consignment.currency),
            })}
          </div>
        )}

        <Field label={t("quantity")} hint={product?.unitLabel ? `${product.unitLabel}s` : undefined}>
          <QtyInput value={quantity} onChange={setQuantity} min={1} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("unitPriceTheyPay")} hint={priceTouched ? undefined : t("hintCatalog")}>
            <MoneyInput
              valueCents={unitPriceCents}
              onChangeCents={(c) => { setUnitPriceCents(c); setPriceTouched(true); }}
              disabled={Boolean(openAgreement)}
            />
          </Field>
          <Field label={t("settleEvery")} hint={t("hintDays")}>
            <input
              value={intervalDays}
              inputMode="numeric"
              onChange={(e) => setIntervalDays(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              disabled={Boolean(openAgreement)}
              className={`${inputCls} tabular-nums disabled:opacity-50`}
              style={inputStyle}
            />
          </Field>
        </div>

        {product?.suggestedRetailCents ? (
          <p className="text-[11px] text-white/35">
            {t("suggestedResale", { price: formatCents(product.suggestedRetailCents, product.currency) })}
          </p>
        ) : null}

        <div className="rounded-2xl p-3.5 border border-white/[0.09] bg-white/[0.04]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">{t("owedIfAllSells")}</span>
            <Money cents={quantity * unitPriceCents} currency={product?.currency} className="text-lg font-bold text-white" />
          </div>
        </div>

        <Field label={t("notes")}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("optional")}
            className={inputCls} style={inputStyle} />
        </Field>

        <PrimaryButton onClick={submit} disabled={!product} loading={deposit.isPending}>
          <PackagePlus className="h-4 w-4" />
          {openAgreement ? t("addToShelf", { count: quantity }) : t("leaveHere", { count: quantity })}
        </PrimaryButton>
      </div>
    </SheetDialog>
  );
}

// ─── Settle ──────────────────────────────────────────────────────────────────

export function SettleDialog({
  open, onOpenChange, row, visitId, onDone, onCorrectStock,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: ConsignmentWithRefs | null;
  visitId?: number | null;
  onDone?: () => void;
  /** Over-count: the owner of this dialog opens the correction with the difference filled in. */
  onCorrectStock?: (row: ConsignmentWithRefs, delta: number) => void;
}) {
  const t = useT(salesModuleMessages);
  const tc = useT(commonMessages);
  const showProfit = useShowProfit();
  const { settle } = useSalesMutations();
  // What a product costs is for whoever sees profit; a seller's dialog never asks for it.
  const productsQuery = useProducts({ enabled: open && showProfit });

  const onHand = row?.consignment.quantityOnHand ?? 0;
  // Starts empty: an untouched dialog must not bill everything on record as sold.
  const [counted, setCounted] = useState<number | null>(null);
  const [restock, setRestock] = useState(0);
  // Nothing is paid until the rep says so, and cash is never picked for them.
  const [pay, setPay] = useState<PaymentChoiceState>(NO_PAYMENT_CHOSEN);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) { setCounted(null); setRestock(0); setPay(NO_PAYMENT_CHOSEN); setNotes(""); }
  }, [open, row?.consignment.id]);

  const unitCostCents = useMemo(() => {
    if (!showProfit) return 0;
    const product = productsQuery.data?.find((p) => p.id === row?.consignment.productId);
    return product?.costCents ?? 0;
  }, [showProfit, productsQuery.data, row?.consignment.productId]);

  // The same function the server settles with — the preview cannot drift.
  const result = useMemo(() => computeSettlement({
    onHand,
    countedRemaining: counted ?? onHand,
    unitPriceCents: row?.consignment.unitPriceCents ?? 0,
    unitCostCents,
    restockQuantity: restock,
  }), [onHand, counted, restock, row?.consignment.unitPriceCents, unitCostCents]);

  if (!row) return null;
  const currency = row.consignment.currency;
  const countState = settleCountState(onHand, counted);
  const billing = countState === "ready" && result.soldQuantity > 0;
  const payment = settlePayment(pay.choice, pay.method, pay.partialCents, result.amountCents);
  const canSave = countState === "ready" && (result.soldQuantity === 0 || payment !== null);

  async function submit() {
    if (counted === null || !canSave) return;
    await settle.mutateAsync({
      consignmentId: row!.consignment.id,
      countedRemaining: counted,
      restockQuantity: restock || undefined,
      paymentStatus: billing ? payment!.paymentStatus : undefined,
      paymentMethod: billing ? payment!.paymentMethod : null,
      paidCents: billing ? payment!.paidCents : undefined,
      visitId: visitId ?? null,
      notes: notes.trim() || null,
    });
    onOpenChange(false);
    onDone?.();
  }

  // The shop is what the rep is standing in; the product comes second.
  const shop = row.lead?.name ?? row.product?.name ?? t("stockFallback");
  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={shop} description={t("settleTitle", { product: row.product?.name ?? t("stockFallback") })}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl px-3.5 py-3 border border-white/[0.09] bg-white/[0.04]">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{t("onRecord")}</div>
            <div className="text-xl font-bold tabular-nums text-white">{onHand}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{t("unitPrice")}</div>
            <div className="text-xl font-bold tabular-nums text-white">
              {formatCents(row.consignment.unitPriceCents, currency)}
            </div>
          </div>
        </div>

        <Field label={t("stillOnShelf")}>
          <CountInput value={counted} onChange={setCounted} autoFocus />
        </Field>

        {countState === "empty" ? (
          <p className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-xs text-white/55" data-testid="settle-count-first">{t("countFirst")}</p>
        ) : countState === "over" && counted !== null ? (
          <div className="space-y-2.5 rounded-xl px-3 py-2.5 text-xs text-red-300 border border-red-400/25 bg-red-500/[0.08]" data-testid="settle-over-count">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("overCount", { count: onHand })}</span>
            </div>
            {onCorrectStock ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => onCorrectStock(row, overCountDelta(onHand, counted))}>
                <SlidersHorizontal aria-hidden="true" /> {t("correctStock")}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl p-3.5 space-y-2 border border-emerald-400/20 bg-emerald-500/[0.07]">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>{t("soldSinceLastCount")}</span>
              <span className="tabular-nums font-semibold text-white">{result.soldQuantity}</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-2">
              <span className="text-sm font-semibold text-white">{t("theyOwe")}</span>
              <Money cents={result.amountCents} currency={currency} className="text-2xl font-bold text-emerald-300" />
            </div>
            {showProfit ? (
              <div className="flex items-center justify-between text-[11px] text-white/35">
                <span>{t("youKeep")}</span>
                <span className="tabular-nums">{formatCents(result.profitCents, currency)}</span>
              </div>
            ) : null}
          </div>
        )}

        <Field label={t("leavingMoreToday")} hint={t("hintRestock")}>
          <QtyInput value={restock} onChange={setRestock} min={0} />
        </Field>

        {restock > 0 && (
          <p className="text-[11px] text-white/40">
            {t("shelfAfterVisit")}{" "}
            <strong className="text-white/70">{t.plural("units", result.onHandAfterRestock)}</strong>
          </p>
        )}

        {billing && <PaymentChoice value={pay} onChange={setPay} amountCents={result.amountCents} currency={currency} />}

        <Field label={t("notes")}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("optional")}
            className={inputCls} style={inputStyle} />
        </Field>

        {countState === "ready" ? (
          <PrimaryButton tone="emerald" onClick={submit} loading={settle.isPending} disabled={!canSave}>
            <Handshake className="h-4 w-4" />
            {result.soldQuantity > 0 ? tc("save") : t("settleNothingSold")}
          </PrimaryButton>
        ) : null}
      </div>
    </SheetDialog>
  );
}

// ─── Return / adjust ─────────────────────────────────────────────────────────

export function ReturnDialog({
  open, onOpenChange, row, visitId, onDone,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; row: ConsignmentWithRefs | null;
  visitId?: number | null; onDone?: () => void;
}) {
  const t = useT(salesModuleMessages);
  const { returnStock } = useSalesMutations();
  const onHand = row?.consignment.quantityOnHand ?? 0;
  // Starts empty: one tap must not pick up everything on record and end the agreement.
  const [quantity, setQuantity] = useState<number | null>(null);
  const [close, setClose] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => { if (open) { setQuantity(null); setClose(true); setNotes(""); } }, [open, onHand]);
  if (!row) return null;
  const state = takeBackState(onHand, quantity);

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={row.lead?.name ?? row.product?.name ?? t("stockFallback")}
      description={t("takeBackTitle", { product: row.product?.name ?? t("stockFallback") })}>
      <div className="space-y-4">
        <Field label={t("unitsTakenBack")} hint={t.plural("units", onHand)}>
          <CountInput value={quantity} onChange={(n) => setQuantity(n === null ? null : Math.min(n, onHand))} autoFocus />
        </Field>
        <p className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-xs text-white/55" data-testid="take-back-warning">{t("takeBackWarning")}</p>
        {state === "all" && (
          <label className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer border border-white/[0.09] bg-white/[0.04]">
            <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} className="h-4 w-4 accent-blue-500" />
            <span className="text-xs text-white/70">{t("closeThisConsignment")}</span>
          </label>
        )}
        <Field label={t("reason")}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("optional")}
            className={inputCls} style={inputStyle} />
        </Field>
        <PrimaryButton tone="amber" loading={returnStock.isPending} disabled={state === "empty" || state === "over"}
          onClick={async () => {
            if (quantity === null) return;
            await returnStock.mutateAsync({
              consignmentId: row.consignment.id, quantity,
              close: state === "all" && close, visitId: visitId ?? null, notes: notes.trim() || null,
            });
            onOpenChange(false); onDone?.();
          }}>
          <Undo2 className="h-4 w-4" /> {t("takeBackN", { count: quantity ?? 0 })}
        </PrimaryButton>
      </div>
    </SheetDialog>
  );
}

export function AdjustDialog({
  open, onOpenChange, row, visitId, onDone, initialDelta = 0,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; row: ConsignmentWithRefs | null;
  visitId?: number | null; onDone?: () => void;
  /** Opens with this change filled in (the over-count's difference). */
  initialDelta?: number;
}) {
  const t = useT(salesModuleMessages);
  const { adjust } = useSalesMutations();
  const onHand = row?.consignment.quantityOnHand ?? 0;
  const [delta, setDelta] = useState(initialDelta);
  const [notes, setNotes] = useState("");

  useEffect(() => { if (open) { setDelta(initialDelta); setNotes(""); } }, [open, initialDelta]);
  if (!row) return null;

  const after = onHand + delta;

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={row.lead?.name ?? row.product?.name ?? t("correctStock")}
      description={row.product?.name ? t("correctStockTitle", { product: row.product.name }) : t("correctStock")}>
      <div className="space-y-4">
        <p className="text-xs text-white/45">{t("correctIntro")}</p>
        <div className="flex items-center justify-between rounded-xl px-3.5 py-3 border border-white/[0.09] bg-white/[0.04]">
          <span className="text-xs text-white/45">{t("onRecord")}</span>
          <span className="tabular-nums text-white">
            {onHand} <span className="text-white/30">→</span>{" "}
            <strong className={after < 0 ? "text-red-400" : "text-white"}>{after}</strong>
          </span>
        </div>
        <Field label={t("change")} hint={t("hintNegative")}>
          <input
            value={delta}
            inputMode="numeric"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9-]/g, "");
              setDelta(raw === "" || raw === "-" ? 0 : Math.trunc(Number(raw)));
            }}
            className={`${inputCls} text-center tabular-nums font-semibold`}
            style={inputStyle}
            autoFocus
          />
        </Field>
        <Field label={t("reason")}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("reasonPlaceholder")}
            className={inputCls} style={inputStyle} />
        </Field>
        <PrimaryButton tone="indigo" loading={adjust.isPending} disabled={delta === 0 || after < 0}
          onClick={async () => {
            await adjust.mutateAsync({
              consignmentId: row.consignment.id, delta, visitId: visitId ?? null, notes: notes.trim() || null,
            });
            onOpenChange(false); onDone?.();
          }}>
          <SlidersHorizontal className="h-4 w-4" /> {t("correctTo", { count: after })}
        </PrimaryButton>
      </div>
    </SheetDialog>
  );
}
