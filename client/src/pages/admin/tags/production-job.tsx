import { Fragment, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardList, FileUp, Files, PackageCheck, Play, Printer, RotateCcw } from "lucide-react";
import { canMarkPrinted, type PrintJobDetail, type PrintJobFileItem, type PrintRequestItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { BackLink } from "@/components/xpot/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { ADMIN_TAGS_KEY, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { DownloadFileButton, JobStatusPill, PRODUCTION_BASE, formatBytes, minutesText, uploadFile, useBuildSentence, useFileDownload, usePrintComputers, usePrintModels, useProductionAccess } from "./production-shared";
import { ProductionIdentity } from "./production-identity";
import { PrintPreviewCard } from "./production-preview";
import { PrintedDialog } from "./production-printed-dialog";
import { RedoDialog } from "./production-orders";
import { buildState, canAssembleJob, chipsWritten, damagedToReprint, plainTitle, journeyProgress, pauseNeedsChips, pendingPieces, printedOutcome, redoEffect, showPlateNumber } from "./production-workflow";

// One print job, from file preparation through printing. Marking it printed puts its pieces in stock.

type Go = (path: string) => void;
type Step = "complete" | "fail" | "cancel" | "release";

const FILE_ORDER = ["gcode_3mf", "3mf", "serial_map", "preview", "report"] as const;

/** "White PLA" is the filament; the operator loads a colour: "White" (in the language in use for the two the catalog prints in). */
function colourName(colour: string, b: (key: "theme_white" | "theme_black") => string): string {
  const plain = colour.replace(/\s*PLA$/i, "").trim();
  const key = plain.toLowerCase();
  return key === "white" ? b("theme_white") : key === "black" ? b("theme_black") : plain;
}

export function PrintJobPage({ id, go }: { id: string; go: Go }) {
  const t = useT(productionMessages);
  const b = useT(productionBoardMessages);
  const { data: models = [] } = usePrintModels();
  const { isAdmin } = useProductionAccess();
  const { loaded: computersLoaded, computers } = usePrintComputers();
  const buildSentence = useBuildSentence();
  const { toast } = useToast();
  const { download, busy: downloading } = useFileDownload();
  const input = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState<Step | null>(null);
  const [marking, setMarking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [redoing, setRedoing] = useState(false);
  const [details, setDetails] = useState(false);
  const { data: job, isLoading, error, refetch } = useQuery({
    queryKey: [ADMIN_TAGS_KEY, "production", "job", id],
    queryFn: () => getJson<PrintJobDetail>(`/api/xpot/admin/print-jobs/${id}`),
    // The print computer may be building it right now.
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.status === "building" || d.status === "requested") ? 10_000 : false;
    },
  });
  const step = useMutation({
    mutationFn: ({ action, reason }: { action: Step | "start"; reason?: string }) =>
      sendJson<PrintJobDetail>("POST", `/api/xpot/admin/print-jobs/${id}/transition`, { action, reason: reason || undefined }),
    onSuccess: async (updated) => {
      await invalidateAdminTags();
      toast({ title: t("orderNow", { status: t(`jobStatus_${updated.status}` as never) }) });
    },
    onError: (err) => toast({ title: t("couldNotUpdateOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  const problem = useMutation({
    mutationFn: (text: string) => sendJson("POST", `/api/xpot/admin/print-jobs/${id}/problem`, { text }),
    onSuccess: async (_entry, text) => {
      await invalidateAdminTags();
      toast({ title: t("problemRecorded") });
      // The fix is the model's next version: open it with this problem filled in.
      const params = new URLSearchParams({ note: text, ...(job?.batchCode ? { fix: job.batchCode } : {}) });
      go(`${PRODUCTION_BASE}/models/${job?.modelSlug}?${params.toString()}`);
    },
    onError: (err) => toast({ title: t("couldNotRecordProblem"), description: errorMessage(err), variant: "destructive" }),
  });
  const assemble = useMutation({
    mutationFn: () => sendJson<PrintJobDetail>("POST", `/api/xpot/admin/print-jobs/${id}/assembled`),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: t("assembledDone") });
    },
    onError: (err) => toast({ title: t("couldNotUpdateOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  // Plates printed before "printed" put the pieces in stock still show them pending.
  const stock = useMutation({
    mutationFn: () => sendJson<PrintJobDetail>("POST", `/api/xpot/admin/print-jobs/${id}/stock`),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: t("piecesStocked") });
    },
    onError: (err) => toast({ title: t("couldNotUpdateOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  // The damaged pieces of a printed job are asked for again as a new request, once (the server counts them and refuses a second time).
  const again = useMutation({
    mutationFn: () => sendJson<PrintRequestItem>("POST", `/api/xpot/admin/print-jobs/${id}/reprint-damaged`),
    onSuccess: async (request) => {
      await invalidateAdminTags();
      toast({ title: t("orderRedone") });
      if (request.plates[0]) go(`${PRODUCTION_BASE}/jobs/${request.plates[0].id}`);
    },
    onError: async (err) => {
      // Already asked for (another tab, a second click): the page now shows the reprint instead of the button.
      await invalidateAdminTags();
      toast({ title: t("printDamagedFailed"), description: errorMessage(err), variant: "destructive" });
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadFile<PrintJobFileItem>(`/api/xpot/admin/print-jobs/${id}/files`, file),
    onSuccess: async () => {
      await invalidateAdminTags();
      toast({ title: t("fileUploaded") });
    },
    onError: (err) => toast({ title: t("couldNotUpload"), description: errorMessage(err), variant: "destructive" }),
  });

  const back = <BackLink onBack={() => go(`${PRODUCTION_BASE}/queue`)}>{t("tabQueue")}</BackLink>;
  if (error && !job) return <div className="space-y-4">{back}<LoadError what={t("orderWhat")} error={error} onRetry={() => void refetch()} /></div>;
  if (isLoading || !job) return <div className="space-y-4">{back}<Loading rows={4} /></div>;

  const bed = job.bed;
  const hasPrintFile = job.files.some((f) => f.kind === "3mf" || f.kind === "gcode_3mf");
  const files = [...job.files].sort((a, b) => FILE_ORDER.indexOf(a.kind) - FILE_ORDER.indexOf(b.kind) || b.createdAt.localeCompare(a.createdAt));
  const report = job.report as { minutes?: number; swaps?: number; qr_check?: string };
  const minutes = report.minutes ?? bed?.minutes ?? null;
  const swaps = report.swaps ?? bed?.swaps ?? null;
  const progress = journeyProgress(job);
  const pending = pendingPieces(job);
  const download1 = job.files.find((f) => f.kind === "gcode_3mf") ?? job.files.find((f) => f.kind === "3mf") ?? null;
  const takesFiles = !["printed", "cancelled"].includes(job.status);
  const assembledAt = (job.report as { assembledAt?: string }).assembledAt ?? null;
  const canAssemble = canAssembleJob(job, job.consumes.length, assembledAt);
  // A failed or cancelled plate is printed again once: after that, its new attempt is where the work goes on.
  const canRedo = (job.status === "failed" || job.status === "cancelled") && !job.redoneBy;
  const outcome = job.status === "printed" ? printedOutcome(job) : null;
  const model = models.find((m) => m.id === job.modelId);
  const reprint = damagedToReprint(job);
  const building = buildState(job, computersLoaded ? computers : null);
  const assembleList = job.consumes.map((c) => `${c.perPiece * (job.receivedCount ?? job.quantity)} × ${plainTitle(models.find((m) => m.slug === c.part)?.title ?? c.part)}`).join(", ");
  const needsChips = pauseNeedsChips(bed?.pause?.text);
  const chips = chipsWritten(job.pieces);
  const confirmText: Record<Step, { title: string; body: string; label: string; reason?: "required" | "optional" }> = {
    complete: { title: t("confirmCompleteTitle"), body: t("confirmCompleteBody"), label: t("markReady") },
    fail: { title: t("confirmFailTitle"), body: t("confirmFailBody"), label: t("markFailed"), reason: "required" },
    cancel: { title: t("confirmCancelTitle"), body: job.batchId ? t("confirmCancelBodyBatch") : t("confirmCancelBody"), label: t("cancelOrder"), reason: "optional" },
    release: { title: t("confirmReleaseTitle"), body: t("confirmReleaseBody"), label: t("release") },
  };
  const damaged = job.damagedCount ?? 0;
  const state = outcome === "pending" ? "printedPending" : outcome === "count" ? "printedCount" : outcome ? "printedDone"
    : building === "computerOff" ? "buildingOff" : building === "quiet" ? "buildingQuiet" : job.status;
  const summary = [t.plural("pieceCount", job.quantity), minutes ? minutesText(minutes) : null, swaps ? t.plural("swapCount", swaps) : null, report.qr_check ? t("statQrCheck") + ": " + report.qr_check : null]
    .filter(Boolean).join(" · ");
  const body = (() => {
    switch (state) {
      case "requested": return t(job.builder ? "requestedBodyBench" : "requestedBodyHand");
      case "building":
      case "buildingOff":
      case "buildingQuiet": return building ? buildSentence(job, building) : "";
      case "ready": return t("readyBody");
      case "printing": return t("printingNow");
      case "failed": return job.errorMessage || t("failedNoReason");
      case "cancelled": return job.notes ? "" : t("cancelledBody");
      case "printedPending": return t.plural("printedPending", pending);
      default:
        if (outcome === "count") return t.plural("partCounted", job.quantity, { onHand: model?.onHand ?? 0 });
        return [
          damaged ? t.plural("inStockCount", job.receivedCount ?? 0) + " " + t.plural("damagedMarked", damaged) : t.plural("allInStock", job.receivedCount ?? job.quantity),
          canAssemble ? t("assembleHint", { list: assembleList }) : null,
        ].filter(Boolean).join(" ");
    }
  })();

  return (
    <div className="space-y-5" data-testid="production-job">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" className="block text-left text-xl font-semibold text-white hover:underline" onClick={() => go(`${PRODUCTION_BASE}/models/${job.modelSlug}`)}>
            <ProductionIdentity model={model ?? { title: job.modelTitle }} />
          </button>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/45">
            <JobStatusPill status={job.status} />
            {showPlateNumber(job) ? <span className="whitespace-nowrap font-medium text-white/70">{t("plateOf", { number: job.plateNumber, total: job.plateCount })}</span> : null}
            {job.batchCode ? <span className="whitespace-nowrap font-mono">{job.batchCode}</span> : null}
            {job.deviceName ? <span>{t("builtBy", { device: job.deviceName })}</span> : null}
            <span>{formatDateTime(job.createdAt)}</span>
          </p>
        </div>
        <details className="relative"><summary className="flex min-h-10 cursor-pointer items-center rounded-xl border border-white/10 px-3 text-xs text-white/60">{t("moreActions")}</summary><div className="mt-2 flex max-w-xl flex-wrap gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          {job.status === "building" && building === "making" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming("release")}>{t("release")}</Button>
          ) : null}
          {["requested", "building", "ready"].includes(job.status) ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming("cancel")}>{t("cancelOrder")}</Button>
          ) : null}
          {["requested", "building", "ready", "printing"].includes(job.status) ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming("fail")}>{t("menuFailed")}</Button>
          ) : null}
          {(job.status === "requested" || job.status === "building") && hasPrintFile ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming("complete")}>{t("markReady")}</Button>
          ) : null}
          {/* The card offers it once the job is on the printer; here, a job printed by hand that never got to that point. */}
          {canMarkPrinted(job.status) && job.status !== "printing" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMarking(true)} data-testid="production-mark-printed-by-hand">
              {t("menuElsewhere")}
            </Button>
          ) : null}
          {["ready", "printing", "printed", "failed"].includes(job.status) ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setReporting(true)} data-testid="production-problem">
              {t("menuProblem")}
            </Button>
          ) : null}
        </div></details>
      </header>

      {progress !== null ? (
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label={t("journeyLabel")} data-testid="production-journey">
          {([t("stepFile"), t("stepPrint"), t(outcome === "count" ? "stepCount" : "stepStock")] as const).map((label, index) => (
            <Fragment key={index}>
              {index ? <ChevronRight className="h-3 w-3 text-white/25" aria-hidden="true" /> : null}
              <li aria-current={progress === index ? "step" : undefined} className={progress === index ? "font-semibold text-violet-200" : index < progress ? "text-emerald-300/70" : "text-white/35"}>{label}</li>
            </Fragment>
          ))}
        </ol>
      ) : null}

      <SectionCard title={t(`cardTitle_${state}` as never)} accent="tags" icon={outcome ? PackageCheck : Files} testId="production-card">
        <div className="space-y-3">
          {body ? <p className="text-sm leading-relaxed text-white/70" data-testid="production-card-body">{body}</p> : null}
          {job.status === "failed" ? <p className="text-sm leading-relaxed text-white/55">{t(`redoBody_${redoEffect(job)}` as never, { codes: job.batchCode ?? "" })}</p> : null}
          {job.status === "cancelled" && job.notes ? <p className="text-sm text-white/65">{job.notes}</p> : null}
          {job.status !== "failed" && job.status !== "cancelled" ? <p className="text-xs text-white/50">{summary}</p> : null}
          {job.notes && job.status !== "cancelled" ? <p className="whitespace-pre-line text-sm text-white/60">{t("noteLine", { note: job.notes })}</p> : null}
          {job.redoneBy ? <p className="text-sm text-white/65" data-testid="production-redone">{t("redoneAlready")}{" "}<button type="button" className="underline underline-offset-2 hover:text-white" onClick={() => go(`${PRODUCTION_BASE}/jobs/${job.redoneBy}`)}>{t("openRedo")}</button></p> : null}
          {job.reprintedBy ? <p className="text-sm text-white/65" data-testid="production-reprinted"><button type="button" className="underline underline-offset-2 hover:text-white" onClick={() => go(`${PRODUCTION_BASE}/jobs/${job.reprintedBy!.id}`)}>{t("reprintedAs", { code: job.reprintedBy.batchCode ?? "" })}</button></p> : null}
          {job.replaces ? <p className="text-sm text-white/65" data-testid="production-replaces">{t.plural("replacesLine", job.quantity, { code: job.replaces.batchCode ?? "" })}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {job.status === "requested" ? (
              <Button type="button" variant="brand" accent="tags" loading={upload.isPending} onClick={() => input.current?.click()} data-testid="production-upload">
                <FileUp />
                {t("uploadFile")}
              </Button>
            ) : null}
            {/* The computer is making it: nothing to do. When it is off or silent, the way out is to try again, and uploading the file yourself is the small one. */}
            {job.status === "building" ? <>
              {building && building !== "making" ? <Button type="button" variant="brand" accent="tags" onClick={() => setConfirming("release")} data-testid="production-release"><RotateCcw />{t("release")}</Button> : null}
              <Button type="button" variant="ghost" size="sm" loading={upload.isPending} onClick={() => input.current?.click()} data-testid="production-upload">{t("uploadYourself")}</Button>
            </> : null}
            {job.status === "ready" ? <>
              {download1 ? <Button type="button" variant="brand" accent="tags" loading={downloading === download1.id} onClick={() => void download(download1.id)} data-testid="production-primary-download">{t("downloadSliced")}</Button> : null}
              <Button type="button" variant="secondary" loading={step.isPending} onClick={() => step.mutate({ action: "start" })} data-testid="production-start"><Play />{t("startPrinting")}</Button>
            </> : null}
            {job.status === "printing" ? <>
              <Button type="button" variant="brand" accent="tags" onClick={() => setMarking(true)} data-testid="production-mark-printed"><Printer />{t("markPrinted")}</Button>
              {download1 ? <DownloadFileButton id={download1.id} label={t("downloadAgain")} quiet /> : null}
            </> : null}
            {outcome === "pending" ? <Button type="button" variant="brand" accent="tags" loading={stock.isPending} onClick={() => stock.mutate()} data-testid="production-stock-pending"><PackageCheck />{t.plural("putInStock", pending)}</Button> : null}
            {reprint > 0 ? <Button type="button" variant="brand" accent="tags" loading={again.isPending} onClick={() => again.mutate()} data-testid="production-print-damaged"><RotateCcw />{t.plural("printDamagedAgain", reprint)}</Button> : null}
            {canAssemble ? <Button type="button" variant="secondary" onClick={() => setAssembling(true)} data-testid="production-assembled">{t("markAssembled")}</Button> : null}
            {outcome && outcome !== "count" && job.batchId ? <Button type="button" variant="ghost" size="sm" onClick={() => go(isAdmin ? `/pieces?batch=${job.batchId}` : `${PRODUCTION_BASE}/batches/${job.batchId}`)} data-testid="production-check-qr">{t("openBatch")}</Button> : null}
            {canRedo ? <Button type="button" variant={job.status === "failed" ? "brand" : "secondary"} accent="tags" onClick={() => setRedoing(true)} data-testid="production-redo"><RotateCcw />{t("redo")}</Button> : null}
            {job.status === "failed" && !job.redoneBy ? <Button type="button" variant="ghost" onClick={() => setConfirming("cancel")} data-testid="production-cancel">{t("cancelOrder")}</Button> : null}
          </div>
        </div>
      </SectionCard>

      {job.preview ? <PrintPreviewCard modelSlug={job.modelSlug} versionId={job.versionId} preview={job.preview} canUpload={false} /> : null}

      {(job.status === "ready" || job.status === "printing") && (bed?.ams?.length || bed?.pause) ? (
        <SectionCard title={t("instructionsTitle")} icon={ClipboardList} accent="tags" testId="production-instructions">
          <div className="space-y-4 text-sm">
            {bed?.pause ? (
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-white/75">
                <p className="font-semibold text-white">{t("pauseStops", { z: bed.pause.z })}</p>
                <p>
                  {/sticker/i.test(bed.pause.text) ? t(needsChips ? "pauseChipsStep" : "pauseStickerStep") : bed.pause.text}
                  {!/sticker/i.test(bed.pause.text) && t.lang !== "en" ? <span className="ml-1.5 text-xs text-white/50">{t("pauseInEnglish")}</span> : null}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/65">
                  {needsChips && chips.total ? <span data-testid="production-chips-written">{t("pauseChips", { done: chips.done, total: chips.total })}</span> : null}
                  {needsChips && job.batchId ? <button type="button" className="underline underline-offset-2 hover:text-white" onClick={() => go(`/pieces?batch=${job.batchId}`)}>{t("pauseWriteChips")}</button> : null}
                  {job.pieces.length ? <button type="button" className="underline underline-offset-2 hover:text-white" onClick={() => setDetails(true)}>{t("pauseSerialMap")}</button> : null}
                </p>
              </div>
            ) : null}
            {bed?.ams?.length ? (
              <p data-testid="production-colours">{t("coloursToLoad", { colours: bed.ams.map((slot) => colourName(slot.colour, b)).join(", ") })}</p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <details open={details} onToggle={(event) => setDetails(event.currentTarget.open)} className="space-y-3 rounded-2xl border border-white/10 p-4" data-testid="production-details">
        <summary className="cursor-pointer text-sm font-medium text-white/60">{t("filesAndPositions")}</summary>
        {bed?.ams?.length ? <p className="text-xs text-white/50">{t("amsTitle")}: {bed.ams.map((slot) => `${t("slot", { slot: slot.slot })} ${slot.colour}`).join(" · ")}</p> : null}
        {job.pieces.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs text-white/40">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">{t("colPosition")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("colSerial")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("colCode")}</th>
                  <th className="py-1.5 font-medium">{t("colStock")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {job.pieces.map((piece) => (
                  <tr key={piece.publicCode}>
                    <td className="py-1.5 pr-3 text-white/70">{piece.position ?? "—"}</td>
                    <td className="py-1.5 pr-3 font-mono text-white/70">{piece.serialNumber ?? "—"}</td>
                    <td className="py-1.5 pr-3 font-mono text-white">{piece.publicCode}</td>
                    <td className="py-1.5 text-white/60">{piece.stockStatus === "pending" ? t("stockPending") : piece.stockStatus === "damaged" ? t("stockDamaged") : t("stockReceived")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <SectionCard
          title={t("filesTitle")}
          icon={Files}
          accent="tags"
          actions={
            takesFiles ? (
              <Button type="button" variant="secondary" size="sm" loading={upload.isPending} onClick={() => input.current?.click()}>
                <FileUp />
                {t("uploadFile")}
              </Button>
            ) : null
          }
        >
          {files.length ? (
            <ul className="divide-y divide-white/[0.06] text-sm">
              {files.map((file) => (
                <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-white/80">{file.filename}</span>
                    <span className="text-xs text-white/40">{t(`fileKind_${file.kind}` as never)} · {formatBytes(file.bytes)} · {formatDateTime(file.createdAt)}</span>
                  </span>
                  <DownloadFileButton id={file.id} label={t("download")} quiet />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/50">{t("filesEmpty")}</p>
          )}
        </SectionCard>
      </details>
      <input
        ref={input}
        type="file"
        accept=".3mf,.csv,.json,.png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload.mutate(file);
        }}
      />

      <ConfirmDialog
        open={reporting}
        onOpenChange={setReporting}
        title={t("problemTitle")}
        description={t("problemBody")}
        confirmLabel={t("recordProblem")}
        reason="required"
        reasonLabel={t("problemLabel")}
        onConfirm={(text) => problem.mutateAsync(text)}
      />

      <ConfirmDialog
        open={assembling}
        onOpenChange={setAssembling}
        title={t("confirmAssembledTitle")}
        description={[
          t("confirmAssembledBody"),
          job.consumes.length ? t("confirmAssembledConsumes", { list: assembleList }) : "",
        ].filter(Boolean).join(" ")}
        confirmLabel={t("markAssembled")}
        onConfirm={() => assemble.mutateAsync()}
      />

      <PrintedDialog job={marking ? job : null} onClose={() => setMarking(false)} />
      <RedoDialog job={redoing ? job : null} onClose={() => setRedoing(false)} onDone={(next) => { setRedoing(false); go(`${PRODUCTION_BASE}/jobs/${next.id}`); }} />

      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title={confirmText[confirming].title}
          description={confirmText[confirming].body}
          confirmLabel={confirmText[confirming].label}
          cancelLabel={confirming === "cancel" ? t("keepOrder") : undefined}
          tone={confirming === "fail" || confirming === "cancel" ? "danger" : "default"}
          reason={confirmText[confirming].reason}
          reasonLabel={t("fieldReason")}
          onConfirm={(reason) => step.mutateAsync({ action: confirming, reason })}
        />
      ) : null}
    </div>
  );
}
