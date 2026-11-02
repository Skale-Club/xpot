import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Download, Factory, FileText, Layers, LockKeyhole, PackageCheck, PackagePlus, Pencil, Printer, RotateCcw, ScanLine } from "lucide-react";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { TagListItem } from "@shared/tagsApi";
import { resolveTagFace } from "@shared/tagFace";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagModelChips, TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { BackLink } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { Stat } from "@/components/xpot/Stat";
import { Tabs } from "@/components/xpot/Tabs";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { AdminHttpError, ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDate, formatShare, getJson, invalidateAdminTags, sendJson } from "./api";
import { countStockMetric } from "@shared/tagMetrics";
import { BatchProgressPill, catalogOptions, useTagCatalog } from "./batches-shared";
import { Loading, LoadError } from "./pieces-shared";
import { useTagLabels } from "./labels";
import { BatchReceiveStation } from "./batch-receive";
import { batchTabsFor, canMarkStep, parseBatchName, stageSteps, type StageStep } from "./batches-model";
import { handOutHref } from "./distribution-model";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { ProductionWizard } from "./production-wizard";
import { productionMessages } from "@/i18n/messages/production";
import { PRINT_THEMES, useProductionAccess } from "./production-shared";
import { useModelName } from "./production-identity";

interface BatchDetailData {
  id: string;
  batchCode: string;
  name: string;
  productType: string;
  salesProductId: number | null;
  /** The batch's own face setting (null = the product's default). */
  face: string | null;
  vendor: string | null;
  quantity: number;
  status: string;
  codeSource: string;
  /** The Tags › Production print order that issued it. */
  printJobId: string | null;
  printJobStatus: string | null;
  printJobError: string | null;
  stage: string;
  tagCount: number;
  pendingCount: number;
  receivedCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt?: string;
  tags: TagListItem[];
}

function EditBatch({ batch, onClose }: { batch: BatchDetailData; onClose: () => void }) {
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const { data: catalog = [] } = useTagCatalog();
  const initial = () => ({ name: batch.name, face: batch.face ?? "", vendor: batch.vendor ?? "", notes: batch.notes ?? "", salesProductId: batch.salesProductId ? String(batch.salesProductId) : "" });
  const [form, setForm] = useState(initial);
  useEffect(() => {
    setForm(initial());
  },[batch.name, batch.face, batch.vendor, batch.notes, batch.salesProductId]);

  const save = useMutation({
    mutationFn: () =>
      sendJson("PATCH", `/api/xpot/admin/tag-batches/${batch.id}`, {
        name: form.name,
        face: form.face || null,
        vendor: form.vendor || null,
        notes: form.notes || null,
        // Only a real change: the server re-maps the pieces that followed the old product (never sold ones).
        ...(Number(form.salesProductId) !== batch.salesProductId ? { salesProductId: Number(form.salesProductId) } : {}),
      }),
    onSuccess: () => {
      void invalidateAdminTags();
      toast({ title: t("batchUpdated") });
      onClose();
    },
    onError: (err) => toast({ title: t("couldNotUpdateBatch"), description: errorMessage(err), variant: "destructive" }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim() && !save.isPending) save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-white/5 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("fieldName")} className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
        </Field>
        <Field label={t("fieldCatalogProduct")} hint={t("catalogProductHint")}>
          <Select value={form.salesProductId} onChange={(e) => setForm({ ...form, salesProductId: e.target.value })} required placeholder={t("chooseCatalogProduct")} options={catalogOptions(catalog)} />
        </Field>
        <Field label={t("fieldPrintedOnPieces")} hint={t("printedHintEdit")} id={`batch-face-${batch.id}`}>
          <div className="flex items-center gap-2">
            <TagFaceIcon face={resolveTagFace({ batchFace: form.face || null, productType: batch.productType })} size="sm" />
            <div className="min-w-0 flex-1">
              <Select
                id={`batch-face-${batch.id}`}
                value={form.face}
                onChange={(e) => setForm({ ...form, face: e.target.value })}
                placeholder={batch.productType === "google_review_sign" ? t("faceFromProduct") : t("faceNotSet")}
                options={labels.faceOptions}
              />
            </div>
          </div>
        </Field>
        <Field label={t("fieldVendor")}>
          <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} maxLength={120} />
        </Field>
        <Field label={t("fieldNotes")} className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} rows={2} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" variant="brand" accent="tags" disabled={!form.name.trim() || !form.salesProductId} loading={save.isPending}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}

// Pieces, Hand out and Activity used to be tabs; they repeat Inventory, Distribution and the Journey log. Old ?tab= links fall back to Summary.
type BatchTab = "summary" | "print" | "receive";
const TAB_KEYS = {
  summary: "tabSummary",
  print: "tabPrint",
  receive: "tabReceive",
} as const satisfies Record<BatchTab, string>;

// The step's own name is the button: "Supplier has the files" says what is being marked, "Mark as done" did not.
const STEP_ACTION_TITLE = { art_built: "Print file ready", printed: "Printed" } as const;

/** The stage stepper: done steps checked; Print file ready and Printed get "Mark as done", which writes the journey. */
function StageStepper({ batch }: { batch: BatchDetailData }) {
  const t = useT(adminTagsFlowMessages);
  const labels = useTagLabels();
  const { toast } = useToast();
  const steps = stageSteps(batch);
  const mark = useMutation({
    mutationFn: (step: StageStep) =>
      sendJson("POST", "/api/xpot/admin/tag-journey", {
        kind: "execution",
        action: step.markAction,
        // The journey is written in English on the server too (shared/tagJourney.ts); the screen shows the stage.
        title: `${STEP_ACTION_TITLE[step.markAction!]}: batch ${batch.batchCode}`,
        batchId: batch.id,
      }),
    onSuccess: (_entry, step) => {
      void invalidateAdminTags();
      toast({ title: t("stepMarked", { step: labels.batchStage(step.stage) }) });
    },
    onError: (err) => toast({ title: t("couldNotMarkStep"), description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <ol className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]" data-testid="batch-stage-stepper">
      {steps.map((step, i) => (
        <li
          key={step.stage}
          className={`flex min-w-0 flex-col gap-2 rounded-xl border p-3 ${step.state === "current" ? "border-violet-400/40 bg-violet-500/[0.08]" : "border-white/[0.08] bg-white/[0.02]"}`}
          data-testid={`batch-step-${step.stage}`}
          data-state={step.state}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.state === "done" ? "bg-violet-500/30 text-violet-100" : "bg-white/10 text-white/60"}`}
              aria-hidden="true"
            >
              {step.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0 truncate">{labels.batchStage(step.stage)}</span>
          </span>
          <span className="text-xs text-white/45">
            {t(step.state === "done" ? "stepDone" : step.state === "current" ? (step.stage === batch.stage ? "stepInProgress" : "stepCurrent") : "stepTodo")}
          </span>
          {step.state === "current" && canMarkStep(step, batch.stage) ? (
            <Button type="button" variant="secondary" size="sm" loading={mark.isPending && mark.variables?.stage === step.stage} disabled={mark.isPending} onClick={() => mark.mutate(step)} data-testid={`batch-mark-${step.stage}`}>
              {labels.batchStage(step.stage)}
            </Button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** A manufacturing file, downloaded with a "generating…" state (a 1000-piece ZIP takes a while). */
function DownloadButton({ href, filename, children }: { href: string; filename: string; children: string }) {
  const t = useT(adminTagsFlowMessages);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(href, { credentials: "include" });
      if (!res.ok) throw new AdminHttpError(res.status, (await res.json().catch(() => null))?.message ?? t("downloadFailed"));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast({ title: t("downloadFailed"), description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant="secondary" onClick={() => void download()} loading={busy} aria-busy={busy}>
      <Download className="h-4 w-4" />
      {busy ? t("generating") : children}
    </Button>
  );
}

/**
 * One production batch, in tabs (`?tab=`): Summary (stage stepper and numbers), Print (the supplier package) and Receive (the
 * intake station). A batch from a print order points at that order's plate page instead of repeating its stage and files.
 */
export function BatchDetail({ id, go }: { id: string; go: (path: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [stateDialog, setStateDialog] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const url = useUrlFilters({ tab: "summary" });
  const t = useT(manageTagsBatchesMessages);
  const tf = useT(adminTagsFlowMessages);
  const u = useT(unifiedProductionMessages);
  const tp = useT(productionMessages);
  const labels = useTagLabels();
  const nameOf = useModelName();
  const { toast } = useToast();
  // A house print puts its pieces in stock from here too when the print page left some pending (an old print).
  const stockOwn = useMutation({
    mutationFn: (jobId: string) => sendJson("POST", `/api/xpot/admin/print-jobs/${jobId}/stock`),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: tp("piecesStocked") });
    },
    onError: (err) => toast({ title: tp("couldNotUpdateOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  // A printing branch's Rep Admin checks its own batches here (summary, files, QR check); handing out, closing and
  // editing a batch stay the admin's.
  const { isAdmin } = useProductionAccess();
  const { data: batch, isLoading, error, refetch } = useQuery<BatchDetailData>({
    queryKey: [ADMIN_TAGS_KEY, "batch", id],
    queryFn: () => getJson(`/api/xpot/admin/tag-batches/${encodeURIComponent(id)}`),
    staleTime: STALE_MS,
  });

  const back = <BackLink onBack={() => go(batch?.printJobId ? `/production/jobs/${batch.printJobId}` : "/production")}>{batch?.printJobId ? u("backToOrder") : u("title")}</BackLink>;

  if (isLoading) return <Loading rows={5} />;
  if (error || !batch) {
    const notFound = error instanceof AdminHttpError && error.status === 404;
    return (
      <div className="space-y-4">
        {back}
        {notFound || !error ? (
          <EmptyState tone="tags" icon={Layers} title={t("batchNotFound")} />
        ) : (
          <LoadError what={t("theBatches")} error={error} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const pieces = batch.tags;
  const total = pieces.length;
  const house = countStockMetric(pieces, "house");
  const handOut = countStockMetric(pieces, "handOut");
  const withResellers = countStockMetric(pieces, "withResellers");
  const withCustomer = countStockMetric(pieces, "withCustomer");
  const sold = countStockMetric(pieces, "sold");
  const damaged = countStockMetric(pieces, "damaged");
  // What is left over (internal use, reserved, lost, deactivated): a card for it, so the cards add up to the batch.
  const notReceived = countStockMetric(pieces, "notReceived");
  const other = Math.max(0, total - notReceived - damaged - house - withCustomer - withResellers - sold);
  const live = countStockMetric(pieces, "live");
  const chipsVerified = pieces.filter((p) => p.nfcStatus === "verified" || p.nfcStatus === "locked").length;
  const exportBase = `/api/xpot/admin/tag-batches/${encodeURIComponent(batch.id)}`;
  const face = resolveTagFace({ batchFace: batch.face, productType: batch.productType });
  const fileBase = batch.batchCode.replace(/[^A-Za-z0-9._-]/g, "_");
  const fromPrint = Boolean(batch.printJobId);
  // Only a supplier batch has Print and Receive; a house print's files and stock live on its print job. A stale ?tab= falls back to Summary.
  const tabs = batchTabsFor(batch);
  const tab: BatchTab = tabs.find((id) => id === url.values.tab) ?? "summary";
  const canPrepare = !fromPrint && batch.codeSource === "issued" && batch.tagCount > 0 && ["issued", "built"].includes(batch.stage) && batch.status !== "cancelled";
  // A batch from a print job is named after the piece and its place in the request: the name it was filed under says how it was ordered.
  const parsed = parseBatchName(batch.name);
  const colour = parsed.title.split(" · ").pop()?.trim().toLowerCase() ?? "";
  const title = fromPrint ? nameOf({ title: parsed.title, productType: batch.productType, face, theme: (PRINT_THEMES as readonly string[]).includes(colour) ? colour : null }) : batch.name;
  const good = Math.max(batch.receivedCount - damaged, 0);
  const receivedDetail = !total ? t("noPiecesYet") : batch.pendingCount ? tf.plural("stillToReceive", batch.pendingCount) : damaged ? tf.plural("goodAndDamaged", damaged) : tf("allReceived");
  const needsReceiving = !fromPrint && batch.status === "open" && (batch.pendingCount > 0 || total === 0);

  const closing = batch.status === "open";
  const changeState = async (reopenReason: string) => {
    if (!closing && !reopenReason.trim()) return;
    setChangingState(true);
    try {
      if (closing) {
        await sendJson("POST", `/api/xpot/admin/tag-batches/${batch.id}/close`, {});
        toast({ title: t("batchClosed") });
      } else {
        await sendJson("POST", `/api/xpot/admin/tag-batches/${batch.id}/reopen`, { reason: reopenReason.trim() });
        toast({ title: t("batchReopened") });
      }
      setStateDialog(false);
      await invalidateAdminTags();
    } catch (err) {
      toast({ title: closing ? t("couldNotCloseBatch") : t("couldNotReopenBatch"), description: errorMessage(err), variant: "destructive" });
    } finally {
      setChangingState(false);
    }
  };

  return (
    <div className="min-w-0 space-y-5">
      {back}
      {preparing ? <ProductionWizard existingBatch={{ ...batch, face }} onClose={() => setPreparing(false)} onOrdered={(request) => go(`/production/jobs/${request.plates[0].id}`)} /> : null}

      <div className={`space-y-4 rounded-2xl ${GLASS_CLASS} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <TagPieceVisual productType={batch.productType} face={face} batchCode={batch.batchCode} size="md" />
            <div className="min-w-0">
              <h2 className="break-words text-lg font-semibold leading-snug text-white">
                {title} <span className="ml-1 whitespace-nowrap font-mono text-xs font-normal text-white/45">{batch.batchCode}</span>
              </h2>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/50">
                <TagModelChips productType={batch.productType} face={face} batchCode={batch.batchCode} />
                <BatchProgressPill batch={batch} />
                {!fromPrint && batch.status !== "open" ? <Pill tone="muted">{labels.batchStatus(batch.status)}</Pill> : null}
                {fromPrint && parsed.plate ? <span className="whitespace-nowrap">{tp("plateOf", { number: parsed.plate.number, total: parsed.plate.total })}</span> : null}
                <span>{batch.vendor || t("noVendor")} · {t("createdOn", { date: formatDate(batch.createdAt) })}</span>
              </p>
              {batch.notes && !editing && <p className="mt-2 whitespace-pre-wrap text-sm text-white/60">{batch.notes}</p>}
            </div>
          </div>
          {!editing && (
            <div className="flex flex-wrap gap-2">
              {needsReceiving && tab !== "receive" ? <Button type="button" variant="brand" accent="tags" onClick={() => url.set({ tab: "receive" })} data-testid="batch-receive-now"><ScanLine className="h-4 w-4" />{u("receivePieces")}</Button> : null}
              {isAdmin ? <>
                {handOut > 0 ? <Button type="button" variant="secondary" onClick={() => go(handOutHref(batch.id))} data-testid="batch-hand-out"><PackagePlus className="h-4 w-4" />{tf("handOutAction")}</Button> : null}
                {/* A batch from a print job closes itself when its print job is done; the Receive tab has its own Close batch. */}
                {!fromPrint && tab !== "receive" && (!closing || total > 0) ? <Button type="button" variant="ghost" onClick={() => setStateDialog(true)} data-testid="admin-batch-state">
                  {closing ? <LockKeyhole className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  {closing ? t("closeBatch") : t("reopenBatch")}
                </Button> : null}
                <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  {t("edit")}
                </Button>
              </> : null}
            </div>
          )}
        </div>
        {editing && <EditBatch batch={batch} onClose={() => setEditing(false)} />}
      </div>

      <ConfirmDialog
        accent="tags"
        open={stateDialog}
        onOpenChange={setStateDialog}
        title={closing ? t("closeBatchTitle") : t("reopenBatchTitle")}
        description={closing ? t("closeBatchDescription") : undefined}
        reason={closing ? undefined : "required"}
        reasonLabel={closing ? undefined : t("reopenReasonPrompt")}
        confirmLabel={closing ? t("closeBatch") : t("reopenBatch")}
        busy={changingState}
        testId="admin-batch-state-confirm"
        onConfirm={(reason) => void changeState(reason)}
      >
        {closing && batch.pendingCount > 0 ? <InlineAlert tone="warning">{t.plural("closeBatchPending", batch.pendingCount)}</InlineAlert> : null}
      </ConfirmDialog>

      {tabs.length > 1 ? (
        <Tabs
          tabs={tabs.map((id) => ({ id, label: tf(TAB_KEYS[id]), testId: `batch-tab-${id}` }))}
          value={tab}
          onChange={(next) => url.set({ tab: next })}
          ariaLabel={batch.batchCode}
          idPrefix="batch"
          fill={false}
          accent="tags"
        />
      ) : null}

      {tab === "summary" && (
        <div className="space-y-4" role="tabpanel" aria-labelledby="batch-tab-summary">
          {fromPrint ? (
            batch.printJobStatus === "failed" || (batch.printJobStatus === "printed" && batch.pendingCount > 0) ? (
              <SectionCard accent="tags" icon={Printer} title={tp(batch.printJobStatus === "failed" ? "cardTitle_failed" : "cardTitle_printedPending")}>
                <div className="flex flex-wrap items-center justify-between gap-3" data-testid="batch-print-order-link">
                  <p className={`min-w-0 text-sm ${batch.printJobStatus === "failed" ? "text-red-200/80" : "text-white/70"}`}>
                    {batch.printJobStatus === "failed" ? batch.printJobError || tp("failedNoReason") : tp.plural("printedPending", batch.pendingCount)}
                  </p>
                  {batch.printJobStatus === "failed"
                    ? <Button type="button" variant="secondary" onClick={() => go(`/production/jobs/${batch.printJobId}`)}>{u("backToOrder")}</Button>
                    : <Button type="button" variant="brand" accent="tags" loading={stockOwn.isPending} onClick={() => stockOwn.mutate(batch.printJobId!)} data-testid="batch-put-in-stock"><PackageCheck className="h-4 w-4" />{tp.plural("putInStock", batch.pendingCount)}</Button>}
                </div>
              </SectionCard>
            ) : null
          ) : (
            <SectionCard accent="tags" icon={Factory} title={tf("productionStage")}>
              <StageStepper batch={batch} />
              {batch.stage !== "received" ? <p className="mt-3 text-xs text-white/40">{tf(batch.codeSource === "scanned" ? "stageScannedHint" : "stageIssuedHint")}</p> : null}
            </SectionCard>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat card label={tf("statReceived")} value={`${good}/${batch.tagCount}`} detail={receivedDetail} />
            <Stat card label={t("houseStock")} value={house} detail={total ? t.plural("houseShare", total, { percent: formatShare(house, total) }) : undefined} />
            {withCustomer > 0 ? <Stat card label={t("withCustomer")} value={withCustomer} detail={t("withCustomerHint")} /> : null}
            <Stat card label={t("withResellers")} value={withResellers} detail={t("withResellersKitHint")} />
            <Stat card label={t("sold")} value={sold} detail={live ? t.plural("liveCount", live) : undefined} />
            {damaged > 0 ? <Stat card label={t("damaged")} value={damaged} /> : null}
            {other > 0 ? <Stat card label={t("otherPieces")} value={other} detail={t("otherPiecesHint")} /> : null}
            {chipsVerified > 0 ? <Stat card label={t("nfcVerified")} value={chipsVerified} detail={t("chipsShare", { percent: formatShare(chipsVerified, total) })} /> : null}
          </div>
          {/* Inventory reads ?batch=<id> (PiecesTab PIECE_FILTERS): the piece list lives there, not here. */}
          {isAdmin && total ? <Button type="button" variant="secondary" onClick={() => go(`/pieces?batch=${encodeURIComponent(batch.id)}`)} data-testid="batch-see-pieces"><Layers className="h-4 w-4" />{tf("seePiecesInInventory")}</Button> : null}
        </div>
      )}

      {tab === "print" && (
        <div className="space-y-4">
        <SectionCard accent="tags" icon={FileText} title={u("supplierFiles")}>
          <p className="mb-3 text-sm text-white/55">{t("manufacturingIntro")}</p>
          {batch.codeSource === "scanned" ? <InlineAlert tone="info">{tf("printScannedNote")}</InlineAlert> : null}
          <div className="mt-3 flex flex-wrap gap-2" data-testid="batch-print-downloads">
            <DownloadButton href={`${exportBase}/export.csv`} filename={`${fileBase}.csv`}>{tf("fileCodesCsv")}</DownloadButton>
            <DownloadButton href={`${exportBase}/qr-assets.zip`} filename={`${fileBase}-qr.zip`}>{tf("fileQrSvg")}</DownloadButton>
            <DownloadButton href={`${exportBase}/qr-assets.zip?png=1`} filename={`${fileBase}-qr.zip`}>{tf("fileQrSvgPng")}</DownloadButton>
          </div>
          <details className="mt-4 text-xs text-white/50">
            <summary className="cursor-pointer select-none">{tf("chipRuleTitle")}</summary>
            <p className="mt-2 leading-relaxed">{tf("chipRule")}</p>
          </details>
        </SectionCard>
        {canPrepare ? <SectionCard accent="tags" icon={Printer} title={u("printHere")}><p className="mb-3 text-sm text-white/55">{u("reuseCodesHint")}</p><Button variant="secondary" onClick={() => setPreparing(true)} data-testid="batch-prepare-print">{u("printItHere")}</Button></SectionCard> : null}
        </div>
      )}

      {tab === "receive" && <BatchReceiveStation batch={batch} onRequestClose={isAdmin && total > 0 ? () => setStateDialog(true) : undefined} />}
    </div>
  );
}
