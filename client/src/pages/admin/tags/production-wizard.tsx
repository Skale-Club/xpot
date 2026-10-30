import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Info } from "lucide-react";
import { TAG_MAX_BATCH_QUANTITY, TAG_PRODUCT_TYPES } from "@shared/tags";
import type { PrintModelItem, PrintRequestItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { batchWorkspaceMessages } from "@/i18n/messages/batchWorkspace";
import { productionMessages } from "@/i18n/messages/production";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { ProductionIdentity, ProductionPlatePreview } from "./production-identity";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { catalogOptions, useTagCatalog } from "./batches-shared";
import { useTagLabels } from "./labels";
import { bedSummary, usePrintModels } from "./production-shared";
import { canPrintModel, printableBeds, printQuantity, type ExistingProductionBatch } from "./production-workflow";

const EMPTY_FORM = {
  name: "", batchCode: "", productType: TAG_PRODUCT_TYPES[0] as string,
  salesProductId: "", face: "", vendor: "", notes: "",
  codes: "print" as "print" | "issued" | "scanned", quantity: "4",
};

export function ProductionWizard({ onClose, onCreated, onOrdered, onCloseAutoFocus, initialModel, existingBatch }: {
  onClose: () => void;
  onCreated?: (id: string) => void;
  onOrdered?: (request: PrintRequestItem) => void;
  onCloseAutoFocus?: (event: Event) => void;
  initialModel?: PrintModelItem;
  existingBatch?: ExistingProductionBatch;
}) {
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);
  const tw = useT(batchWorkspaceMessages);
  const tc = useT(commonMessages);
  const tp = useT(productionMessages);
  const u = useT(unifiedProductionMessages);
  const labels = useTagLabels();
  const { data: catalog = [], isLoading: catalogLoading, error: catalogError, refetch: reloadCatalog } = useTagCatalog();
  const modelsQuery = usePrintModels();
  const [form, setForm] = useState({ ...EMPTY_FORM, quantity: String(initialModel?.currentVersion?.beds[0]?.copies ?? 4) });
  const [modelId, setModelId] = useState(initialModel?.id ?? "");
  const models = (modelsQuery.data ?? (initialModel ? [initialModel] : [])).filter((m) => canPrintModel(m, existingBatch));
  const model = models.find((m) => m.id === modelId);
  const [bedLabel, setBedLabel] = useState("");
  const beds = model ? printableBeds(model, existingBatch) : [];
  const bed = beds.find((b) => b.label === bedLabel) ?? beds[0];
  const [step, setStep] = useState(0);
  // Printing is the way in; supplier orders and existing codes sit behind a small link.
  const [otherWays, setOtherWays] = useState(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const stepHeadingId = useId();
  useEffect(() => { stepHeading.current?.focus(); }, [step]);
  const set = (patch: Partial<typeof EMPTY_FORM>) => setForm((f) => ({ ...f, ...patch }));
  const quantity = Number(form.quantity);
  const printing = form.codes === "print";
  const printPlan = printQuantity(existingBatch ? String(existingBatch.tagCount) : form.quantity, bed?.copies ?? 1, model?.kind === "serialized");
  const issuing = form.codes === "issued";
  const quantityOk = printing ? printPlan.valid : !issuing || (Number.isInteger(quantity) && quantity >= 1 && quantity <= TAG_MAX_BATCH_QUANTITY);
  const productReady = printing ? !!model && !!bed : form.name.trim().length > 0 && catalog.some((p) => p.id === Number(form.salesProductId));
  const ready = productReady && quantityOk;
  const stepNames = [tw("stepProduct"), printing ? u("quantityStep") : tw("stepCodes"), tw("stepReview")];
  const create = useMutation({
    mutationFn: () => sendJson<{ id: string; batchCode: string; quantity: number; codeSource: string }>("POST", "/api/xpot/admin/tag-batches", {
      name: form.name.trim(), batchCode: form.batchCode.trim() || undefined, productType: form.productType,
      salesProductId: Number(form.salesProductId), face: form.face || null,
      vendor: form.vendor.trim() || null, notes: form.notes.trim() || null, ...(issuing ? { quantity } : {}),
    }),
    onSuccess: (batch) => {
      void invalidateAdminTags();
      toast({ title: t("batchCreated", { code: batch.batchCode }), description: batch.codeSource === "issued" ? t.plural("batchIssuedDesc", batch.quantity) : t("batchCreatedDesc") });
      onClose();
      onCreated?.(batch.id);
    },
    onError: (err) => toast({ title: t("couldNotCreateBatch"), description: errorMessage(err), variant: "destructive" }),
  });
  const order = useMutation({
    mutationFn: () => sendJson<PrintRequestItem>("POST", "/api/xpot/admin/print-jobs", {
      model: model!.id, bed: bed!.label, quantity: printPlan.count, notes: form.notes.trim() || null,
      ...(existingBatch ? { existingBatch: existingBatch.id } : {}),
    }),
    onSuccess: (request) => {
      void invalidateAdminTags();
      toast({ title: tp("ordered"), description: u("requestCreated") });
      onClose();
      onOrdered?.(request);
    },
    onError: (err) => toast({ title: tp("couldNotOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  const busy = create.isPending || order.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (step === 0 && productReady) setStep(1);
    else if (step === 1 && quantityOk) setStep(2);
    else if (step === 2 && ready) { if (printing) order.mutate(); else create.mutate(); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent phoneSheet className="flex max-h-[min(90dvh,850px)] max-w-2xl flex-col gap-0 overflow-hidden p-0" onCloseAutoFocus={onCloseAutoFocus} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
        <div className="shrink-0 border-b border-white/[0.08] px-5 py-5 pr-14 sm:px-6 sm:pr-14">
          <DialogTitle className="text-white">{existingBatch ? u("prepareExisting", { code: existingBatch.batchCode }) : u("newProduction")}</DialogTitle>
          <DialogDescription className="mt-2">{printing ? u(step === 0 ? "printIntro" : step === 1 ? "quantityIntro" : "reviewPrint") : step === 0 ? tw("createIntro") : step === 1 ? tw("codeIntro") : tw("reviewIntro")}</DialogDescription>
          <ol className="mt-5 flex items-center gap-2" aria-label={tw("stepCount", { current: step + 1, total: 3 })}>
            {stepNames.map((name, index) => <li key={name} className="flex min-w-0 flex-1 items-center gap-2">
              <button type="button" onClick={() => setStep(index)} disabled={index > step || busy} aria-current={step === index ? "step" : undefined} className={`flex min-h-10 items-center gap-2 text-xs font-medium ${step === index ? "text-white" : index < step ? "text-violet-300" : "text-white/35"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${index <= step ? "border-violet-400/50 bg-violet-500/20" : "border-white/15"}`}>{index < step ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}</span><span>{name}</span>
              </button>
              {index < 2 ? <span className={`h-px min-w-2 flex-1 ${index < step ? "bg-violet-400/40" : "bg-white/10"}`} aria-hidden="true" /> : null}
            </li>)}
          </ol>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" data-testid="admin-tags-new-batch-form">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6" data-testid="production-wizard-body">
          <fieldset disabled={busy} aria-labelledby={stepHeadingId} className="min-w-0 space-y-6">
            <h2 id={stepHeadingId} ref={stepHeading} tabIndex={-1} className="text-sm font-semibold text-white/85 outline-none">{printing ? stepNames[step] : step === 0 ? tw("batchIdentity") : step === 1 ? tw("codeSetup") : tw("stepReview")}</h2>
            {step === 0 && !initialModel && !existingBatch && (otherWays || !printing) ? <Field label={u("source")}><Select value={form.codes} onChange={(e) => set({ codes: e.target.value as typeof form.codes })} options={[{ value: "print", label: u("sourcePrint") }, { value: "issued", label: u("sourceSupplier") }, { value: "scanned", label: u("sourceReceive") }]} data-testid="production-source" /></Field> : null}
            {step === 0 && printing ? <div className="space-y-4">
              {modelsQuery.isLoading && !initialModel ? <p role="status" className="text-sm text-white/50">{u("loadingModels")}</p> : modelsQuery.error && !modelsQuery.data && !initialModel ? <p role="alert" className="text-sm text-red-300">{u("modelsError")} <button type="button" className="underline" onClick={() => void modelsQuery.refetch()}>{tw("retryCatalog")}</button></p> : <>
                <fieldset className="space-y-2"><legend className="mb-2 text-xs font-semibold text-white/60">{u("printModel")}</legend>
                  <div className="grid gap-2 sm:grid-cols-2" data-testid="production-model-select">
                    {models.map((choice) => <label key={choice.id} className={`relative flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors ${modelId === choice.id ? "border-violet-400/60 bg-violet-500/[0.1]" : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]"}`}>
                      <input type="radio" name="print-model" value={choice.id} checked={modelId === choice.id} required onChange={() => { setModelId(choice.id); setBedLabel(""); set({ quantity: String(printableBeds(choice, existingBatch)[0]?.copies ?? 1) }); }} className="mt-1 h-4 w-4 shrink-0 accent-violet-500" />
                      <ProductionIdentity model={choice} />
                    </label>)}
                  </div>
                </fieldset>
                {models.length === 0 ? <p className="text-sm text-amber-200" role="status">{u("noPrintModels")}</p> : null}
                {model ? <><ProductionIdentity model={model} hero /><p className="text-xs leading-relaxed text-white/45">{u("automaticCodes")}</p></> : null}
              </>}
            </div> : null}
            {step === 0 && printing && !initialModel && !existingBatch && !otherWays ? <button type="button" onClick={() => setOtherWays(true)} className="text-xs text-white/50 underline underline-offset-2 hover:text-white" data-testid="production-other-ways">{u("otherWays")}</button> : null}
            {step === 0 && !printing ? <div className="space-y-4">
              <Field label={t("fieldNameRequired")}><Input value={form.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} placeholder={t("namePlaceholder")} autoFocus /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={tw("physicalModel")}><Select value={form.productType} onChange={(e) => set({ productType: e.target.value })} options={labels.productOptions} /></Field>
                <Field label={t("fieldPrintedOnPieces")} hint={tw("faceHint")}><Select value={form.face} onChange={(e) => set({ face: e.target.value })} placeholder={form.productType === "google_review_sign" ? t("faceFromProduct") : t("faceNotSet")} options={labels.faceOptions} /></Field>
              </div>
              <Field label={tw("salesProductRequired")} hint={tw("salesProductHint")}>
                <Select value={form.salesProductId} onChange={(e) => set({ salesProductId: e.target.value })} required disabled={catalogLoading || !!catalogError} placeholder={catalogLoading ? tw("loadingCatalog") : t("chooseCatalogProduct")} options={catalogOptions(catalog)} />
              </Field>
              {catalogError ? <p role="alert" className="text-xs text-red-300">{tw("catalogError")} <button type="button" className="underline underline-offset-2" onClick={() => void reloadCatalog()}>{tw("retryCatalog")}</button></p> : !catalogLoading && catalog.length === 0 ? <p role="status" className="text-xs text-amber-300">{tw("catalogEmpty")}</p> : null}
            </div> : null}
            {step === 1 ? <fieldset aria-label={tw("codeSetup")} className="space-y-4" data-testid="admin-tags-new-batch-codes">
              {printing ? <>
                {model ? <ProductionIdentity model={model} hero /> : null}
                {beds.length > 1 ? <Field label={tp("fieldBed")}><Select value={bed?.label ?? ""} onChange={(e) => { setBedLabel(e.target.value); }} options={beds.map((b) => ({ value: b.label, label: bedSummary(b, tp) }))} data-testid="production-print-bed" /></Field> : null}
                <Field label={tp("fieldQuantity")} hint={tp(model?.kind === "serialized" ? "fieldQuantityHint" : "fieldQuantityHintPart", { copies: bed?.copies ?? 1, max: printPlan.max })}><Input type="number" inputMode="numeric" required min={1} max={printPlan.max} step={1} value={existingBatch ? existingBatch.tagCount : form.quantity} disabled={!!existingBatch} onChange={(e) => set({ quantity: e.target.value })} data-testid="production-print-quantity" /></Field>
                {printPlan.valid ? <p className="rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-3 text-sm text-white/75" data-testid="production-print-summary">{tp.plural("plateSplit", printPlan.plates.length, { split: printPlan.plates.join(" + ") })}{model?.kind === "part" ? ` · ${tp.plural("willPrint", printPlan.pieces)}` : ""}</p> : null}
                {model ? <ProductionPlatePreview model={model} plates={printPlan.plates} /> : null}
              </> : <p className="text-sm text-white/65">{issuing ? tw("issueHint") : tw("scanHint")}</p>}
              {issuing ? <Field label={t("fieldQuantityRequired")} hint={t("quantityRange", { max: TAG_MAX_BATCH_QUANTITY })} className="sm:max-w-[180px]"><Input type="number" inputMode="numeric" required min={1} max={TAG_MAX_BATCH_QUANTITY} step={1} value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} className="tabular-nums" data-testid="admin-tags-new-batch-quantity" /></Field> : null}
              <p className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-relaxed text-white/50"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{tw("stockHint")}</p>
            </fieldset> : null}
            {step === 2 ? <>
              {printing && model ? <ProductionIdentity model={model} hero /> : !printing ? <ProductionIdentity model={{ title: form.name, productType: form.productType, face: form.face || (form.productType === "google_review_sign" ? "google_review" : null) }} hero /> : null}
              <dl className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm sm:grid-cols-2">
                {(printing ? [
                  [tp("fieldQuantity"), String(printPlan.pieces)],
                  [tp("fieldBed"), bed?.label],
                  [u("output"), model?.kind === "part" ? bed?.fileName ?? ".3mf" : ".3mf + .gcode.3mf"],
                  ...(existingBatch ? [[u("existingCodes"), existingBatch.batchCode]] : []),
                ] : [
                  [t("fieldName"), form.name],
                  [tw("physicalModel"), labels.product(form.productType)],
                  [t("fieldPrintedOnPieces"), form.face ? labels.face(form.face) : form.productType === "google_review_sign" ? t("faceFromProduct") : t("faceNotSet")],
                  [t("fieldCatalogProduct"), catalog.find((p) => p.id === Number(form.salesProductId))?.name],
                  [tw("stepCodes"), issuing ? t.plural("createIssuedBatch", quantity) : t("codesScanned")],
                ]).map(([label, value]) => <div key={label}><dt className="text-xs text-white/45">{label}</dt><dd className="mt-1 break-words font-medium text-white/90">{value}</dd></div>)}
              </dl>
              <details className="group border-t border-white/[0.08] pt-4">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-sm text-white/65 [&::-webkit-details-marker]:hidden">{printing ? tp("fieldNotes") : tw("optionalDetails")}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {!printing ? <><Field label={t("fieldBatchCode")} hint={t("batchCodeHint")}><Input value={form.batchCode} onChange={(e) => set({ batchCode: e.target.value.toUpperCase() })} maxLength={40} placeholder={t("batchCodeAutomatic")} className="font-mono" /></Field><Field label={t("fieldVendor")}><Input value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} maxLength={120} /></Field></> : null}
                <Field label={t("fieldNotes")} className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} rows={2} /></Field>
              </div>
              </details>
              <p className="text-xs leading-relaxed text-white/50">{printing ? existingBatch ? u("reuseCodesHint") : model?.kind === "part" ? u("partFilesHint") : u("filesHint") : u("externalHint")}</p>
            </> : null}
          </fieldset>
          </div>
          <footer className="shrink-0 space-y-4 border-t border-white/[0.08] bg-[#111727] px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-white/40">{tw("stepCount", { current: step + 1, total: 3 })}</span>
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="ghost" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)} disabled={busy}>{step === 0 ? tc("cancel") : tw("back")}</Button>
                {step < 2 ? <Button key="next" type="submit" variant="brand" accent="tags" disabled={step === 0 ? !productReady : !quantityOk} data-testid="batch-step-next">{tw("next")}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button> : <Button key="create" type="submit" variant="brand" accent="tags" disabled={!ready} loading={busy} data-testid={printing ? "production-print-confirm" : "admin-tags-new-batch-submit"}>{printing ? u("requestFiles") : issuing ? t.plural("createIssuedBatch", quantity) : t("createEmptyBatch")}</Button>}
              </div>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
