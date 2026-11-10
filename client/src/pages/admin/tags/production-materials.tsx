import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { PRINT_MATERIALS_MAX, PRINT_MATERIAL_KINDS, type PrintMaterial, type PrintModelDetail } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/xpot/Field";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { partnerMaterialsMessages } from "@/i18n/messages/partnerMaterials";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";

// What a model needs besides our print files: the NFC sticker we indicate, the filament, where to buy them. The
// platform writes the list on the model page; a partner reads it as "What you need" before ordering (the board's
// Generate steps and the Print dialog show it whenever the model has any).

/** A filament's colour, from its code in the text; grey when the text has none. */
function colourOf(text: string): string {
  return /#[0-9a-f]{6}/i.exec(text)?.[0].toLowerCase() ?? "#888888";
}

/** "What you need": the model's materials, plainly: no brand, supplier or colour code. Nothing when it has none. */
export function MaterialsNeeded({ materials, filaments = [], assembly = [] }: {
  materials: readonly PrintMaterial[] | null | undefined;
  /** The filament of the version ("White PLA"), when the materials list does not name it. */
  filaments?: readonly string[];
  /** Parts one piece takes when assembled ("1 Stand base · Large"). */
  assembly?: readonly string[];
}) {
  const m = useT(partnerMaterialsMessages);
  const t = useT(productionMessages);
  // Filament is said by its colour alone: which brand and which code are the platform's business, kept in the editor below.
  const rows = (materials ?? []).filter((material) => material.kind !== "filament");
  const filamentTexts = [...(materials ?? []).filter((material) => material.kind === "filament").map((material) => `${material.name} ${material.spec ?? ""}`), ...filaments];
  const colours = Array.from(new Set(filamentTexts.map(colourOf)));
  if (!rows.length && !colours.length && !assembly.length) return null;
  return (
    <section className="space-y-2 rounded-xl border border-amber-300/20 bg-amber-400/[0.05] p-3.5" aria-label={m("needTitle")} data-testid="production-materials-needed">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-100">
          <ShoppingBasket className="h-4 w-4" aria-hidden="true" />
          {m("needTitle")}
        </h3>
        <p className="mt-0.5 text-xs text-white/50">{m("needIntro")}</p>
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {rows.map((material, index) => (
          <li key={index} className="py-2 first:pt-0 last:pb-0" data-testid="production-material">
            <p className="text-sm font-medium text-white">
              {material.name}
              {material.spec ? <span className="font-normal text-white/60"> · {material.spec}</span> : null}
            </p>
            {material.note ? <p className="mt-0.5 text-xs text-white/55">{material.note}</p> : null}
          </li>
        ))}
        {colours.length ? (
          <li className="flex items-center gap-2 py-2 first:pt-0 last:pb-0" data-testid="production-material-filament">
            <p className="text-sm font-medium text-white">{t("needFilament")}</p>
            <span className="flex items-center gap-1.5">
              {colours.map((colour) => <span key={colour} className="h-4 w-4 rounded-full border border-white/30" style={{ background: colour }} aria-hidden="true" />)}
            </span>
          </li>
        ) : null}
        {assembly.length ? (
          <li className="py-2 last:pb-0">
            <p className="text-sm font-medium text-white">{t("needAssembly")}</p>
            <p className="text-xs text-white/55">{assembly.join(" · ")}</p>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

const BLANK: PrintMaterial = { kind: "nfc_sticker", name: "" };

/** The platform's editor of a model's materials: the whole list, saved at once. */
export function MaterialsDialog({ model, onClose }: { model: PrintModelDetail; onClose: () => void }) {
  const m = useT(partnerMaterialsMessages);
  const tc = useT(commonMessages);
  const { toast } = useToast();
  const [items, setItems] = useState<PrintMaterial[]>(() => model.materials.map((material) => ({ ...material })));
  const change = (index: number, patch: Partial<PrintMaterial>) => setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  // Empty optional fields go as nothing: the server stores only what was typed.
  const clean = (item: PrintMaterial): PrintMaterial => ({
    kind: item.kind,
    name: item.name.trim(),
    ...(item.spec?.trim() ? { spec: item.spec.trim() } : {}),
    ...(item.supplier?.trim() ? { supplier: item.supplier.trim() } : {}),
    ...(item.url?.trim() ? { url: item.url.trim() } : {}),
    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
  });
  const save = useMutation({
    mutationFn: () => sendJson<PrintModelDetail>("PATCH", `/api/xpot/admin/print-models/${encodeURIComponent(model.slug)}`, { materials: items.map(clean) }),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: m("materialsSaved") });
      onClose();
    },
    onError: (err) => toast({ title: m("couldNotSaveMaterials"), description: errorMessage(err), variant: "destructive" }),
  });
  const ready = items.every((item) => item.name.trim());
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m("materialsEdit")}</DialogTitle>
          <DialogDescription>{m("materialsEditDesc")}</DialogDescription>
        </DialogHeader>
        <form
          id="production-materials-form"
          className="space-y-4"
          onSubmit={(event) => { event.preventDefault(); if (ready && !save.isPending) save.mutate(); }}
        >
          {items.map((item, index) => (
            <fieldset key={index} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3" data-testid="production-material-edit">
              <legend className="px-1 text-xs font-semibold text-white/55">{m("materialItem", { number: index + 1 })}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={m("fieldKind")}>
                  <Select
                    value={item.kind}
                    onChange={(e) => change(index, { kind: e.target.value as PrintMaterial["kind"] })}
                    options={PRINT_MATERIAL_KINDS.map((kind) => ({ value: kind, label: m(`kind_${kind}` as "kind_other") }))}
                  />
                </Field>
                <Field label={m("fieldName")} required>
                  <Input value={item.name} maxLength={120} placeholder={m("fieldNamePlaceholder")} onChange={(e) => change(index, { name: e.target.value })} />
                </Field>
                <Field label={m("fieldSpec")}>
                  <Input value={item.spec ?? ""} maxLength={120} placeholder={m("fieldSpecPlaceholder")} onChange={(e) => change(index, { spec: e.target.value })} />
                </Field>
                <Field label={m("fieldSupplier")}>
                  <Input value={item.supplier ?? ""} maxLength={120} onChange={(e) => change(index, { supplier: e.target.value })} />
                </Field>
                <Field label={m("fieldUrl")} hint={m("fieldUrlHint")} className="sm:col-span-2">
                  <Input type="url" inputMode="url" value={item.url ?? ""} maxLength={500} placeholder="https://" onChange={(e) => change(index, { url: e.target.value })} />
                </Field>
                <Field label={m("fieldNote")} className="sm:col-span-2">
                  <Input value={item.note ?? ""} maxLength={500} onChange={(e) => change(index, { note: e.target.value })} />
                </Field>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setItems((list) => list.filter((_, i) => i !== index))} aria-label={m("removeMaterial", { number: index + 1 })}>
                <Trash2 />
                {m("removeShort")}
              </Button>
            </fieldset>
          ))}
          <Button type="button" variant="secondary" size="sm" disabled={items.length >= PRINT_MATERIALS_MAX} onClick={() => setItems((list) => [...list, { ...BLANK }])} data-testid="production-material-add">
            <Plus />
            {m("addMaterial")}
          </Button>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>{tc("cancel")}</Button>
          <Button type="submit" form="production-materials-form" variant="brand" accent="tags" disabled={!ready} loading={save.isPending} data-testid="production-materials-save">
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
