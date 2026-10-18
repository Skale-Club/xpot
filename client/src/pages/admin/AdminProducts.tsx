// Admin › Products — the catalog behind every sale.
//
// The margin is shown live while you type, because that is the number the
// business runs on: what the shop pays us, minus what the unit cost to make.

import { useState } from "react";
import { Archive, Layers, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { unitMarginCents } from "#shared/pricing.js";
import { centsToInput, inputToCents } from "@/pages/xpot/utils";
import { formatMoney } from "@/lib/format";
import { useT } from "@/i18n";
import { adminUiMessages } from "@/i18n/messages/adminUi";
import { manageMessages } from "@/i18n/messages/manage";
import {
  useProducts, useProductMutations, type ProductWithTiers, type ProductInput,
} from "@/pages/xpot/hooks/useSalesModule";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { FilterBar, FilterSearch } from "@/components/xpot/filters";
import { FormFooter } from "@/components/xpot/FormFooter";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { Pill } from "@/components/xpot/StatusPill";
import { SwitchRow } from "@/components/xpot/SwitchRow";
import { GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";

const EMPTY: ProductInput = {
  name: "", sku: "", description: "", kind: "physical", category: "",
  unitLabel: "unit", basePriceCents: 0, suggestedRetailCents: null, costCents: null,
  currency: "USD", consignable: false, isActive: true,
};

function formFrom(product: ProductWithTiers): ProductInput {
  return {
    name: product.name, sku: product.sku ?? "", description: product.description ?? "",
    kind: product.kind, category: product.category ?? "", unitLabel: product.unitLabel,
    basePriceCents: product.basePriceCents, suggestedRetailCents: product.suggestedRetailCents,
    costCents: product.costCents, currency: product.currency,
    consignable: product.consignable, isActive: product.isActive,
  };
}

/** Name, SKU or category contains the search (any case). */
function matches(product: ProductWithTiers, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [product.name, product.sku, product.category].some((value) => value?.toLowerCase().includes(q));
}

/** Dollars in the box, cents in state (the kit's Input). */
function CentsInput({ valueCents, onChangeCents, id, ...aria }: {
  valueCents: number | null | undefined;
  onChangeCents: (cents: number) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [text, setText] = useState(() => centsToInput(valueCents));
  const [lastCents, setLastCents] = useState(valueCents ?? 0);
  // Re-sync the text when the outside value changes (another product opened).
  if ((valueCents ?? 0) !== lastCents) {
    setLastCents(valueCents ?? 0);
    setText(centsToInput(valueCents));
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/35">$</span>
      <Input
        id={id}
        {...aria}
        value={text}
        inputMode="decimal"
        placeholder="0.00"
        onChange={(e) => { setText(e.target.value); const c = inputToCents(e.target.value); setLastCents(c); onChangeCents(c); }}
        onBlur={() => setText(centsToInput(inputToCents(text)))}
        className="pl-7 tabular-nums"
      />
    </div>
  );
}

export function AdminProducts() {
  const query = useProducts({ all: true });
  const { remove } = useProductMutations();
  const t = useT(manageMessages);
  const tu = useT(adminUiMessages);
  const money = (cents: number | null | undefined, currency: string) => formatMoney(cents, currency, t.locale);
  const [editing, setEditing] = useState<ProductWithTiers | null>(null);
  const [creating, setCreating] = useState(false);
  const [tiersFor, setTiersFor] = useState<ProductWithTiers | null>(null);
  const [archiving, setArchiving] = useState<ProductWithTiers | null>(null);
  const [search, setSearch] = useState("");

  const all = query.data ?? [];
  const products = all.filter((p) => matches(p, search));
  const page = usePagedList(products, { resetKey: search });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white/80">{t("catalog")}</h2>
          <p className="text-xs text-white/40">{t("catalogHint")}</p>
        </div>
        <Button variant="brand" onClick={() => setCreating(true)}>
          <Plus /> {t("newProduct")}
        </Button>
      </div>

      {all.length > 0 && (
        <FilterBar
          search={<FilterSearch value={search} onChange={setSearch} placeholder={tu("searchProducts")} testId="products-search" />}
          summary={{ active: search.trim() !== "", shown: products.length, total: all.length, onClear: () => setSearch("") }}
        />
      )}

      {query.isLoading ? (
        <ListSkeleton rows={4} />
      ) : query.isError ? (
        <ErrorState message={tu("productsLoadFailed")} onRetry={() => void query.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState icon={Package} title={t("noProducts")} />
      ) : products.length === 0 ? (
        <EmptyState compact icon={Package} title={tu("noProductsMatch")} />
      ) : (
        <div className={`overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS} divide-y divide-white/[0.06]`}>
          {page.visible.map((p) => {
            const margin = unitMarginCents(p.basePriceCents, p.costCents);
            return (
              <div key={p.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${p.isActive ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{p.name}</span>
                    {p.sku ? <span className="font-mono text-[10px] text-white/30">{p.sku}</span> : null}
                    <Pill tone="slate">{p.kind === "digital" ? t("kind_digital") : t("kind_physical")}</Pill>
                    {p.consignable ? <Pill tone="slate">{t("consignable")}</Pill> : null}
                    {!p.isActive ? <Pill tone="muted">{t("archived")}</Pill> : null}
                    {p.tiers.length > 0 ? <Pill tone="slate">{t.plural("tiers", p.tiers.length)}</Pill> : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-white/40">
                    <span>{t("pricePerUnit", { price: money(p.basePriceCents, p.currency), unit: p.unitLabel })}</span>
                    {p.costCents != null ? <span>{t("costValue", { amount: money(p.costCents, p.currency) })}</span> : null}
                    {p.costCents != null ? (
                      <span className={margin >= 0 ? "text-emerald-300/70" : "text-red-300/80"}>
                        {t("marginValue", { amount: money(margin, p.currency) })}
                      </span>
                    ) : null}
                    {p.suggestedRetailCents ? <span>{t("resaleValue", { amount: money(p.suggestedRetailCents, p.currency) })}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {p.kind === "physical" && (
                    <Button variant="ghost" size="icon" onClick={() => setTiersFor(p)} title={t("volumePricing")} aria-label={t("volumePricing")}>
                      <Layers />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setEditing(p)} title={t("edit")} aria-label={t("edit")}>
                    <Pencil />
                  </Button>
                  {p.isActive && (
                    <Button variant="ghost" size="icon" onClick={() => setArchiving(p)} disabled={remove.isPending} title={t("archive")} aria-label={t("archive")}>
                      <Archive />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ListPager shown={page.shown} total={page.total} hasMore={page.hasMore} onMore={page.showMore} />

      <ProductDialog open={creating} onOpenChange={setCreating} />
      <ProductDialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} product={editing} />
      <TiersDialog open={Boolean(tiersFor)} onOpenChange={(o) => !o && setTiersFor(null)} product={tiersFor} />
      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={tu("archiveProductTitle", { name: archiving?.name ?? "" })}
        description={tu("archiveProductBody")}
        confirmLabel={t("archive")}
        destructive
        onConfirm={() => (archiving ? remove.mutateAsync(archiving.id) : undefined)}
      />
    </div>
  );
}

function ProductDialog({
  open, onOpenChange, product,
}: { open: boolean; onOpenChange: (o: boolean) => void; product?: ProductWithTiers | null }) {
  const { create, update } = useProductMutations();
  const t = useT(manageMessages);
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [initial, setInitial] = useState<ProductInput>(EMPTY);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  // Reload the form when the dialog opens on a different product.
  // Closing drops unsaved edits: the next open starts from the saved product.
  const targetId = product?.id ?? null;
  if (!open && loadedId !== -1) setLoadedId(-1);
  if (open && targetId !== loadedId) {
    const next = product ? formFrom(product) : { ...EMPTY, unitLabel: t("defaultUnit") };
    setLoadedId(targetId);
    setForm(next);
    setInitial(next);
  }

  const margin = unitMarginCents(form.basePriceCents ?? 0, form.costCents);
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const pending = create.isPending || update.isPending;

  async function submit() {
    const payload = { ...form, sku: form.sku?.trim() || null, category: form.category?.trim() || null };
    if (product) await update.mutateAsync({ id: product.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">{product ? t("editProduct", { name: product.name }) : t("newProduct")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5">
          <Field label={t("fieldName")}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label={t("fieldSku")} hint={t("optional")}>
              <Input value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} />
            </Field>
            <Field label={t("fieldType")}>
              <Select value={form.kind ?? "physical"} onChange={(e) => set("kind", e.target.value as "digital" | "physical")}
                options={[{ value: "physical", label: t("kindOption_physical") }, { value: "digital", label: t("kindOption_digital") }]} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label={t("fieldCategory")} hint={t("optional")}>
              <Input value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} placeholder={t("categoryPlaceholder")} />
            </Field>
            <Field label={t("soldPer")}>
              <Input value={form.unitLabel ?? t("defaultUnit")} onChange={(e) => set("unitLabel", e.target.value)} placeholder={t("soldPerPlaceholder")} />
            </Field>
          </div>

          {/* Green: this block is money (what they pay, what it costs, what we keep). */}
          <div className="space-y-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-3.5">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("priceB2B")} hint={t("theyPay")}>
                <CentsInput valueCents={form.basePriceCents ?? 0} onChangeCents={(c) => set("basePriceCents", c)} />
              </Field>
              <Field label={t("costToMake")}>
                <CentsInput valueCents={form.costCents ?? 0} onChangeCents={(c) => set("costCents", c || null)} />
              </Field>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
              <span className="text-xs text-white/50">{t("youKeepPer", { unit: form.unitLabel || t("defaultUnit") })}</span>
              <span className={`text-lg font-bold tabular-nums ${margin >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {formatMoney(margin, form.currency ?? "USD", t.locale)}
              </span>
            </div>
          </div>

          <Field label={t("suggestedResale")} hint={t("suggestedResaleHint")}>
            <CentsInput valueCents={form.suggestedRetailCents ?? 0} onChangeCents={(c) => set("suggestedRetailCents", c || null)} />
          </Field>

          <Field label={t("fieldDescription")} hint={t("optional")}>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} className="min-h-0" />
          </Field>

          <div className="space-y-2">
            <SwitchRow checked={Boolean(form.consignable)} onCheckedChange={(checked) => set("consignable", checked)} label={t("canConsign")} />
            <SwitchRow checked={form.isActive !== false} onCheckedChange={(checked) => set("isActive", checked)} label={t("activeCanSell")} />
          </div>

          <FormFooter dirty={Boolean(product) && dirty} onCancel={() => onOpenChange(false)}>
            <Button variant="brand" onClick={() => void submit().catch(() => undefined)} disabled={!form.name.trim() || (Boolean(product) && !dirty)} loading={pending}>
              {product ? t("saveChanges") : t("createProduct")}
            </Button>
          </FormFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TiersDialog({
  open, onOpenChange, product,
}: { open: boolean; onOpenChange: (o: boolean) => void; product: ProductWithTiers | null }) {
  const { replaceTiers } = useProductMutations();
  const t = useT(manageMessages);
  const tu = useT(adminUiMessages);
  const [rows, setRows] = useState<{ minQuantity: string; unitPrice: string }[]>([]);
  const [initial, setInitial] = useState("");
  const [loadedId, setLoadedId] = useState<number | null>(null);

  if (!open && loadedId !== null) setLoadedId(null);
  if (open && product && product.id !== loadedId) {
    const next = product.tiers.map((tier) => ({
      minQuantity: String(tier.minQuantity),
      unitPrice: (tier.unitPriceCents / 100).toFixed(2),
    }));
    setLoadedId(product.id);
    setRows(next);
    setInitial(JSON.stringify(next));
  }
  if (!product) return null;

  const parsed = rows
    .map((r) => ({ minQuantity: Math.floor(Number(r.minQuantity) || 0), unitPriceCents: inputToCents(r.unitPrice) }))
    .filter((r) => r.minQuantity > 0);
  const duplicate = new Set(parsed.map((r) => r.minQuantity)).size !== parsed.length;
  const dirty = JSON.stringify(rows) !== initial;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">{t("volumePricingTitle", { name: product.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-white/45">
            {t("tiersExplainer", { price: formatMoney(product.basePriceCents, product.currency, t.locale) })}
          </p>

          {rows.map((row, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={t("fromQty")} className="flex-1">
                <Input value={row.minQuantity} inputMode="numeric" className="tabular-nums"
                  onChange={(e) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, minQuantity: e.target.value } : r))} />
              </Field>
              <Field label={t("unitPrice")} className="flex-1">
                <Input value={row.unitPrice} inputMode="decimal" className="tabular-nums"
                  onChange={(e) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, unitPrice: e.target.value } : r))} />
              </Field>
              <Button variant="ghost" size="icon" onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))}
                aria-label={tu("removeTier")} title={tu("removeTier")}>
                <Trash2 />
              </Button>
            </div>
          ))}

          <Button variant="secondary" className="w-full" onClick={() => setRows((p) => [...p, { minQuantity: "", unitPrice: "" }])}>
            <Plus /> {t("addTier")}
          </Button>

          {duplicate && <p className="text-xs text-red-300">{t("duplicateTier")}</p>}

          <FormFooter dirty={dirty} onCancel={() => onOpenChange(false)}>
            <Button variant="brand" disabled={duplicate || !dirty} loading={replaceTiers.isPending}
              onClick={async () => { await replaceTiers.mutateAsync({ id: product.id, tiers: parsed }).then(() => onOpenChange(false), () => undefined); }}>
              {t("savePricing")}
            </Button>
          </FormFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
