import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Download, Factory, Layers, LockKeyhole, PackagePlus, Pencil, RotateCcw } from "lucide-react";
import { FilterBar, FilterChips } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { TagListItem } from "@shared/tagsApi";
import { resolveTagFace } from "@shared/tagFace";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { CODE_HEADING, TagModelChips, TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { BackLink } from "@/components/xpot/PageHeader";
import { Stat } from "@/components/xpot/Stat";
import { Tabs } from "@/components/xpot/Tabs";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { AdminHttpError, ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDate, formatShare, getJson, invalidateAdminTags, sendJson } from "./api";
import { countStockMetric, matchesStockMetric, type TagStockMetric } from "@shared/tagMetrics";
import { BatchStagePill, BatchStatusPill, catalogOptions, useTagCatalog } from "./batches-shared";
import { Loading, LoadError } from "./pieces-shared";
import { PieceTable } from "./piece-table";
import { useTagLabels } from "./labels";
import { JourneyPanel } from "./JourneyPanel";
import { BatchReceiveStation } from "./batch-receive";
import { canMarkStep, stageSteps, type StageStep } from "./batches-model";
import { handOutHref } from "./distribution-model";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";

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
  stage: string;
  tagCount: number;
  pendingCount: number;
  receivedCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt?: string;
  tags: TagListItem[];
}

/** Each chip is one shared stock number (shared/tagMetrics.ts), the same the stats above and the Batches list count. */
const FILTERS: ReadonlyArray<{ id: string; label: "filterAll" | "pendingPieces" | "damaged" | "houseStock" | "withResellers" | "sold" | "live"; metric: TagStockMetric | null }> = [
  { id: "all", label: "filterAll", metric: null },
  { id: "pending", label: "pendingPieces", metric: "notReceived" },
  { id: "damaged", label: "damaged", metric: "damaged" },
  { id: "house", label: "houseStock", metric: "house" },
  { id: "resellers", label: "withResellers", metric: "withResellers" },
  { id: "sold", label: "sold", metric: "sold" },
  { id: "live", label: "live", metric: "live" },
];
const passes = (filter: (typeof FILTERS)[number], t: TagListItem) => !filter.metric || matchesStockMetric(t, filter.metric);

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

const BATCH_TABS = ["summary", "print", "receive", "pieces", "handout", "activity"] as const;
type BatchTab = (typeof BATCH_TABS)[number];
const TAB_KEYS = {
  summary: "tabSummary",
  print: "tabPrint",
  receive: "tabReceive",
  pieces: "tabPieces",
  handout: "tabHandOut",
  activity: "tabActivity",
} as const satisfies Record<BatchTab, string>;

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
          {canMarkStep(step, batch.stage) ? (
            <Button type="button" variant="secondary" size="sm" loading={mark.isPending && mark.variables?.stage === step.stage} disabled={mark.isPending} onClick={() => mark.mutate(step)} data-testid={`batch-mark-${step.stage}`}>
              {t("markDone")}
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
 * One production batch, in tabs (`?tab=`): Summary (stage stepper and numbers), Print (the manufacturing package),
 * Receive (the intake station), Pieces, Hand out (into Distribution, on this batch) and Activity (its journey).
 */
export function BatchDetail({ id, go }: { id: string; go: (path: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [stateDialog, setStateDialog] = useState(false);
  const [changingState, setChangingState] = useState(false);
  // ?tab=receive&pieces=sold — survive opening a piece and coming back.
  const url = useUrlFilters({ tab: "summary", pieces: "all" });
  const tab: BatchTab = (BATCH_TABS as readonly string[]).includes(url.values.tab) ? (url.values.tab as BatchTab) : "summary";
  const filter = FILTERS.some((f) => f.id === url.values.pieces) ? url.values.pieces : "all";
  const t = useT(manageTagsBatchesMessages);
  const tf = useT(adminTagsFlowMessages);
  const labels = useTagLabels();
  const { toast } = useToast();
  const { data: batch, isLoading, error, refetch } = useQuery<BatchDetailData>({
    queryKey: [ADMIN_TAGS_KEY, "batch", id],
    queryFn: () => getJson(`/api/xpot/admin/tag-batches/${encodeURIComponent(id)}`),
    staleTime: STALE_MS,
  });

  const back = <BackLink onBack={() => go("/batches")}>{t("allBatches")}</BackLink>;

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
  const sold = countStockMetric(pieces, "sold");
  const damaged = countStockMetric(pieces, "damaged");
  const live = countStockMetric(pieces, "live");
  const chipsVerified = pieces.filter((p) => p.nfcStatus === "verified" || p.nfcStatus === "locked").length;
  const exportBase = `/api/xpot/admin/tag-batches/${encodeURIComponent(batch.id)}`;
  const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const shown = pieces.filter((p) => passes(activeFilter, p));
  const face = resolveTagFace({ batchFace: batch.face, productType: batch.productType });
  const fileBase = batch.batchCode.replace(/[^A-Za-z0-9._-]/g, "_");

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

      <div className={`space-y-4 rounded-2xl ${GLASS_CLASS} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <TagPieceVisual productType={batch.productType} face={face} size="md" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={CODE_HEADING}>{batch.batchCode}</h2>
                <BatchStagePill stage={batch.stage} />
                <BatchStatusPill status={batch.status} />
                <TagModelChips productType={batch.productType} face={face} batchCode={batch.batchCode} />
              </div>
              <p className="mt-0.5 text-sm text-white/70">{batch.name}</p>
              <p className="text-xs text-white/40">
                {labels.product(batch.productType)} · {labels.face(face)} · {batch.vendor || t("noVendor")} ·{" "}
                {tf("piecesReceivedOf", { received: batch.receivedCount, total: batch.tagCount })} · {t("createdOn", { date: formatDate(batch.createdAt) })}
              </p>
              {batch.notes && !editing && <p className="mt-2 whitespace-pre-wrap text-sm text-white/60">{batch.notes}</p>}
            </div>
          </div>
          {!editing && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setStateDialog(true)} data-testid="admin-batch-state">
                {batch.status === "open" ? <LockKeyhole className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                {batch.status === "open" ? t("closeBatch") : t("reopenBatch")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                {t("edit")}
              </Button>
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

      <Tabs
        tabs={BATCH_TABS.map((id) => ({ id, label: tf(TAB_KEYS[id]), testId: `batch-tab-${id}` }))}
        value={tab}
        onChange={(next) => url.set({ tab: next })}
        ariaLabel={batch.batchCode}
        idPrefix="batch"
        fill={false}
        accent="tags"
      />

      {tab === "summary" && (
        <div className="space-y-4" role="tabpanel" aria-labelledby="batch-tab-summary">
          <SectionCard accent="tags" icon={Factory} title={tf("productionStage")}>
            <StageStepper batch={batch} />
            <p className="mt-3 text-xs text-white/40">{tf(batch.codeSource === "scanned" ? "stageScannedHint" : "stageIssuedHint")}</p>
          </SectionCard>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Stat card label={tf("statReceived")} value={`${batch.receivedCount}/${batch.tagCount}`} detail={batch.pendingCount ? tf.plural("stillToReceive", batch.pendingCount) : tf("allReceived")} />
            <Stat card label={t("houseStock")} value={house} detail={t.plural("houseShare", total, { percent: formatShare(house, total) })} />
            <Stat card label={t("withResellers")} value={withResellers} detail={t("withResellersKitHint")} />
            <Stat card label={t("sold")} value={sold} detail={t.plural("liveCount", live)} />
            <Stat card label={t("damaged")} value={damaged} detail={t("qualityControlSample")} />
            <Stat card label={t("nfcVerified")} value={chipsVerified} detail={t("chipsShare", { percent: formatShare(chipsVerified, total) })} />
          </div>
        </div>
      )}

      {tab === "print" && (
        <SectionCard accent="tags" icon={Factory} title={t("manufacturingPackage")}>
          <p className="mb-3 text-xs text-white/40">{t("manufacturingIntro")}</p>
          {batch.codeSource === "scanned" ? <InlineAlert tone="info">{tf("printScannedNote")}</InlineAlert> : null}
          <div className="mt-3 flex flex-wrap gap-2" data-testid="batch-print-downloads">
            <DownloadButton href={`${exportBase}/export.csv`} filename={`${fileBase}.csv`}>CSV</DownloadButton>
            <DownloadButton href={`${exportBase}/qr-assets.zip`} filename={`${fileBase}-qr.zip`}>QR ZIP (SVG)</DownloadButton>
            <DownloadButton href={`${exportBase}/qr-assets.zip?png=1`} filename={`${fileBase}-qr.zip`}>QR ZIP (SVG + PNG)</DownloadButton>
          </div>
        </SectionCard>
      )}

      {tab === "receive" && <BatchReceiveStation batch={batch} onRequestClose={() => setStateDialog(true)} />}

      {tab === "pieces" && (
        <SectionCard accent="tags" icon={Layers} title={t("piecesHeading", { count: shown.length })}>
          <FilterBar
            className="mb-3"
            testId="batch-pieces-filters"
            secondary={
              <FilterChips
                items={FILTERS.map((f) => ({ id: f.id, label: t(f.label), count: pieces.filter((p) => passes(f, p)).length }))}
                value={filter}
                onChange={(next) => url.set({ pieces: next })}
                ariaLabel={t("piecesHeading", { count: total })}
              />
            }
            summary={{ shown: shown.length, total, active: filter !== "all", onClear: () => url.set({ pieces: "all" }) }}
          />
          <PieceTable
            pieces={shown}
            onOpen={(pieceId) => go(`/pieces/${pieceId}`)}
            columns={["customer", "reseller", "scans", "sold"]}
            pageSize={25}
            empty={t("noPiecesMatch")}
            testId="admin-batch-pieces"
          />
        </SectionCard>
      )}

      {tab === "handout" && (
        <SectionCard accent="tags" icon={PackagePlus} title={t("givePiecesTitle")}>
          {handOut === 0 ? (
            <p className="text-xs text-white/40">{t("noHouseLeft")}</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-white/60">{t.plural("giveKitIntro", handOut)}</p>
              <Button type="button" variant="brand" accent="tags" onClick={() => go(handOutHref(batch.id))} data-testid="batch-hand-out">
                <PackagePlus className="h-4 w-4" />
                {tf("handOutFromBatch")}
              </Button>
            </div>
          )}
        </SectionCard>
      )}

      {/* Admin only: renders nothing (and sends no request) for managers. */}
      {tab === "activity" && <JourneyPanel scope={{ batchId: batch.id }} filters={{}} title={t("batchJourney")} />}
    </div>
  );
}

