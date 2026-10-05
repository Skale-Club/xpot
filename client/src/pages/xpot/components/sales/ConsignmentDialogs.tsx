// Consignment: leave stock, settle it, take it back, correct it.
//
// The settlement dialog is the one that matters most — it is what the rep and
// the shop owner look at together across the counter. It computes with the same
// shared/pricing function the server uses, so the number on screen is the number
// that gets billed.

import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Handshake, Undo2, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { computeSettlement } from "#shared/pricing.js";
import { formatCents } from "../../utils";
import {
  useProducts,
  useSalesMutations,
  usePaymentOptions,
  type ConsignmentWithRefs,
  type PaymentMethod,
  type PaymentStatus,
} from "../../hooks/useSalesModule";
import {
  Field, Money, MoneyInput, PrimaryButton, QtyInput, Select, SheetDialog, inputCls, inputStyle,
} from "./ui";
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
          <div className="rounded-xl px-3 py-2.5 text-[11px] text-amber-200"
            style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}>
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

        <div className="rounded-2xl p-3.5"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">{t("owedIfAllSells")}</span>
            <Money cents={quantity * unitPriceCents} currency={product?.currency} className="text-lg font-bold text-indigo-300" />
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
  open, onOpenChange, row, visitId, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: ConsignmentWithRefs | null;
  visitId?: number | null;
  onDone?: () => void;
}) {
  const t = useT(salesModuleMessages);
  const { statusOptions, methodOptions } = usePaymentOptions();
  const { settle } = useSalesMutations();
  const productsQuery = useProducts({ enabled: open });

  const onHand = row?.consignment.quantityOnHand ?? 0;
  const [counted, setCounted] = useState(0);
  const [restock, setRestock] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("cash");
  const [paidCents, setPaidCents] = useState(0);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) { setCounted(0); setRestock(0); setPaymentStatus("paid"); setPaidCents(0); setNotes(""); }
  }, [open, row?.consignment.id]);

  const unitCostCents = useMemo(() => {
    const product = productsQuery.data?.find((p) => p.id === row?.consignment.productId);
    return product?.costCents ?? 0;
  }, [productsQuery.data, row?.consignment.productId]);

  // The same function the server settles with — the preview cannot drift.
  const result = useMemo(() => computeSettlement({
    onHand,
    countedRemaining: counted,
    unitPriceCents: row?.consignment.unitPriceCents ?? 0,
    unitCostCents,
    restockQuantity: restock,
  }), [onHand, counted, restock, row?.consignment.unitPriceCents, unitCostCents]);

  if (!row) return null;
  const currency = row.consignment.currency;

  async function submit() {
    await settle.mutateAsync({
      consignmentId: row!.consignment.id,
      countedRemaining: counted,
      restockQuantity: restock || undefined,
      paymentStatus: result.soldQuantity > 0 ? paymentStatus : undefined,
      paymentMethod: paymentMethod || null,
      paidCents: paymentStatus === "partial" ? paidCents : undefined,
      visitId: visitId ?? null,
      notes: notes.trim() || null,
    });
    onOpenChange(false);
    onDone?.();
  }

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={t("settleTitle", { product: row.product?.name ?? t("stockFallback") })}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl px-3.5 py-3"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{t("onRecord")}</div>
            <div className="text-xl font-bold tabular-nums text-white">{onHand}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{t("unitPrice")}</div>
            <div className="text-xl font-bold tabular-nums text-white">
              {formatCents(row.consignment.unitPriceCents, currency)}
            </div>
          </div>
        </div>

        <Field label={t("stillOnShelf")} hint={t("hintCountThem")}>
          <QtyInput value={counted} onChange={setCounted} min={0} autoFocus />
        </Field>

        {result.overCount ? (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] text-red-300"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t("overCount", { count: onHand })}</span>
          </div>
        ) : (
          <div className="rounded-2xl p-3.5 space-y-2"
            style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>{t("soldSinceLastVisit")}</span>
              <span className="tabular-nums font-semibold text-white">{result.soldQuantity}</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-2">
              <span className="text-sm font-semibold text-white">{t("theyOwe")}</span>
              <Money cents={result.amountCents} currency={currency} className="text-2xl font-bold text-emerald-400" />
            </div>
            <div className="flex items-center justify-between text-[11px] text-white/35">
              <span>{t("youKeep")}</span>
              <span className="tabular-nums">{formatCents(result.profitCents, currency)}</span>
            </div>
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

        {result.soldQuantity > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("payment")}>
                <Select value={paymentStatus} onChange={(v) => setPaymentStatus(v as PaymentStatus)}
                  options={statusOptions} />
              </Field>
              <Field label={t("method")}>
                <Select value={paymentMethod} onChange={(v) => setPaymentMethod(v as PaymentMethod)}
                  placeholder="—" options={methodOptions} />
              </Field>
            </div>
            {paymentStatus === "partial" && (
              <Field label={t("amountReceived")}>
                <MoneyInput valueCents={paidCents} onChangeCents={setPaidCents} />
              </Field>
            )}
          </>
        )}

        <Field label={t("notes")}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("optional")}
            className={inputCls} style={inputStyle} />
        </Field>

        <PrimaryButton tone="emerald" onClick={submit} disabled={result.overCount} loading={settle.isPending}>
          <Handshake className="h-4 w-4" />
          {result.soldQuantity > 0
            ? t("settleAmount", { amount: formatCents(result.amountCents, currency) })
            : t("settleNothingSold")}
        </PrimaryButton>
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
  const [quantity, setQuantity] = useState(0);
  const [close, setClose] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => { if (open) { setQuantity(onHand); setClose(true); setNotes(""); } }, [open, onHand]);
  if (!row) return null;

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={t("takeBackTitle", { product: row.product?.name ?? t("stockFallback") })}>
      <div className="space-y-4">
        <p className="text-xs text-white/45">{t("takeBackIntro", { count: onHand })}</p>
        <Field label={t("unitsTakenBack")}>
          <QtyInput value={quantity} onChange={setQuantity} min={1} max={onHand} autoFocus />
        </Field>
        <label className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} className="accent-indigo-500" />
          <span className="text-xs text-white/70">{t("closeThisConsignment")}</span>
        </label>
        <Field label={t("reason")}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("optional")}
            className={inputCls} style={inputStyle} />
        </Field>
        <PrimaryButton tone="amber" loading={returnStock.isPending} disabled={quantity < 1 || quantity > onHand}
          onClick={async () => {
            await returnStock.mutateAsync({
              consignmentId: row.consignment.id, quantity,
              close: close && quantity >= onHand, visitId: visitId ?? null, notes: notes.trim() || null,
            });
            onOpenChange(false); onDone?.();
          }}>
          <Undo2 className="h-4 w-4" /> {t("takeBackN", { count: quantity })}
        </PrimaryButton>
      </div>
    </SheetDialog>
  );
}

export function AdjustDialog({
  open, onOpenChange, row, visitId, onDone,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; row: ConsignmentWithRefs | null;
  visitId?: number | null; onDone?: () => void;
}) {
  const t = useT(salesModuleMessages);
  const { adjust } = useSalesMutations();
  const onHand = row?.consignment.quantityOnHand ?? 0;
  const [delta, setDelta] = useState(0);
  const [notes, setNotes] = useState("");

  useEffect(() => { if (open) { setDelta(0); setNotes(""); } }, [open]);
  if (!row) return null;

  const after = onHand + delta;

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={row.product?.name ? t("correctStockTitle", { product: row.product.name }) : t("correctStock")}>
      <div className="space-y-4">
        <p className="text-xs text-white/45">{t("correctIntro")}</p>
        <div className="flex items-center justify-between rounded-xl px-3.5 py-3"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
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
