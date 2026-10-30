import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Download, Printer } from "lucide-react";
import { type PrintJobDetail, type PrintJobItem, type PrintModelItem, type PrintRequestItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { ProductionWizard } from "./production-wizard";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { productionNeedsAction } from "./production-workflow";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { productionMessages } from "@/i18n/messages/production";
import { errorMessage, formatDate, invalidateAdminTags, sendJson } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { JobStatusPill, PRODUCTION_BASE, plateDownloads, usePrintModels, usePrintRequests, type JobFilter } from "./production-shared";
import { ProductionIdentity } from "./production-identity";

// Asking for a print and listing the requests: the catalog, the queue and a model's page all use these. A request is
// N pieces of a model, split into plates of one bed each (the last one partial); each plate is downloaded, printed by
// hand in Bambu Studio and marked printed here.

type Go = (path: string) => void;

/** Model cards use the same step-by-step production wizard as the workspace. */
export function PrintDialog({ model, onClose, onOrdered }: { model: PrintModelItem; onClose: () => void; onOrdered?: (request: PrintRequestItem) => void }) {
  return <ProductionWizard initialModel={model} onClose={onClose} onOrdered={onOrdered} />;
}
export function RequestList({ filter, model, go, emptyHint }: { filter: JobFilter; model?: string; go: Go; emptyHint?: string }) {
  const t = useT(productionMessages);
  const { data, isLoading, error, refetch } = usePrintRequests(filter, model);
  const { data: models = [] } = usePrintModels();
  const modelById = new Map(models.map((item) => [item.id, item]));
  const requests = data?.filter((request) => filter === "all" || productionNeedsAction(request) === (filter === "open"));
  const [printing, setPrinting] = useState<PrintJobItem | null>(null);
  const { toast } = useToast();
  const printed = useMutation({
    mutationFn: (job: PrintJobItem) => sendJson<PrintJobDetail>("POST", `/api/xpot/admin/print-jobs/${job.id}/transition`, { action: "printed" }),
    onSuccess: async (updated) => {
      await invalidateAdminTags();
      toast({ title: t("orderNow", { status: t(`jobStatus_${updated.status}` as never) }) });
    },
    onError: (err) => toast({ title: t("couldNotUpdateOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  if (error && !data) return <LoadError what={t("queueWhat")} error={error} onRetry={() => void refetch()} />;
  if (isLoading) return <Loading rows={4} />;
  if (!requests?.length) return <EmptyState tone="tags" icon={Printer} title={t("queueEmpty")} hint={emptyHint ?? t("queueEmptyHint")} />;
  return (
    <>
      <ul className="space-y-3">
        {requests.map((request) => (
          <li key={request.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03]" data-testid="production-request">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
              <button type="button" className="min-w-0 truncate text-left text-sm font-semibold text-white hover:underline" onClick={() => go(`${PRODUCTION_BASE}/models/${request.modelSlug}`)}>
                <ProductionIdentity model={modelById.get(request.modelId) ?? { title: request.modelTitle }} />
              </button>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-white/45">
                <span>v{request.version} · {request.bedLabel}</span>
                <span>{t.plural("requestAsked", request.quantity)}</span>
                <span>{formatDate(request.createdAt)}</span>
              </span>
              {request.notes ? <p className="w-full truncate text-xs text-white/50">{request.notes}</p> : null}
            </div>
            <ul className="divide-y divide-white/[0.06]">
              {request.plates.map((plate) => (
                <PlateRow key={plate.id} plate={plate} go={go} onPrinted={() => setPrinting(plate)} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={Boolean(printing)}
        onOpenChange={(open) => !open && setPrinting(null)}
        title={t("confirmPrintedTitle")}
        description={printing?.batchId ? t("confirmPrintedBodyBatch") : t.plural("confirmPrintedBodyPart", printing?.quantity ?? 0)}
        confirmLabel={t("markPrinted")}
        onConfirm={async () => {
          if (printing) await printed.mutateAsync(printing);
          setPrinting(null);
        }}
      />
    </>
  );
}

function PlateRow({ plate, go, onPrinted }: { plate: PrintJobItem; go: Go; onPrinted: () => void }) {
  const t = useT(productionMessages);
  const u = useT(unifiedProductionMessages);
  const { project, sliced } = plateDownloads(plate);
  const live = !["failed", "cancelled"].includes(plate.status);
  return (
    <li className={`flex flex-wrap items-center gap-2 px-3 py-2 ${live ? "" : "opacity-60"}`} data-testid="production-plate">
      <button
        type="button"
        onClick={() => go(`${PRODUCTION_BASE}/jobs/${plate.id}`)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
        data-testid="production-job-row"
      >
        <span className="text-sm font-medium text-white">{t("plateOf", { number: plate.plateNumber, total: plate.plateCount })}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-white/45">
          <JobStatusPill status={plate.status} />
          <span>{t.plural("pieceCount", plate.quantity)}</span>
          {plate.batchCode ? <span className="font-mono">{plate.batchCode}</span> : null}
          {plate.pieceCount !== null && plate.status === "printed" ? <span>{t("received", { received: plate.receivedCount ?? 0, total: plate.pieceCount })}</span> : null}
        </span>
        {plate.stale ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-label={t("stale")} /> : null}
      </button>
      <span className="flex flex-wrap items-center gap-1">
        {live && project ? <DownloadButton id={project.id} label={t("downloadProject")} /> : null}
        {live && sliced ? <DownloadButton id={sliced.id} label={t("downloadSliced")} /> : null}
        {plate.status === "ready" || plate.status === "printing" ? (
          <Button type="button" variant="brand" accent="tags" size="sm" onClick={onPrinted} data-testid="production-plate-printed">
            {t("markPrinted")}
          </Button>
        ) : null}
        {plate.status === "printed" && plate.batchId && (plate.receivedCount ?? 0) < (plate.pieceCount ?? plate.quantity) ? <Button type="button" variant="brand" accent="tags" size="sm" onClick={() => go(`${PRODUCTION_BASE}/jobs/${plate.id}`)} data-testid="production-plate-receive">{u("receivePieces")}</Button> : null}
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
      </span>
    </li>
  );
}

function DownloadButton({ id, label }: { id: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <a href={`/api/xpot/admin/print-files/${id}`} target="_blank" rel="noopener noreferrer" data-testid="production-plate-download">
        <Download />
        {label}
      </a>
    </Button>
  );
}
