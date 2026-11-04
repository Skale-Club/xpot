import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Play, Printer, RotateCcw } from "lucide-react";
import { type PrintJobItem, type PrintModelItem, type PrintRequestItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { ProductionWizard } from "./production-wizard";
import { EmptyState } from "@/components/xpot/EmptyState";
import { BOARD_GROUPS, boardGroups, buildState, collapsedPlates, plateActions, productionNeedsAction, qrFailedCodes, redoEffect, serializedRequests, showPlateNumber, type BoardGroup, type PlateAction } from "./production-workflow";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { productionMessages } from "@/i18n/messages/production";
import { errorMessage, formatDate, invalidateAdminTags, sendJson } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { Pill } from "@/components/xpot/StatusPill";
import { DownloadFileButton, JobStatusPill, PRODUCTION_BASE, plateDownloads, useBuildSentence, usePlateMoves, usePrintComputers, usePrintModels, usePrintRequests, useProductionAccess, type JobFilter } from "./production-shared";
import { ProductionIdentity } from "./production-identity";
import { PrintedDialog } from "./production-printed-dialog";

// Asking for a print and listing the requests: the board, the full list of orders and a model's page all use these. A
// request is N pieces of a model, split into print jobs of one bed each (the last one partial); each print job is
// downloaded, printed by hand in Bambu Studio and marked printed here.

type Go = (path: string) => void;

/** Model cards use the same step-by-step production wizard as the workspace. */
export function PrintDialog({ model, onClose, onOrdered }: { model: PrintModelItem; onClose: () => void; onOrdered?: (request: PrintRequestItem) => void }) {
  return <ProductionWizard initialModel={model} onClose={onClose} onOrdered={onOrdered} />;
}

/** "Print again" on a failed or cancelled job, with what it does to its pieces' codes said first. */
export function RedoDialog({ job, onClose, onDone }: { job: PrintJobItem | null; onClose: () => void; onDone?: (next: PrintJobItem) => void }) {
  const t = useT(productionMessages);
  const { toast } = useToast();
  const redo = useMutation({
    mutationFn: (id: string) => sendJson<PrintJobItem>("POST", `/api/xpot/admin/print-jobs/${id}/redo`),
    onSuccess: async (next) => {
      await invalidateAdminTags();
      toast({ title: t("orderRedone") });
      onDone?.(next);
    },
    onError: (err) => toast({ title: t("couldNotUpdateOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  if (!job) return null;
  const effect = redoEffect(job);
  const codes = qrFailedCodes(job.report).join(", ") || job.batchCode || "";
  return (
    <ConfirmDialog
      accent="tags"
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t("redoConfirmTitle")}
      description={t(`redoBody_${effect}` as never, { codes })}
      confirmLabel={t("redo")}
      onConfirm={() => redo.mutateAsync(job.id)}
    />
  );
}

/** Whose request and when, plus what it asked for: "8 pieces · 2 print jobs". */
function RequestHeader({ request, models, showOrganization, showIdentity, go }: { request: PrintRequestItem; models: Map<string, PrintModelItem>; showOrganization: boolean; showIdentity: boolean; go: Go }) {
  const t = useT(productionMessages);
  const jobs = new Set(request.plates.map((plate) => plate.plateNumber)).size;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 border-b border-white/[0.06] px-3 py-2.5">
      {showIdentity ? (
        <button type="button" className="min-w-0 text-left text-sm font-semibold text-white hover:underline" onClick={() => go(`${PRODUCTION_BASE}/models/${request.modelSlug}`)}>
          <ProductionIdentity model={models.get(request.modelId) ?? { title: request.modelTitle }} />
        </button>
      ) : <span />}
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/45">
        {showOrganization ? <Pill tone="slate">{request.organizationName}</Pill> : null}
        {jobs > 1 ? <span>{[t.plural("pieceCount", request.quantity), t.plural("printJobCount", jobs)].join(" · ")}</span> : null}
        {new Date(request.createdAt).toDateString() === new Date().toDateString() ? null : <span>{formatDate(request.createdAt)}</span>}
      </span>
      {request.notes ? <p className="w-full truncate text-xs text-white/50">{t("noteLine", { note: request.notes })}</p> : null}
    </div>
  );
}

/** Every request with all its print jobs: the full list of orders and a model's own page. */
export function RequestList({ filter, model, organization, go, emptyHint }: { filter: JobFilter; model?: string; organization?: number; go: Go; emptyHint?: string }) {
  const t = useT(productionMessages);
  // Every request, sorted here: a failed plate's request needs action although the server no longer counts it open.
  const { data, isLoading, error, refetch } = usePrintRequests("all", model, organization);
  const { organizations } = useProductionAccess();
  const showOrganization = organizations.length > 1;
  const { data: models = [] } = usePrintModels();
  const modelById = new Map(models.map((item) => [item.id, item]));
  const requests = data?.filter((request) => filter === "all" || productionNeedsAction(request) === (filter === "open"));
  const rows = useRowActions();
  if (error && !data) return <LoadError what={t("queueWhat")} error={error} onRetry={() => void refetch()} />;
  if (isLoading) return <Loading rows={4} />;
  if (!requests?.length) return <EmptyState tone="tags" icon={Printer} title={t("queueEmpty")} hint={emptyHint ?? t("queueEmptyHint")} />;
  return (
    <>
      <ul className="space-y-3">
        {requests.map((request) => (
          <li key={request.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03]" data-testid="production-request">
            <RequestHeader request={request} models={modelById} showOrganization={showOrganization} showIdentity={!model} go={go} />
            <ul className="divide-y divide-white/[0.06]">
              {request.plates.map((plate) => (
                <PlateRow key={plate.id} plate={plate} go={go} showStatus rows={rows} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {rows.dialogs}
    </>
  );
}

const GROUP_TITLE: Record<BoardGroup, string> = {
  attention: "group_attention",
  printing: "group_printing",
  ready: "group_ready",
  waiting: "group_waiting",
  making: "group_making",
};

/** Nine alike prints of one request, said once ("9 prints · 4 pieces each · 0 files sent") behind one button; the rows open on demand. */
function CollapsedPrints({ plates, waiting, children }: { plates: PrintJobItem[]; waiting: boolean; children: React.ReactNode }) {
  const t = useT(productionMessages);
  const [open, setOpen] = useState(false);
  const summary = collapsedPlates(plates);
  if (!summary) return <ul className="divide-y divide-white/[0.06]">{children}</ul>;
  const line = [
    t.plural("printJobCount", summary.count),
    summary.each !== null ? t.plural("piecesEach", summary.each) : null,
    waiting ? t.plural("filesSentCount", summary.filesSent) : null,
  ].filter(Boolean).join(" · ");
  return (
    <div data-testid="production-collapsed">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
        <p className="text-sm text-white/70">{line}</p>
        <Button type="button" variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)} data-testid="production-collapsed-toggle">
          {open ? t("hidePrints") : t("showPrints")}
        </Button>
      </div>
      {open ? <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">{children}</ul> : null}
    </div>
  );
}

/**
 * What was sent to print and still waits for an answer: the open and failed print jobs of pieces with a serial, by what
 * each needs, failed first. A group with nothing in it is not shown.
 */
export function ToPrintList({ go, emptyHint }: { go: Go; emptyHint: string }) {
  const t = useT(productionMessages);
  const { data, isLoading, error, refetch } = usePrintRequests("all");
  const { organizations } = useProductionAccess();
  const { data: models = [] } = usePrintModels();
  const modelById = new Map(models.map((item) => [item.id, item]));
  const rows = useRowActions();
  if (error && !data) return <LoadError what={t("queueWhat")} error={error} onRetry={() => void refetch()} />;
  if (isLoading) return <Loading rows={4} />;
  const groups = boardGroups(serializedRequests(data ?? []));
  if (!groups.length) return <EmptyState tone="tags" icon={Printer} title={t("nothingToPrint")} hint={emptyHint} />;
  return (
    <div className="space-y-5" data-testid="production-to-print">
      {BOARD_GROUPS.map((key) => {
        const group = groups.find((g) => g.group === key);
        if (!group) return null;
        const count = group.requests.reduce((sum, entry) => sum + entry.plates.length, 0);
        return (
          <section key={key} className="space-y-2" aria-label={t(GROUP_TITLE[key] as never)} data-testid={`production-group-${key}`}>
            <h3 className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${key === "attention" ? "text-red-300" : "text-white/55"}`}>
              {t(GROUP_TITLE[key] as never)}
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal text-white/70">{count}</span>
            </h3>
            <ul className="space-y-3">
              {group.requests.map(({ request, plates }) => (
                <li key={`${request.id}-${key}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.03]" data-testid="production-request">
                  <RequestHeader request={request} models={modelById} showOrganization={organizations.length > 1} showIdentity go={go} />
                  <CollapsedPrints plates={plates} waiting={key === "waiting"}>
                    {plates.map((plate) => <PlateRow key={plate.id} plate={plate} go={go} showStatus={false} rows={rows} />)}
                  </CollapsedPrints>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {rows.dialogs}
    </div>
  );
}

/** The dialogs a row's buttons open (Did it come off well, Print again) and the one-click moves, shared by every row of a list. */
function useRowActions() {
  const [printing, setPrinting] = useState<PrintJobItem | null>(null);
  const [redoing, setRedoing] = useState<PrintJobItem | null>(null);
  const moves = usePlateMoves();
  const { loaded, computers } = usePrintComputers();
  const sentence = useBuildSentence();
  return {
    moves,
    build: (plate: PrintJobItem) => { const state = buildState(plate, loaded ? computers : null); return state ? { state, text: sentence(plate, state) } : null; },
    markPrinted: setPrinting,
    printAgain: setRedoing,
    dialogs: (
      <>
        <PrintedDialog job={printing} onClose={() => setPrinting(null)} />
        <RedoDialog job={redoing} onClose={() => setRedoing(null)} onDone={() => setRedoing(null)} />
      </>
    ),
  };
}

function PlateRow({ plate, go, showStatus, rows }: { plate: PrintJobItem; go: Go; showStatus: boolean; rows: ReturnType<typeof useRowActions> }) {
  const t = useT(productionMessages);
  const { project, sliced } = plateDownloads(plate);
  const file = sliced ?? project;
  const dead = plate.status === "cancelled";
  const actions = plateActions(plate);
  const building = rows.build(plate);
  const open = () => go(`${PRODUCTION_BASE}/jobs/${plate.id}`);
  const renderAction = (action: PlateAction, index: number) => {
    const primary = index === 0;
    switch (action) {
      case "download":
        return file ? <DownloadFileButton key={action} id={file.id} label={t("downloadSliced")} quiet={!primary} /> : null;
      case "start":
        return (
          <Button key={action} type="button" variant={primary ? "brand" : "secondary"} accent="tags" size="sm" loading={rows.moves.starting === plate.id} onClick={() => rows.moves.start(plate.id)} data-testid="production-plate-start">
            <Play />
            {t("startPrinting")}
          </Button>
        );
      case "markPrinted":
        return (
          <Button key={action} type="button" variant="brand" accent="tags" size="sm" onClick={() => rows.markPrinted(plate)} data-testid="production-plate-printed">
            <Printer />
            {t("markPrinted")}
          </Button>
        );
      case "printAgain":
        return (
          <Button key={action} type="button" variant="brand" accent="tags" size="sm" onClick={() => rows.printAgain(plate)} data-testid="production-plate-redo">
            <RotateCcw />
            {t("redo")}
          </Button>
        );
    }
  };
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${dead ? "opacity-60" : ""}`} data-testid="production-plate">
      <button type="button" onClick={open} className="min-w-[10rem] flex-1 space-y-1 text-left hover:underline" data-testid="production-job-row">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showPlateNumber(plate) ? <span className="whitespace-nowrap text-sm font-medium text-white">{t("plateOf", { number: plate.plateNumber, total: plate.plateCount })}</span> : null}
          {showStatus ? <JobStatusPill status={plate.status} /> : null}
          <span className="text-xs text-white/45">{t.plural("pieceCount", plate.quantity)}</span>
          {plate.menuFont ? <span className="text-xs text-white/45">{plate.menuFont}</span> : null}
          {showStatus && plate.batchCode ? <span className="whitespace-nowrap font-mono text-xs text-white/45">{plate.batchCode}</span> : null}
          {plate.pieceCount !== null && plate.status === "printed" ? <span className="text-xs text-white/45">{t("received", { received: plate.receivedCount ?? 0, total: plate.pieceCount })}</span> : null}
        </span>
        {building ? (
          <span className={`flex items-start gap-1 text-xs ${building.state === "making" ? "text-white/50" : "text-amber-200"}`} data-testid="production-build-state" data-state={building.state}>
            {building.state === "making" ? null : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />}
            {building.text}
          </span>
        ) : null}
        {plate.status === "failed" ? <span className="line-clamp-2 block text-xs text-red-200/80" data-testid="production-plate-reason">{plate.errorMessage || t("failedNoReason")}</span> : null}
      </button>
      <span className="flex flex-wrap items-center gap-1.5">
        {actions.map(renderAction)}
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
      </span>
    </li>
  );
}
