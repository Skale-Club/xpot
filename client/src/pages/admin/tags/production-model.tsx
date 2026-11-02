import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileUp, History, Layers, PackageCheck, Pencil, Printer, ShoppingBasket } from "lucide-react";
import { PRINT_PART_REASONS, isBoughtPart, type PrintBed, type PrintModelDetail, type PrintModelVersionItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { BackLink } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { Stat } from "@/components/xpot/Stat";
import { TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { partnerMaterialsMessages } from "@/i18n/messages/partnerMaterials";
import { productionMessages } from "@/i18n/messages/production";
import { AdminHttpError, ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDate, getJson, invalidateAdminTags, sendJson } from "./api";
import { useTagLabels } from "./labels";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Loading, LoadError } from "./pieces-shared";
import { MaterialsDialog, MaterialsNeeded } from "./production-materials";
import { PrintDialog, RequestList } from "./production-orders";
import { useThemeName } from "./production-identity";
import { PrintPreviewCard } from "./production-preview";
import { useModelName } from "./production-identity";
import { ModelStatusPill, PRODUCTION_BASE, bedSummary, formatBytes, uploadFile, useProductionAccess, useThemeOptions } from "./production-shared";
import { canPrintModel, orderedPath } from "./production-workflow";
import { catalogOptions, useTagCatalog } from "./batches-shared";

// One print model: what it is, its versions (newest first, with what changed and why), the orders that printed it,
// and for a part its count. A recipe change is always a new version; the model's own fields are only its name tags.

type Go = (path: string) => void;

export function PrintModelPage({ slug, go }: { slug: string; go: Go }) {
  const t = useT(productionMessages);
  const pm = useT(partnerMaterialsMessages);
  const nameOf = useModelName();
  const { toast } = useToast();
  const [printing, setPrinting] = useState(false);
  const [materials, setMaterials] = useState(false);
  const [versioning, setVersioning] = useState(false);
  // A printing branch's Rep Admin prints from here; editing the model and its versions stays the admin's.
  const { isAdmin } = useProductionAccess();
  // From an order's "Record a problem": open the next version with the problem and its batch filled in.
  const [fix, setFix] = useState<{ note: string; batch: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const note = params.get("note");
    if (!note || !isAdmin) return;
    setFix({ note, batch: params.get("fix") ?? "" });
    setVersioning(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, [isAdmin]);
  const [editing, setEditing] = useState(false);
  const [counting, setCounting] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const { data: model, isLoading, error, refetch } = useQuery({
    queryKey: [ADMIN_TAGS_KEY, "production", "model", slug],
    queryFn: () => getJson<PrintModelDetail>(`/api/xpot/admin/print-models/${encodeURIComponent(slug)}`),
    staleTime: STALE_MS,
  });
  const retire = useMutation({
    mutationFn: (retired: boolean) => sendJson<PrintModelDetail>("PATCH", `/api/xpot/admin/print-models/${encodeURIComponent(slug)}`, { retired }),
    onSuccess: async (updated) => {
      await invalidateAdminTags();
      toast({ title: updated.status === "retired" ? t("modelRetired") : t("modelRestored") });
    },
    onError: (err) => toast({ title: t("couldNotSaveModel"), description: errorMessage(err), variant: "destructive" }),
  });

  const back = <BackLink onBack={() => go(`${PRODUCTION_BASE}/models`)}>{t("tabCatalog")}</BackLink>;
  // A model that is not yours is not an error to try again: it is just not there for you.
  if (error instanceof AdminHttpError && (error.status === 404 || error.status === 403) && !model) return <div className="space-y-4">{back}<EmptyState tone="tags" icon={Layers} title={t("modelNotAvailable")} /></div>;
  if (error && !model) return <div className="space-y-4">{back}<LoadError what={t("modelWhat")} error={error} onRetry={() => void refetch()} /></div>;
  if (isLoading || !model) return <div className="space-y-4">{back}<Loading rows={4} /></div>;

  const part = model.kind === "part";
  const bought = isBoughtPart(model);
  const retired = model.status === "retired";
  const printable = canPrintModel(model);
  const noVersion = !model.currentVersion;
  // A partner reads the version in use and nothing of how it was made; the platform reads them all.
  const versions = isAdmin ? model.versions : model.versions.filter((version) => version.status === "current");
  return (
    <div className="space-y-5" data-testid="production-model">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {!part ? <TagPieceVisual productType={model.productType ?? "custom"} face={model.face} theme={model.theme} modelSlug={model.slug} size="lg" /> : null}
          <div className="min-w-0">
            <h1 className="break-words text-xl font-semibold leading-snug text-white">{nameOf(model)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/45">
              {model.status !== "ready" ? <ModelStatusPill status={model.status} /> : null}
              {bought ? <Pill tone="slate">{t("modelBought")}</Pill> : null}
              {model.lowStock ? <Pill tone="amber">{t("lowStock", { count: model.partReorderAt ?? 0 })}</Pill> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && retired ? (
            <Button type="button" variant="brand" accent="tags" size="sm" loading={retire.isPending} onClick={() => retire.mutate(false)} data-testid="production-reactivate">
              {t("restore")}
            </Button>
          ) : null}
          {isAdmin && !retired ? <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              {t("edit")}
            </Button>
            {!bought ? (
              <Button type="button" variant={noVersion ? "brand" : "secondary"} accent={noVersion ? "tags" : undefined} size="sm" onClick={() => setVersioning(true)} data-testid="production-new-version">
                <History />
                {model.currentVersion ? t("newVersion") : t("firstVersion")}
              </Button>
            ) : null}
            {bought ? (
              <Button type="button" variant="brand" accent="tags" size="sm" onClick={() => setCounting(true)}>{t("adjustCount")}</Button>
            ) : null}
          </> : null}
          {printable ? (
            <Button type="button" variant="brand" accent="tags" size="sm" onClick={() => setPrinting(true)}>
              <Printer />
              {t("print")}
            </Button>
          ) : null}
        </div>
      </header>

      {model.status === "design_needed" ? <InlineAlert tone="warning">{isAdmin ? t("designNeededBody") : t("designNeededPartner")}</InlineAlert> : null}
      {model.description && !noVersion ? <p className="max-w-3xl whitespace-pre-line text-sm text-white/60">{model.description}</p> : null}

      {noVersion ? null : (
        <dl className="grid grid-cols-3 gap-2">
          {[
            [part ? t("statOnHandPart") : t("statInHouse"), model.onHand],
            ...(!part ? [[t("statWithResellers"), model.withResellers]] : []),
            [t("statOpenOrders"), model.openJobs],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              <dt className="break-words text-[11px] font-semibold uppercase leading-tight tracking-wide text-white/45">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Two columns on a computer: what was asked and how it is made on the left, the 3D view held in place on the
          right. A phone stacks them, the 3D first. */}
      <div className={!part && model.currentVersion ? "grid items-start gap-5 lg:grid-cols-2" : ""}>
        {!part && model.currentVersion ? (
          <div className="lg:sticky lg:top-4 lg:order-2">
            <PrintPreviewCard modelSlug={model.slug} versionId={model.currentVersion.id} preview={model.currentVersion.preview} canUpload={isAdmin} />
          </div>
        ) : null}

        <div className="min-w-0 space-y-5 lg:order-1">
          {part ? (
            <SectionCard title={t("partCountTitle")} icon={PackageCheck} accent="tags" actions={isAdmin ? <Button type="button" variant={bought ? "brand" : "secondary"} accent={bought ? "tags" : undefined} size="sm" onClick={() => setCounting(true)}>{t("adjustCount")}</Button> : null}>
              {model.partMovements.length ? (
                <ul className="divide-y divide-white/[0.06] text-sm">
                  {model.partMovements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 text-white/70">
                        {t(`partReason_${m.reason}` as never)}
                        {m.note ? <span className="text-white/45"> · {m.note}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className={m.delta > 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                        <span className="text-xs text-white/40">{formatDate(m.createdAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-white/50">{t("partCountEmpty")}</p>
              )}
            </SectionCard>
          ) : null}

          {!bought && !noVersion ? (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">{t("ordersTitle")}</h2>
              <RequestList filter="all" model={model.slug} go={go} emptyHint={t("ordersEmptyHint")} />
            </section>
          ) : null}

          {!part ? (
            // The platform writes what the model needs; a partner reads it as "What you need".
            isAdmin ? (
              <SectionCard title={pm("materialsTitle")} icon={ShoppingBasket} accent="tags" actions={<Button type="button" variant="secondary" size="sm" onClick={() => setMaterials(true)} data-testid="production-materials-edit">{pm("materialsEdit")}</Button>}>
                <p className="mb-3 text-xs text-white/45">{pm("materialsIntro")}</p>
                {model.materials.length ? <MaterialsNeeded materials={model.materials} /> : <p className="text-sm text-white/50">{pm("materialsEmpty")}</p>}
              </SectionCard>
            ) : <MaterialsNeeded materials={model.materials} />
          ) : null}

          {!noVersion && !bought && versions.length ? (
            <SectionCard title={t("versionsTitle")} icon={Layers} accent="tags" bodyClassName="p-0">
              <ul className="divide-y divide-white/[0.06]">
                {versions.map((version) => (
                  <VersionRow key={version.id} model={model} version={version} admin={isAdmin} retired={retired} />
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>

      {printing && <PrintDialog model={model} onClose={() => setPrinting(false)} onOrdered={(request) => go(orderedPath(request))} />}
      {versioning && <VersionDialog model={model} fix={fix} onClose={() => { setVersioning(false); setFix(null); }} />}
      {editing && <EditModelDialog model={model} onClose={() => setEditing(false)} onRetire={() => { setEditing(false); setRetiring(true); }} />}
      {materials && <MaterialsDialog model={model} onClose={() => setMaterials(false)} />}
      {counting && <CountDialog model={model} onClose={() => setCounting(false)} />}
      <ConfirmDialog
        open={retiring}
        onOpenChange={setRetiring}
        title={model.status === "retired" ? t("restoreTitle") : t("retireTitle")}
        description={model.status === "retired" ? t("restoreBody") : t("retireBody")}
        confirmLabel={model.status === "retired" ? t("restore") : t("retire")}
        tone={model.status === "retired" ? "default" : "danger"}
        onConfirm={() => retire.mutateAsync(model.status !== "retired")}
      />
    </div>
  );
}

function VersionRow({ model, version, admin, retired }: { model: PrintModelDetail; version: PrintModelVersionItem; admin: boolean; retired: boolean }) {
  const t = useT(productionMessages);
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [bedLabel, setBedLabel] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: ({ label, file }: { label: string; file: File }) =>
      uploadFile<PrintModelVersionItem>(`/api/xpot/admin/print-models/${encodeURIComponent(model.slug)}/versions/${version.id}/beds/${encodeURIComponent(label)}/file`, file),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: t("fileUploaded") });
    },
    onError: (err) => toast({ title: t("couldNotUpload"), description: errorMessage(err), variant: "destructive" }),
  });
  const fileHref = (label: string) => `/api/xpot/admin/print-models/${encodeURIComponent(model.slug)}/versions/${version.id}/beds/${encodeURIComponent(label)}/file`;
  return (
    <li className="space-y-2 p-4" data-testid="production-version">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">v{version.version}</span>
        <Pill tone={version.status === "current" && !retired ? "green" : "muted"}>{version.status === "current" && retired ? t("versionStatus_lastUsed") : t(`versionStatus_${version.status}` as never)}</Pill>
        <span className="text-xs text-white/40">{formatDate(version.createdAt)} · {t.plural("printJobsMade", version.jobCount)}</span>
        {version.fixesBatchCode ? <Pill tone="amber">{t("fixes", { batch: version.fixesBatchCode })}</Pill> : null}
      </div>
      {admin && version.changelog ? <p className="whitespace-pre-line text-sm text-white/70">{version.changelog}</p> : null}
      <ul className="space-y-1.5">
        {version.beds.map((bed) => (
          <li key={bed.label} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-white/60">
            <span className="font-semibold text-white/80">{bedSummary(bed, t)}</span>
            {bed.swaps !== undefined && bed.swaps !== null ? <span>{t.plural("swapCount", bed.swaps)}</span> : null}
            {bed.pause ? <span>{t("pauseAt", { z: bed.pause.z })}</span> : null}
            {bed.ams?.length ? <span>{bed.ams.map((slot) => `${slot.slot}: ${slot.colour}`).join(" · ")}</span> : null}
            {model.kind === "part" ? (
              bed.fileRef ? (
                <a href={fileHref(bed.label)} className="inline-flex items-center gap-1 text-violet-300 hover:underline" target="_blank" rel="noopener noreferrer">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {bed.fileName}
                  {bed.fileBytes ? ` (${formatBytes(bed.fileBytes)})` : ""}
                </a>
              ) : version.status === "current" ? (
                <Button type="button" variant="ghost" size="sm" loading={upload.isPending && bedLabel === bed.label} onClick={() => { setBedLabel(bed.label); input.current?.click(); }}>
                  <FileUp />
                  {t("uploadBedFile")}
                </Button>
              ) : null
            ) : null}
          </li>
        ))}
      </ul>
      {admin && (Object.keys(version.params).length || Object.keys(version.recipe).length) ? (
        <details className="text-xs text-white/50">
          <summary className="cursor-pointer select-none">{t("showRecipe")}</summary>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-black/30 p-3 text-[11px] leading-relaxed text-white/70">{JSON.stringify({ params: version.params, recipe: version.recipe, consumes: version.consumes }, null, 2)}</pre>
        </details>
      ) : null}
      <input
        ref={input}
        type="file"
        accept=".3mf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && bedLabel) upload.mutate({ label: bedLabel, file });
        }}
      />
    </li>
  );
}

const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: text.trim() ? JSON.parse(text) : {} };
  } catch {
    return { ok: false };
  }
}

/** The next version, prefilled from the current one: change what has to change and say why. */
function VersionDialog({ model, fix, onClose }: { model: PrintModelDetail; fix: { note: string; batch: string } | null; onClose: () => void }) {
  const t = useT(productionMessages);
  const tc = useT(commonMessages);
  const { toast } = useToast();
  const current = model.currentVersion;
  const blankBed: PrintBed[] = [{ label: "x4", copies: 4 }];
  const [form, setForm] = useState({
    builder: current?.builder ?? "",
    params: pretty(current?.params),
    recipe: pretty(current?.recipe),
    // A part's fixed file belongs to the version that printed it: the next version starts without it.
    beds: pretty((current?.beds ?? blankBed).map(({ fileRef: _r, fileName: _n, fileBytes: _b, fileSha256: _s, ...bed }) => bed)),
    consumes: pretty(current?.consumes ?? []),
    changelog: fix?.note ?? "",
    fixesBatch: fix?.batch ?? "",
  });
  const parsed = { params: parseJson(form.params), recipe: parseJson(form.recipe), beds: parseJson(form.beds), consumes: parseJson(form.consumes) };
  const jsonOk = Object.values(parsed).every((p) => p.ok);
  const needsChangelog = Boolean(current);
  const ready = jsonOk && (!needsChangelog || form.changelog.trim());
  const save = useMutation({
    mutationFn: () =>
      sendJson<PrintModelVersionItem>("POST", `/api/xpot/admin/print-models/${encodeURIComponent(model.slug)}/versions`, {
        builder: form.builder || null,
        params: (parsed.params as { value: unknown }).value,
        recipe: (parsed.recipe as { value: unknown }).value,
        beds: (parsed.beds as { value: unknown }).value,
        consumes: (parsed.consumes as { value: unknown }).value,
        changelog: form.changelog,
        fixesBatch: form.fixesBatch,
      }),
    onSuccess: async (version) => {
      await invalidateAdminTags();
      toast({ title: t("versionCreated", { version: version.version }) });
      onClose();
    },
    onError: (err) => toast({ title: t("couldNotSaveVersion"), description: errorMessage(err), variant: "destructive" }),
  });
  const jsonField = (key: "params" | "recipe" | "beds" | "consumes", label: string, hint: string, rows: number) => (
    <Field label={label} hint={hint} error={parsed[key].ok ? undefined : t("invalidJson")}>
      <Textarea value={form[key]} rows={rows} spellCheck={false} className="font-mono text-xs" onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{current ? t("newVersionTitle", { version: current.version + 1 }) : t("firstVersion")}</DialogTitle>
          <DialogDescription>{t("versionDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("fieldChangelog")} hint={t("fieldChangelogHint")} required={needsChangelog}>
            <Textarea value={form.changelog} rows={3} maxLength={4000} onChange={(e) => setForm({ ...form, changelog: e.target.value })} data-testid="production-version-changelog" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {model.kind === "serialized" ? (
              <Field label={t("fieldBuilder")} hint={t("fieldBuilderHint")}>
                <Input value={form.builder} spellCheck={false} className="font-mono" placeholder="plate.menu" onChange={(e) => setForm({ ...form, builder: e.target.value })} />
              </Field>
            ) : null}
            <Field label={t("fieldFixesBatch")} hint={t("fieldFixesBatchHint")}>
              <Input value={form.fixesBatch} spellCheck={false} className="font-mono uppercase" placeholder="LPLATE-2026-005" onChange={(e) => setForm({ ...form, fixesBatch: e.target.value })} />
            </Field>
          </div>
          {jsonField("recipe", t("fieldRecipe"), t("fieldRecipeHint"), 6)}
          {jsonField("beds", t("fieldBeds"), t("fieldBedsHint"), 8)}
          {model.kind === "serialized" ? jsonField("params", t("fieldParams"), t("fieldParamsHint"), 4) : null}
          {model.kind === "serialized" ? jsonField("consumes", t("fieldConsumes"), t("fieldConsumesHint"), 3) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="button" variant="brand" accent="tags" disabled={!ready} loading={save.isPending} onClick={() => save.mutate()} data-testid="production-version-save">
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditModelDialog({ model, onClose, onRetire }: { model: PrintModelDetail; onClose: () => void; onRetire: () => void }) {
  const t = useT(productionMessages);
  const tc = useT(commonMessages);
  const { toast } = useToast();
  const labels = useTagLabels();
  const { data: catalog = [] } = useTagCatalog();
  const serialized = model.kind === "serialized";
  const themeOptions = useThemeOptions(model.theme);
  // The batches printed from the model keep their product and face: once a plate was ordered they stay (server: print_model_used).
  const used = model.versions.some((version) => version.jobCount > 0);
  const productLocked = used && !!model.productType;
  const faceLocked = used && !!model.face;
  const [form, setForm] = useState({
    title: model.title,
    theme: model.theme?.toLowerCase() ?? "",
    description: model.description ?? "",
    sortOrder: String(model.sortOrder),
    reorderAt: model.partReorderAt === null ? "" : String(model.partReorderAt),
    productType: model.productType ?? "",
    face: model.face ?? "",
    salesProductId: model.salesProductId ? String(model.salesProductId) : "",
    batchPrefix: model.batchPrefix ?? "",
  });
  // A serialized model keeps everything it needs to be printed and generated (shared SERIALIZED_MODEL_FIELDS).
  const ready = form.title.trim() && (!serialized || (form.productType && form.face && form.theme && form.salesProductId && form.batchPrefix.trim()));
  const save = useMutation({
    mutationFn: () =>
      sendJson<PrintModelDetail>("PATCH", `/api/xpot/admin/print-models/${encodeURIComponent(model.slug)}`, {
        title: form.title,
        theme: form.theme || null,
        description: form.description,
        sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
        ...(model.kind === "part" ? { partReorderAt: form.reorderAt.trim() === "" ? null : Math.max(0, Number.parseInt(form.reorderAt, 10) || 0) } : {}),
        ...(serialized ? {
          ...(productLocked ? {} : { productType: form.productType }),
          ...(faceLocked ? {} : { face: form.face }),
          salesProductId: Number(form.salesProductId),
          batchPrefix: form.batchPrefix,
        } : {}),
      }),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: t("modelSaved") });
      onClose();
    },
    onError: (err) => toast({ title: t("couldNotSaveModel"), description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("edit")}</DialogTitle>
          <DialogDescription>{t("editModelDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("fieldTitle")} required className="sm:col-span-2">
            <Input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <p className="text-xs text-white/45 sm:col-span-2">{t("shortNameLine", { name: model.slug })}</p>
          <Field label={t("fieldTheme")} required={serialized}>
            <Select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} placeholder={t("choose")} options={themeOptions} />
          </Field>
          <Field label={t("fieldOrder")}>
            <Input type="number" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </Field>
          {serialized ? (
            <>
              <Field label={t("fieldType")} required hint={productLocked || faceLocked ? t("productFaceLocked") : undefined}>
                <Select value={form.productType} disabled={productLocked} onChange={(e) => setForm({ ...form, productType: e.target.value })} placeholder={t("choose")} options={labels.productOptions} />
              </Field>
              <Field label={t("fieldFace")} required>
                <Select value={form.face} disabled={faceLocked} onChange={(e) => setForm({ ...form, face: e.target.value })} placeholder={t("choose")} options={labels.faceOptions} />
              </Field>
              <Field label={t("fieldSoldAs")} hint={t("fieldSoldAsHint")} required>
                <Select value={form.salesProductId} onChange={(e) => setForm({ ...form, salesProductId: e.target.value })} placeholder={t("choose")} options={catalogOptions(catalog)} />
              </Field>
              <Field label={t("fieldBatchPrefix")} hint={t("fieldBatchPrefixHint")} required>
                <Input value={form.batchPrefix} maxLength={12} className="font-mono uppercase" onChange={(e) => setForm({ ...form, batchPrefix: e.target.value })} />
              </Field>
            </>
          ) : null}
          {model.kind === "part" ? (
            <Field label={t("fieldReorderAt")} hint={t("fieldReorderAtHint")} className="sm:col-span-2">
              <Input type="number" inputMode="numeric" min={0} value={form.reorderAt} onChange={(e) => setForm({ ...form, reorderAt: e.target.value })} />
            </Field>
          ) : null}
          <Field label={t("fieldDescription")} className="sm:col-span-2">
            <Textarea value={form.description} rows={3} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onRetire}>
            {model.status === "retired" ? t("restore") : t("retire")}
          </Button>
          <span className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant="brand" accent="tags" disabled={!ready} loading={save.isPending} onClick={() => save.mutate()}>
              {tc("save")}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountDialog({ model, onClose }: { model: PrintModelDetail; onClose: () => void }) {
  const t = useT(productionMessages);
  const tc = useT(commonMessages);
  const { toast } = useToast();
  const [form, setForm] = useState({ delta: "", reason: "adjustment", note: "" });
  const delta = Number.parseInt(form.delta, 10);
  const valid = Number.isInteger(delta) && delta !== 0 && model.onHand + delta >= 0;
  const save = useMutation({
    mutationFn: () => sendJson<PrintModelDetail>("POST", `/api/xpot/admin/print-models/${encodeURIComponent(model.slug)}/part-count`, { delta, reason: form.reason, note: form.note }),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: t("countSaved") });
      onClose();
    },
    onError: (err) => toast({ title: t("couldNotSaveCount"), description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("adjustCount")}</DialogTitle>
          <DialogDescription>{t("adjustCountDesc", { count: model.onHand })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("fieldDelta")} hint={t("fieldDeltaHint")} error={form.delta && !valid ? t("fieldDeltaInvalid") : undefined}>
            <Input inputMode="numeric" value={form.delta} placeholder="-2" onChange={(e) => setForm({ ...form, delta: e.target.value })} />
          </Field>
          <Field label={t("fieldReason")}>
            <Select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} options={PRINT_PART_REASONS.map((reason) => ({ value: reason, label: t(`partReason_${reason}` as never) }))} />
          </Field>
          <Field label={t("fieldNote")}>
            <Input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="button" variant="brand" accent="tags" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

