import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, Download, FileUp, Files, Hammer, MessageSquareWarning, PackageCheck, Printer, QrCode, RotateCcw } from "lucide-react";
import { canMarkPrinted, type PrintJobDetail, type PrintJobFileItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { BackLink } from "@/components/xpot/PageHeader";
import { Stat } from "@/components/xpot/Stat";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { ADMIN_TAGS_KEY, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { JobStatusPill, PRODUCTION_BASE, formatBytes, minutesText, uploadFile, usePrintModels } from "./production-shared";
import { ProductionIdentity } from "./production-identity";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { plateDownloads } from "./production-shared";
import { pendingPieces, productionJourneyStep, showPlateNumber } from "./production-workflow";
import { PrintPreviewCard } from "./production-preview";
import { PrintedDialog } from "./production-printed-dialog";

// One print plate, from file preparation through printing. Marking it printed puts its pieces in stock.

type Go = (path: string) => void;
type Step = "complete" | "fail" | "cancel" | "release";

const FILE_ORDER = ["gcode_3mf", "3mf", "serial_map", "preview", "report"] as const;

export function PrintJobPage({ id, go }: { id: string; go: Go }) {
  const t = useT(productionMessages);
  const tw = useT(workspacesMessages);
  const { data: models = [] } = usePrintModels();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState<Step | null>(null);
  const [marking, setMarking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const { data: job, isLoading, error, refetch } = useQuery({
    queryKey: [ADMIN_TAGS_KEY, "production", "job", id],
    queryFn: () => getJson<PrintJobDetail>(`/api/xpot/admin/print-jobs/${id}`),
    // The bench may be building it right now.
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.status === "building" || d.status === "requested") ? 10_000 : false;
    },
  });
  const step = useMutation({
    mutationFn: ({ action, reason }: { action: Step; reason?: string }) =>
      sendJson<PrintJobDetail>("POST", `/api/xpot/admin/print-jobs/${id}/transition`, { action, reason: reason || undefined }),
    onSuccess: async (updated) => {
      await invalidateAdminTags();
      toast({ title: t("orderNow", { status: t(`jobStatus_${updated.status}` as never) }) });
    },
    onError: (err) => toast({ title: t("couldNotUpdateOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  const redo = useMutation({
    mutationFn: () => sendJson<PrintJobDetail>("POST", `/api/xpot/admin/print-jobs/${id}/redo`),
    onSuccess: async (next) => {
      await invalidateAdminTags();
      toast({ title: t("orderRedone") });
      go(`${PRODUCTION_BASE}/jobs/${next.id}`);
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
  const journeyStep = productionJourneyStep(job);
  const pending = pendingPieces(job);
  const downloads = plateDownloads(job);
  const download = downloads.sliced ?? downloads.project;
  const takesFiles = !["printed", "cancelled"].includes(job.status);
  const assembledAt = (job.report as { assembledAt?: string }).assembledAt ?? null;
  const canAssemble = Boolean(job.batchId) && job.status === "printed" && job.consumes.length > 0 && !assembledAt;
  const confirmText: Record<Step, { title: string; body: string; label: string; reason?: "required" | "optional" }> = {
    complete: { title: t("confirmCompleteTitle"), body: t("confirmCompleteBody"), label: t("markReady") },
    fail: { title: t("confirmFailTitle"), body: t("confirmFailBody"), label: t("markFailed"), reason: "required" },
    cancel: { title: t("confirmCancelTitle"), body: job.batchId ? t("confirmCancelBodyBatch") : t("confirmCancelBody"), label: t("cancelOrder"), reason: "optional" },
    release: { title: t("confirmReleaseTitle"), body: t("confirmReleaseBody"), label: t("release") },
  };

  return (
    <div className="space-y-5" data-testid="production-job">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" className="block truncate text-left text-xl font-semibold text-white hover:underline" onClick={() => go(`${PRODUCTION_BASE}/models/${job.modelSlug}`)}>
            <ProductionIdentity model={models.find((m) => m.id === job.modelId) ?? { title: job.modelTitle }} />
          </button>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/45">
            <JobStatusPill status={job.status} />
            {showPlateNumber(job) ? <span className="font-medium text-white/70">{t("plateOf", { number: job.plateNumber, total: job.plateCount })}</span> : null}
            <span>v{job.version} · {job.bedLabel}</span>
            {job.batchCode ? <span className="font-mono">{job.batchCode}</span> : null}
            {job.deviceName ? <span>{t("builtBy", { device: job.deviceName })}</span> : null}
            <span>{formatDateTime(job.createdAt)}</span>
          </p>
        </div>
        <details className="relative"><summary className="flex min-h-10 cursor-pointer items-center rounded-xl border border-white/10 px-3 text-xs text-white/60">{tw("moreActions")}</summary><div className="mt-2 flex max-w-xl flex-wrap gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          {job.status === "building" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming("release")}>{t("release")}</Button>
          ) : null}
          {["requested", "building", "ready"].includes(job.status) ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming("cancel")}>{t("cancelOrder")}</Button>
          ) : null}
          {["requested", "building", "ready", "printing"].includes(job.status) ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming("fail")}>{t("markFailed")}</Button>
          ) : null}
          {(job.status === "requested" || job.status === "building") && hasPrintFile ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming("complete")}>{t("markReady")}</Button>
          ) : null}
          {/* The next-action card offers it for ready/printing; here, a requested plate printed by hand without a file. */}
          {canMarkPrinted(job.status) && journeyStep !== 1 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMarking(true)} data-testid="production-mark-printed-by-hand">
              {t("markPrinted")}
            </Button>
          ) : null}
          {["ready", "printing", "printed", "failed"].includes(job.status) ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setReporting(true)} data-testid="production-problem">
              <MessageSquareWarning />
              {t("recordProblem")}
            </Button>
          ) : null}
          {canAssemble ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setAssembling(true)} data-testid="production-assembled">
              <Hammer />
              {t("markAssembled")}
            </Button>
          ) : null}
          {job.status === "failed" || job.status === "cancelled" ? (
            <Button type="button" variant="brand" accent="tags" size="sm" loading={redo.isPending} onClick={() => redo.mutate()}>
              <RotateCcw />
              {t("redo")}
            </Button>
          ) : null}
        </div></details>
      </header>

      <ol className="grid grid-cols-3 gap-2" aria-label={tw("nextAction")} data-testid="production-journey">
        {[tw("prepare"), tw("print"), tw("complete")].map((label, index) => <li key={label} aria-current={journeyStep === index ? "step" : undefined} className={`rounded-xl border px-2 py-3 text-center text-xs font-medium ${index === journeyStep ? "border-violet-400/40 bg-violet-500/10 text-violet-100" : index < journeyStep ? "border-emerald-400/15 bg-emerald-500/[0.03] text-emerald-200/70" : "border-white/[0.07] text-white/35"}`}>{label}</li>)}
      </ol>
      <SectionCard title={tw("nextAction")} accent="tags" icon={journeyStep === 2 ? PackageCheck : Files}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55"><JobStatusPill status={job.status} />{showPlateNumber(job) ? <span>{t("plateOf", { number: job.plateNumber, total: job.plateCount })}</span> : null}<span>{t.plural("pieceCount", job.quantity)}</span>{job.batchCode ? <span className="font-mono">{job.batchCode}</span> : null}</div>
          <p className="text-sm leading-relaxed text-white/65">{job.status === "failed" || job.status === "cancelled" ? t(`jobStatus_${job.status}` as never) : journeyStep === 2 ? (pending ? t.plural("pendingPiecesBody", pending) : tw("receivedHint")) : journeyStep === 1 ? tw("printingHint") : t(job.builder ? "requestedBodyBench" : "requestedBodyHand")}</p>
          {job.status === "failed" || job.status === "cancelled" ? <Button variant="brand" accent="tags" loading={redo.isPending} onClick={() => redo.mutate()}><RotateCcw />{t("redo")}</Button> : null}
          {journeyStep === 1 ? <div className="flex flex-wrap gap-2">
            {download ? <Button asChild variant="secondary"><a href={`/api/xpot/admin/print-files/${download.id}`} target="_blank" rel="noopener noreferrer" data-testid="production-primary-download"><Download />{tw("downloadPrint")}</a></Button> : null}
            <Button variant="brand" accent="tags" onClick={() => setMarking(true)} data-testid="production-mark-printed"><Printer />{t("markPrinted")}</Button>
          </div> : null}
          {journeyStep === 2 ? <div className="flex flex-wrap items-center gap-2">
            {pending ? <Button variant="brand" accent="tags" loading={stock.isPending} onClick={() => stock.mutate()} data-testid="production-stock-pending"><PackageCheck />{t.plural("putInStock", pending)}</Button> : null}
            {canAssemble ? <Button variant={pending ? "secondary" : "brand"} accent="tags" onClick={() => setAssembling(true)}>{t("markAssembled")}</Button> : null}
            {job.batchId ? <Button variant="ghost" size="sm" onClick={() => go(`${PRODUCTION_BASE}/batches/${job.batchId}?tab=receive`)} data-testid="production-check-qr"><QrCode />{t("checkQrCodes")}</Button> : null}
          </div> : null}
        </div>
      </SectionCard>
      {job.stale ? <InlineAlert tone="warning" title={t("staleTitle")}>{t("staleBody")}</InlineAlert> : null}
      {job.status === "failed" && job.errorMessage ? <InlineAlert tone="error" title={t("failedTitle")}>{job.errorMessage}</InlineAlert> : null}
      {job.notes ? <p className="max-w-3xl whitespace-pre-line text-sm text-white/60">{job.notes}</p> : null}

      <div className="grid gap-2 sm:grid-cols-4">
        <Stat card label={t("statPieces")} value={job.quantity} />
        {job.pieceCount !== null ? <Stat card label={t("statReceived")} value={`${job.receivedCount ?? 0}/${job.pieceCount}`} /> : null}
        {minutes ? <Stat card label={t("statTime")} value={minutesText(minutes)} detail={swaps !== null ? t.plural("swapCount", swaps) : undefined} /> : null}
        {report.qr_check ? <Stat card label={t("statQrCheck")} value={report.qr_check} /> : null}
      </div>

      {job.preview ? <PrintPreviewCard modelSlug={job.modelSlug} versionId={job.versionId} preview={job.preview} canUpload={false} /> : null}

{journeyStep <= 1 && (bed?.ams?.length || bed?.pause) ? <>      <SectionCard title={t("instructionsTitle")} icon={ClipboardList} accent="tags">
        <div className="space-y-4 text-sm">
          {bed?.ams?.length ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">{t("amsTitle")}</p>
              <ul className="flex flex-wrap gap-2">
                {bed.ams.map((slot) => (
                  <li key={slot.slot} className="rounded-xl bg-white/[0.04] px-3 py-1.5 text-white/80">
                    <span className="mr-1.5 font-semibold text-white">{t("slot", { slot: slot.slot })}</span>
                    {slot.colour}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {bed?.pause ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <p>
                <span className="font-semibold">{t("pauseAt", { z: bed.pause.z })}</span> · {bed.pause.text}
              </p>
            </div>
          ) : null}
        </div>
      </SectionCard>

</> : null}
<details className="space-y-3 rounded-2xl border border-white/10 p-4"><summary className="cursor-pointer text-sm font-medium text-white/60">{tw("technicalDetails")}</summary>          {job.pieces.length ? (
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
          ) : null}      <SectionCard
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
                <Button asChild variant="ghost" size="sm">
                  <a href={`/api/xpot/admin/print-files/${file.id}`} target="_blank" rel="noopener noreferrer" data-testid="production-file-download">
                    <Download />
                    {t("download")}
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/50">{t("filesEmpty")}</p>
        )}
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
      </SectionCard>

</details>

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
          job.consumes.length
            ? t("confirmAssembledConsumes", { list: job.consumes.map((c) => `${c.perPiece * (job.receivedCount ?? job.quantity)} × ${c.part}`).join(", ") })
            : "",
        ].filter(Boolean).join(" ")}
        confirmLabel={t("markAssembled")}
        onConfirm={() => assemble.mutateAsync()}
      />

      <PrintedDialog job={marking ? job : null} onClose={() => setMarking(false)} />

      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title={confirmText[confirming].title}
          description={confirmText[confirming].body}
          confirmLabel={confirmText[confirming].label}
          tone={confirming === "fail" || confirming === "cancel" ? "danger" : "default"}
          reason={confirmText[confirming].reason}
          reasonLabel={t("fieldReason")}
          onConfirm={(reason) => step.mutateAsync({ action: confirming, reason })}
        />
      ) : null}
    </div>
  );
}
