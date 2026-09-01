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
  PAYMENT_METHODS,
  type PaymentMethod,
  type PaymentStatus,
  type ProductWithTiers,
} from "../../hooks/useSalesModule";
import {
  Field, GhostButton, Money, MoneyInput, PrimaryButton, QtyInput, Select, SheetDialog,
  inputCls, inputStyle,
} from "./ui";

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
    <SheetDialog open={open} onOpenChange={onOpenChange} title={leadName ? `New sale — ${leadName}` : "New sale"} wide>
      <div className="space-y-4">
        {visitId ? (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] text-indigo-300"
            style={{ background: "rgba(99,102,241,0.10)", border: "1px solid rgba(99,102,241,0.25)" }}>
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            Linked to this visit
          </div>
        ) : null}

        {/* Lines */}
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={line.key} className="rounded-2xl p-3 space-y-2.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  Item {index + 1}
                </span>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-red-500/15 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Select
                value={line.productId ? String(line.productId) : ""}
                onChange={(v) => pickProduct(line.key, v)}
                placeholder={productsQuery.isLoading ? "Loading catalog…" : "Custom item (type below)"}
                options={products.map((p) => ({ value: String(p.id), label: p.name }))}
              />

              {!line.productId && (
                <input
                  value={line.description}
                  onChange={(e) => patchLine(line.key, { description: e.target.value })}
                  placeholder="What was sold"
                  className={inputCls}
                  style={inputStyle}
                />
              )}

              <div className="grid grid-cols-2 gap-2">
                <Field label="Qty">
                  <QtyInput value={line.quantity} onChange={(n) => setQuantity(line.key, n)} min={1} />
                </Field>
                <Field label="Unit price" hint={line.autoPrice && line.productId ? "catalog" : undefined}>
                  <MoneyInput
                    valueCents={line.unitPriceCents}
                    onChangeCents={(c) => patchLine(line.key, { unitPriceCents: c, autoPrice: false })}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/35">Line total</span>
                <Money cents={line.quantity * line.unitPriceCents} className="font-semibold text-white" />
              </div>
            </div>
          ))}

          <GhostButton onClick={() => setLines((p) => [...p, newLine()])} className="w-full">
            <Plus className="h-3.5 w-3.5" /> Add item
          </GhostButton>
        </div>

        {/* Money */}
        <div className="rounded-2xl p-3.5 space-y-3"
          style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
          <div className="flex items-center justify-between text-xs text-white/45">
            <span>Subtotal</span><Money cents={totals.subtotalCents} />
          </div>
          <Field label="Discount">
            <MoneyInput valueCents={discountCents} onChangeCents={setDiscountCents} />
          </Field>
          <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
            <span className="text-sm font-semibold text-white">Total</span>
            <Money cents={totals.totalCents} className="text-lg font-bold text-emerald-400" />
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/35">
            <span>You keep</span>
            <span className="tabular-nums">{formatCents(totals.profitCents)}</span>
          </div>
        </div>

        {/* Payment */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Payment">
            <Select
              value={paymentStatus}
              onChange={(v) => setPaymentStatus(v as PaymentStatus)}
              options={[
                { value: "paid", label: "Paid" },
                { value: "partial", label: "Partial" },
                { value: "unpaid", label: "Unpaid" },
              ]}
            />
          </Field>
          <Field label="Method">
            <Select
              value={paymentMethod}
              onChange={(v) => setPaymentMethod(v as PaymentMethod)}
              placeholder="—"
              options={PAYMENT_METHODS}
            />
          </Field>
        </div>
        {paymentStatus === "partial" && (
          <Field label="Amount received">
            <MoneyInput valueCents={paidCents} onChangeCents={setPaidCents} />
          </Field>
        )}

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything worth remembering"
            className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none"
            style={inputStyle}
          />
        </Field>

        <PrimaryButton tone="emerald" onClick={submit} disabled={!canSubmit} loading={createSale.isPending}>
          <Package className="h-4 w-4" />
          Record {formatCents(totals.totalCents)} sale
        </PrimaryButton>
      </div>
    </SheetDialog>
  );
}
