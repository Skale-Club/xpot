// Admin › Products — the catalog behind every sale.
//
// The margin is shown live while you type, because that is the number the
// business runs on: what the shop pays us, minus what the unit cost to make.

import { useState } from "react";
import { Plus, Archive, Layers, Pencil } from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { unitMarginCents } from "#shared/pricing.js";
import { inputToCents } from "@/pages/xpot/utils";
import { useT } from "@/i18n";
import { manageMessages } from "@/i18n/messages/manage";
import {
  useProducts, useProductMutations, type ProductWithTiers, type ProductInput,
} from "@/pages/xpot/hooks/useSalesModule";
import {
  Field, GhostButton, MoneyInput, PrimaryButton, Select, SheetDialog, Chip, inputCls, inputStyle,
} from "@/pages/xpot/components/sales/ui";

const EMPTY: ProductInput = {
  name: "", sku: "", description: "", kind: "physical", category: "",
  unitLabel: "unit", basePriceCents: 0, suggestedRetailCents: null, costCents: null,
  currency: "USD", consignable: false, isActive: true,
};

/** Integer cents in the product's currency, written the way the app's language writes money. */
function formatMoney(cents: number | null | undefined, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
}

export function AdminProducts() {
  const query = useProducts({ all: true });
  const { remove } = useProductMutations();
  const t = useT(manageMessages);
  const money = (cents: number | null | undefined, currency: string) => formatMoney(cents, currency, t.locale);
  const [editing, setEditing] = useState<ProductWithTiers | null>(null);
  const [creating, setCreating] = useState(false);
  const [tiersFor, setTiersFor] = useState<ProductWithTiers | null>(null);

  const products = query.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white/80">{t("catalog")}</h2>
          <p className="text-xs text-white/40">{t("catalogHint")}</p>
        </div>
        <PrimaryButton onClick={() => setCreating(true)} className="!w-auto px-4">
          <Plus className="h-4 w-4" /> {t("newProduct")}
        </PrimaryButton>
      </div>

      {query.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>}

      <div className="overflow-hidden rounded-2xl border border-white/10">
        {products.map((p) => {
          const margin = unitMarginCents(p.basePriceCents, p.costCents);
          return (
            <div key={p.id}
              className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-3 last:border-0"
              style={{ opacity: p.isActive ? 1 : 0.5 }}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-white">{p.name}</span>
                  {p.sku ? <span className="font-mono text-[10px] text-white/30">{p.sku}</span> : null}
                  <Chip tone={p.kind === "digital" ? "blue" : "purple"}>{p.kind === "digital" ? t("kind_digital") : t("kind_physical")}</Chip>
                  {p.consignable ? <Chip tone="amber">{t("consignable")}</Chip> : null}
                  {!p.isActive ? <Chip tone="neutral">{t("archived")}</Chip> : null}
                  {p.tiers.length > 0 ? <Chip tone="green">{t.plural("tiers", p.tiers.length)}</Chip> : null}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-white/40">
                  <span>{t("pricePerUnit", { price: money(p.basePriceCents, p.currency), unit: p.unitLabel })}</span>
                  {p.costCents != null ? <span>{t("costValue", { amount: money(p.costCents, p.currency) })}</span> : null}
                  {p.costCents != null ? (
                    <span className={margin >= 0 ? "text-emerald-400/70" : "text-red-400/80"}>
                      {t("marginValue", { amount: money(margin, p.currency) })}
                    </span>
                  ) : null}
                  {p.suggestedRetailCents ? <span>{t("resaleValue", { amount: money(p.suggestedRetailCents, p.currency) })}</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {p.kind === "physical" && (
                  <GhostButton onClick={() => setTiersFor(p)} title={t("volumePricing")}>
                    <Layers className="h-3.5 w-3.5" />
                  </GhostButton>
                )}
                <GhostButton onClick={() => setEditing(p)} title={t("edit")}>
                  <Pencil className="h-3.5 w-3.5" />
                </GhostButton>
                {p.isActive && (
                  <GhostButton onClick={() => remove.mutate(p.id)} disabled={remove.isPending} title={t("archive")}>
                    <Archive className="h-3.5 w-3.5" />
                  </GhostButton>
                )}
              </div>
            </div>
          );
        })}
        {products.length === 0 && !query.isLoading && (
          <p className="bg-white/[0.03] px-4 py-8 text-center text-sm text-white/40">
            {t("noProducts")}
          </p>
        )}
      </div>

      <ProductDialog open={creating} onOpenChange={setCreating} />
      <ProductDialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} product={editing} />
      <TiersDialog open={Boolean(tiersFor)} onOpenChange={(o) => !o && setTiersFor(null)} product={tiersFor} />
    </div>
  );
}

function ProductDialog({
  open, onOpenChange, product,
}: { open: boolean; onOpenChange: (o: boolean) => void; product?: ProductWithTiers | null }) {
  const { create, update } = useProductMutations();
  const t = useT(manageMessages);
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  // Reload the form when the dialog opens on a different product.
  const targetId = product?.id ?? null;
  if (open && targetId !== loadedId) {
    setLoadedId(targetId);
    setForm(product ? {
      name: product.name, sku: product.sku ?? "", description: product.description ?? "",
      kind: product.kind, category: product.category ?? "", unitLabel: product.unitLabel,
      basePriceCents: product.basePriceCents, suggestedRetailCents: product.suggestedRetailCents,
      costCents: product.costCents, currency: product.currency,
      consignable: product.consignable, isActive: product.isActive,
    } : { ...EMPTY, unitLabel: t("defaultUnit") });
  }

  const margin = unitMarginCents(form.basePriceCents ?? 0, form.costCents);
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const payload = { ...form, sku: form.sku?.trim() || null, category: form.category?.trim() || null };
    if (product) await update.mutateAsync({ id: product.id, ...payload });
    else await create.mutateAsync(payload);
    setLoadedId(null);
    onOpenChange(false);
  }

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={product ? t("editProduct", { name: product.name }) : t("newProduct")}>
      <div className="space-y-3.5">
        <Field label={t("fieldName")}>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} style={inputStyle} autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("fieldSku")} hint={t("optional")}>
            <input value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label={t("fieldType")}>
            <Select value={form.kind ?? "physical"} onChange={(v) => set("kind", v as "digital" | "physical")}
              options={[{ value: "physical", label: t("kindOption_physical") }, { value: "digital", label: t("kindOption_digital") }]} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("fieldCategory")} hint={t("optional")}>
            <input value={form.category ?? ""} onChange={(e) => set("category", e.target.value)}
              placeholder={t("categoryPlaceholder")} className={inputCls} style={inputStyle} />
          </Field>
          <Field label={t("soldPer")}>
            <input value={form.unitLabel ?? t("defaultUnit")} onChange={(e) => set("unitLabel", e.target.value)}
              placeholder={t("soldPerPlaceholder")} className={inputCls} style={inputStyle} />
          </Field>
        </div>

        <div className="rounded-2xl p-3.5 space-y-3"
          style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("priceB2B")} hint={t("theyPay")}>
              <MoneyInput valueCents={form.basePriceCents ?? 0} onChangeCents={(c) => set("basePriceCents", c)} />
            </Field>
            <Field label={t("costToMake")}>
              <MoneyInput valueCents={form.costCents ?? 0} onChangeCents={(c) => set("costCents", c || null)} />
            </Field>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
            <span className="text-xs text-white/50">{t("youKeepPer", { unit: form.unitLabel || t("defaultUnit") })}</span>
            <span className={`text-lg font-bold tabular-nums ${margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatMoney(margin, form.currency ?? "USD", t.locale)}
            </span>
          </div>
        </div>

        <Field label={t("suggestedResale")} hint={t("suggestedResaleHint")}>
          <MoneyInput valueCents={form.suggestedRetailCents ?? 0} onChangeCents={(c) => set("suggestedRetailCents", c || null)} />
        </Field>

        <Field label={t("fieldDescription")} hint={t("optional")}>
          <textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none" style={inputStyle} />
        </Field>

        <div className="space-y-2">
          <label className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <input type="checkbox" checked={Boolean(form.consignable)}
              onChange={(e) => set("consignable", e.target.checked)} className="accent-indigo-500" />
            <span className="text-xs text-white/70">{t("canConsign")}</span>
          </label>
          <label className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <input type="checkbox" checked={form.isActive !== false}
              onChange={(e) => set("isActive", e.target.checked)} className="accent-indigo-500" />
            <span className="text-xs text-white/70">{t("activeCanSell")}</span>
          </label>
        </div>

        <PrimaryButton tone="emerald" onClick={submit} disabled={!form.name.trim()}
          loading={create.isPending || update.isPending}>
          {product ? t("saveChanges") : t("createProduct")}
        </PrimaryButton>
      </div>
    </SheetDialog>
  );
}

function TiersDialog({
  open, onOpenChange, product,
}: { open: boolean; onOpenChange: (o: boolean) => void; product: ProductWithTiers | null }) {
  const { replaceTiers } = useProductMutations();
  const t = useT(manageMessages);
  const [rows, setRows] = useState<{ minQuantity: string; unitPrice: string }[]>([]);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  if (open && product && product.id !== loadedId) {
    setLoadedId(product.id);
    setRows(product.tiers.map((tier) => ({
      minQuantity: String(tier.minQuantity),
      unitPrice: (tier.unitPriceCents / 100).toFixed(2),
    })));
  }
  if (!product) return null;

  const parsed = rows
    .map((r) => ({ minQuantity: Math.floor(Number(r.minQuantity) || 0), unitPriceCents: inputToCents(r.unitPrice) }))
    .filter((r) => r.minQuantity > 0);
  const duplicate = new Set(parsed.map((r) => r.minQuantity)).size !== parsed.length;

  return (
    <SheetDialog open={open} onOpenChange={onOpenChange} title={t("volumePricingTitle", { name: product.name })}>
      <div className="space-y-3">
        <p className="text-xs text-white/45">
          {t("tiersExplainer", { price: formatMoney(product.basePriceCents, product.currency, t.locale) })}
        </p>

        {rows.map((row, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label={t("fromQty")}>
              <input value={row.minQuantity} inputMode="numeric"
                onChange={(e) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, minQuantity: e.target.value } : r))}
                className={`${inputCls} tabular-nums`} style={inputStyle} />
            </Field>
            <Field label={t("unitPrice")}>
              <input value={row.unitPrice} inputMode="decimal"
                onChange={(e) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, unitPrice: e.target.value } : r))}
                className={`${inputCls} tabular-nums`} style={inputStyle} />
            </Field>
            <GhostButton onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))} className="mb-0.5">✕</GhostButton>
          </div>
        ))}

        <GhostButton className="w-full" onClick={() => setRows((p) => [...p, { minQuantity: "", unitPrice: "" }])}>
          <Plus className="h-3.5 w-3.5" /> {t("addTier")}
        </GhostButton>

        {duplicate && <p className="text-xs text-red-400">{t("duplicateTier")}</p>}

        <PrimaryButton tone="emerald" disabled={duplicate} loading={replaceTiers.isPending}
          onClick={async () => { await replaceTiers.mutateAsync({ id: product.id, tiers: parsed }); onOpenChange(false); }}>
          {t("savePricing")}
        </PrimaryButton>
      </div>
    </SheetDialog>
  );
}
