import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, ImageOff, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { TAG_SHOWCASE_MAX_QUANTITY, type TagShowcaseInput, type TagShowcaseItem } from "@shared/tagShowcase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { Pill } from "@/components/xpot/StatusPill";
import { SwitchRow } from "@/components/xpot/SwitchRow";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/format";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { ADMIN_TAGS_KEY, STALE_MS, deleteJson, errorMessage, getJson, invalidateAdminTags, sendJson } from "./api";
import { Loading, LoadError } from "./pieces-shared";

// Manage › Shop (the Xpot admin's): the entries resellers see in Tags › Shop. Xpot sells nothing; each entry is a
// piece model or a ready-made kit that sends the reseller to the Stuscle store. A kit lists the Stuscle SKUs and
// quantities its link puts in the cart; the price that counts is Stuscle's.

const SHOWCASE_KEY = [ADMIN_TAGS_KEY, "showcase"] as const;

type Form = {
  kind: "model" | "kit";
  title: string;
  description: string;
  includes: string;
  imageUrl: string;
  items: string;
  price: string;
  sortOrder: string;
  isPublished: boolean;
};

const EMPTY: Form = { kind: "kit", title: "", description: "", includes: "", imageUrl: "", items: "", price: "", sortOrder: "0", isPublished: false };

function toForm(item: TagShowcaseItem): Form {
  return {
    kind: item.kind,
    title: item.title,
    description: item.description ?? "",
    includes: item.includes.join("\n"),
    imageUrl: item.imageUrl ?? "",
    items: item.items.map((line) => `${line.sku}:${line.quantity}`).join("\n"),
    price: item.referencePriceCents === null ? "" : (item.referencePriceCents / 100).toFixed(2),
    sortOrder: String(item.sortOrder),
    isPublished: item.isPublished,
  };
}

/** One line per SKU: `SKU:quantity`, `SKU quantity` or just `SKU` (quantity 1). Null when a line is not one of those. */
function parseItems(text: string): Array<{ sku: string; quantity: number }> | null {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const items: Array<{ sku: string; quantity: number }> = [];
  for (const line of lines) {
    const [sku, rawQuantity, ...rest] = line.split(/[:\s]+/);
    const quantity = rawQuantity === undefined ? 1 : Number(rawQuantity);
    if (!sku || rest.length || !Number.isInteger(quantity) || quantity < 1 || quantity > TAG_SHOWCASE_MAX_QUANTITY) return null;
    items.push({ sku, quantity });
  }
  return items;
}

function toPayload(form: Form): TagShowcaseInput | null {
  const items = parseItems(form.items);
  if (items === null) return null;
  const cents = form.price.trim() === "" ? null : Math.round(Number(form.price.replace(",", ".")) * 100);
  if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return null;
  return {
    kind: form.kind,
    title: form.title,
    description: form.description,
    includes: form.includes.split("\n").map((line) => line.trim()).filter(Boolean),
    imageUrl: form.imageUrl,
    items: form.kind === "kit" ? items : [],
    referencePriceCents: cents,
    sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
    isPublished: form.isPublished,
  };
}

function ShowcaseDialog({ item, open, onOpenChange }: { item: TagShowcaseItem | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(manageTagsMessages);
  const tc = useT(commonMessages);
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(item ? toForm(item) : EMPTY);
  const payload = toPayload(form);
  const kit = form.kind === "kit";
  const save = useMutation({
    mutationFn: (body: TagShowcaseInput) =>
      item ? sendJson<TagShowcaseItem>("PATCH", `/api/xpot/admin/tag-showcase/${item.id}`, body) : sendJson<TagShowcaseItem>("POST", "/api/xpot/admin/tag-showcase", body),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: t("shopSaved") });
      onOpenChange(false);
    },
    onError: (err) => toast({ title: t("shopCouldNotSave"), description: errorMessage(err), variant: "destructive" }),
  });
  const itemsError = kit && payload === null ? t("shopFieldItemsInvalid") : undefined;
  const ready = form.title.trim().length > 0 && payload !== null && (!kit || payload.items.length > 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? t("shopEdit") : t("shopNew")}</DialogTitle>
          <DialogDescription>{t("shopDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("shopFieldKind")}>
              <Select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value === "model" ? "model" : "kit" })}
                options={[
                  { value: "kit", label: t("shopKindKit") },
                  { value: "model", label: t("shopKindModel") },
                ]}
                data-testid="showcase-kind"
              />
            </Field>
            <Field label={t("shopFieldOrder")} hint={t("shopFieldOrderHint")}>
              <Input type="number" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </Field>
          </div>
          <Field label={t("shopFieldTitle")} required>
            <Input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="showcase-title" />
          </Field>
          <Field label={t("shopFieldDescription")}>
            <Textarea value={form.description} maxLength={1000} rows={3} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label={t("shopFieldIncludes")} hint={t("shopFieldIncludesHint")}>
            <Textarea value={form.includes} rows={4} onChange={(e) => setForm({ ...form, includes: e.target.value })} />
          </Field>
          <Field label={t("shopFieldImage")} hint={t("shopFieldImageHint")}>
            <Input type="url" inputMode="url" value={form.imageUrl} placeholder="https://" onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          </Field>
          {kit && (
            <Field label={t("shopFieldItems")} hint={t("shopFieldItemsHint")} error={itemsError} required>
              <Textarea
                value={form.items}
                rows={4}
                spellCheck={false}
                className="font-mono"
                placeholder="KIT-POKEMON-48-STARTER:1"
                onChange={(e) => setForm({ ...form, items: e.target.value })}
                data-testid="showcase-items"
              />
            </Field>
          )}
          <Field label={t("shopFieldPrice")} hint={t("shopFieldPriceHint")}>
            <Input inputMode="decimal" value={form.price} placeholder="0.00" onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
          <SwitchRow
            checked={form.isPublished}
            onCheckedChange={(isPublished) => setForm({ ...form, isPublished })}
            label={t("shopFieldPublish")}
            hint={t("shopFieldPublishHint")}
            testId="showcase-published"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button type="button" variant="brand" accent="tags" disabled={!ready} loading={save.isPending} onClick={() => payload && save.mutate(payload)} data-testid="showcase-save">
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShowcaseTab() {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  const [editing, setEditing] = useState<TagShowcaseItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<TagShowcaseItem | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: SHOWCASE_KEY,
    queryFn: () => getJson<TagShowcaseItem[]>("/api/xpot/admin/tag-showcase"),
    staleTime: STALE_MS,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteJson<{ ok: true }>(`/api/xpot/admin/tag-showcase/${id}`),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: t("shopDeleted") });
    },
    onError: (err) => toast({ title: t("shopCouldNotDelete"), description: errorMessage(err), variant: "destructive" }),
  });

  return (
    <div className="space-y-4" data-testid="admin-showcase">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 max-w-2xl text-sm text-white/60">{t("shopAdminIntro")}</p>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href="/tags/shop" target="_blank" rel="noopener noreferrer">
              {t("shopPreview")}
              <ExternalLink />
            </a>
          </Button>
          <Button type="button" variant="brand" accent="tags" size="sm" onClick={() => setEditing("new")} data-testid="showcase-new">
            <Plus />
            {t("shopNew")}
          </Button>
        </div>
      </div>

      {error && !data ? (
        <LoadError what={t("shopWhat")} error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Loading />
      ) : data && data.length > 0 ? (
        <ul className="space-y-2">
          {data.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3" data-testid="showcase-row">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/20">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-white/20" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/45">
                  <Pill tone={item.kind === "kit" ? "violet" : "slate"}>{item.kind === "kit" ? t("shopKindKit") : t("shopKindModel")}</Pill>
                  <Pill tone={item.isPublished ? "green" : "muted"}>{item.isPublished ? t("shopPublished") : t("shopDraft")}</Pill>
                  {item.kind === "kit" && <span>{t("shopSkuCount", { count: item.items.length })}</span>}
                  {item.referencePriceCents !== null && <span>{formatMoney(item.referencePriceCents, item.currency)}</span>}
                </span>
              </span>
              <Button type="button" variant="ghost" size="icon" aria-label={t("shopEdit")} onClick={() => setEditing(item)} data-testid="showcase-edit">
                <Pencil />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t("shopDelete")} onClick={() => setDeleting(item)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState tone="tags" icon={ShoppingBag} title={t("shopEmpty")} hint={t("shopEmptyHint")} />
      )}

      {editing && (
        <ShowcaseDialog key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} open onOpenChange={(open) => !open && setEditing(null)} />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        tone="danger"
        title={t("shopDeleteTitle", { title: deleting?.title ?? "" })}
        description={t("shopDeleteBody")}
        confirmLabel={t("shopDelete")}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : undefined)}
      />
    </div>
  );
}
