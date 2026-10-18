// Record a sale — from inside a visit (visitId set) or from the company card.
//
// Lines price themselves from the catalog as the quantity changes; the rep can
// override any unit price. The total, and what we keep on it, update live.

import { useMemo, useState } from "react";
import { Plus, Trash2, Package, Sparkles } from "lucide-react";
import { computeSaleTotals } from "#shared/pricing.js";
import { formatCents } from "../../utils";
import {
  useProducts,
  useSalesMutations,
  usePaymentOptions,
  type PaymentMethod,
  type PaymentStatus,
  type ProductWithTiers,
} from "../../hooks/useSalesModule";
import {
  Field, GhostButton, Money, MoneyInput, QtyInput, Select, SheetDialog,
} from "./ui";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";
import { commonMessages } from "@/i18n/messages/common";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { EYEBROW, GLASS_CLASS } from "@/components/xpot/surface";

type Line = {
  key: string;
  productId: number | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  /** false once the rep types a price — stop repricing from the catalog. */
  autoPrice: boolean;
};

function tierPrice(product: ProductWithTiers, quantity: number): number {
  let best: { minQuantity: number; unitPriceCents: number } | null = null;
  for (const tier of product.tiers) {
    if (tier.minQuantity <= quantity && (!best || tier.minQuantity > best.minQuantity)) best = tier;
  }
  return best ? best.unitPriceCents : product.basePriceCents;
}

let lineSeq = 0;
const newLine = (): Line => ({
  key: `line-${++lineSeq}`,
  productId: null,
  description: "",
  quantity: 1,
  unitPriceCents: 0,
  unitCostCents: 0,
  autoPrice: true,
});

export function SaleDialog({
  open, onOpenChange, leadId, leadName, visitId, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: number;
  leadName?: string;
  visitId?: number | null;
  onDone?: () => void;
}) {
  const t = useT(salesModuleMessages);
  const tc = useT(commonMessages);
  const { statusOptions, methodOptions } = usePaymentOptions();
  const productsQuery = useProducts({ enabled: open });
  const { createSale } = useSalesMutations();

  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [discountCents, setDiscountCents] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("cash");
  const [paidCents, setPaidCents] = useState(0);
  const [notes, setNotes] = useState("");

  const products = productsQuery.data ?? [];
  const totals = useMemo(() => computeSaleTotals(lines, discountCents), [lines, discountCents]);

  function patchLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickProduct(key: string, productId: string) {
    const product = products.find((p) => String(p.id) === productId);
    setLines((prev) => prev.map((l) => {
      if (l.key !== key) return l;
      if (!product) return { ...l, productId: null, unitCostCents: 0 };
      return {
        ...l,
        productId: product.id,
        description: product.name,
        unitPriceCents: l.autoPrice ? tierPrice(product, l.quantity) : l.unitPriceCents,
        unitCostCents: product.costCents ?? 0,
      };
    }));
  }

  function setQuantity(key: string, quantity: number) {
    setLines((prev) => prev.map((l) => {
      if (l.key !== key) return l;
      const product = products.find((p) => p.id === l.productId);
      return {
        ...l,
        quantity,
        // Crossing a volume tier reprices, unless the rep set the price by hand.
        unitPriceCents: product && l.autoPrice ? tierPrice(product, quantity) : l.unitPriceCents,
      };
    }));
  }

  function reset() {
    lineSeq = 0;
    setLines([newLine()]);
    setDiscountCents(0);
    setPaymentStatus("paid");
    setPaymentMethod("cash");
    setPaidCents(0);
    setNotes("");
  }

  const incomplete = lines.some((l) => !l.productId && !l.description.trim());
  const canSubmit = lines.length > 0 && !incomplete && totals.subtotalCents >= 0;

  async function submit() {
    await createSale.mutateAsync({
      leadId,
      visitId: visitId ?? null,
      items: lines.map((l) => ({
        productId: l.productId,
        description: l.description.trim() || undefined,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
      discountCents: discountCents || undefined,
      paymentStatus,
      paymentMethod: paymentMethod || null,
      paidCents: paymentStatus === "partial" ? paidCents : undefined,
      notes: notes.trim() || null,
    });
    reset();
    onOpenChange(false);
    onDone?.();
  }

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={leadName ? t("newSaleFor", { name: leadName }) : t("newSale")} wide>
      <div className="space-y-4">
        {visitId ? (
          <InlineAlert tone="info" icon={Sparkles}>{t("linkedToVisit")}</InlineAlert>
        ) : null}

        {/* Lines */}
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={line.key} className={`space-y-2.5 rounded-2xl p-3 ${GLASS_CLASS}`}>
              <div className="flex items-center justify-between">
                <span className={EYEBROW}>
                  {t("itemN", { n: index + 1 })}
                </span>
                {lines.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))}
                    aria-label={t("removeItem")} title={t("removeItem")}
                    className="-my-2 -mr-2 text-white/40 hover:bg-red-500/15 hover:text-red-300">
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </div>

              <Select
                value={line.productId ? String(line.productId) : ""}
                onChange={(v) => pickProduct(line.key, v)}
                placeholder={productsQuery.isLoading ? t("loadingCatalog") : t("customItemTypeBelow")}
                options={products.map((p) => ({ value: String(p.id), label: p.name }))}
              />

              {!line.productId && (
                <Input
                  value={line.description}
                  onChange={(e) => patchLine(line.key, { description: e.target.value })}
                  placeholder={t("whatWasSold")}
                  aria-label={t("whatWasSold")}
                />
              )}

              <div className="grid grid-cols-2 gap-2">
                <Field label={t("qty")}>
                  <QtyInput value={line.quantity} onChange={(n) => setQuantity(line.key, n)} min={1} />
                </Field>
                <Field label={t("unitPrice")} hint={line.autoPrice && line.productId ? t("hintCatalog") : undefined}>
                  <MoneyInput
                    valueCents={line.unitPriceCents}
                    onChangeCents={(c) => patchLine(line.key, { unitPriceCents: c, autoPrice: false })}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/40">{t("lineTotal")}</span>
                <Money cents={line.quantity * line.unitPriceCents} className="font-semibold text-white" />
              </div>
            </div>
          ))}

          <GhostButton onClick={() => setLines((p) => [...p, newLine()])} className="w-full">
            <Plus className="h-3.5 w-3.5" /> {t("addItem")}
          </GhostButton>
        </div>

        {/* Money */}
        <div className="space-y-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-3.5">
          <div className="flex items-center justify-between text-xs text-white/45">
            <span>{t("subtotal")}</span><Money cents={totals.subtotalCents} />
          </div>
          <Field label={t("discount")}>
            <MoneyInput valueCents={discountCents} onChangeCents={setDiscountCents} />
          </Field>
          <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
            <span className="text-sm font-semibold text-white">{t("total")}</span>
            <Money cents={totals.totalCents} className="text-lg font-bold text-emerald-300" />
          </div>
          <div className="flex items-center justify-between text-xs text-white/40">
            <span>{t("youKeep")}</span>
            <span className="tabular-nums">{formatCents(totals.profitCents)}</span>
          </div>
        </div>

        {/* Payment */}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("payment")}>
            <Select
              value={paymentStatus}
              onChange={(v) => setPaymentStatus(v as PaymentStatus)}
              options={statusOptions}
            />
          </Field>
          <Field label={t("method")}>
            <Select
              value={paymentMethod}
              onChange={(v) => setPaymentMethod(v as PaymentMethod)}
              placeholder="—"
              options={methodOptions}
            />
          </Field>
        </div>
        {paymentStatus === "partial" && (
          <Field label={t("amountReceived")}>
            <MoneyInput valueCents={paidCents} onChangeCents={setPaidCents} />
          </Field>
        )}

        <Field label={t("notes")}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t("notesPlaceholder")}
            className="min-h-16"
          />
        </Field>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createSale.isPending}>{tc("cancel")}</Button>
          <Button type="button" variant="money" onClick={submit} disabled={!canSubmit} loading={createSale.isPending}>
            <Package aria-hidden="true" />
            {t("recordSale", { amount: formatCents(totals.totalCents) })}
          </Button>
        </DialogFooter>
      </div>
    </SheetDialog>
  );
}
