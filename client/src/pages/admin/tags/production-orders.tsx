import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Download, Printer } from "lucide-react";
import { PRINT_MAX_PLATES, canMarkPrinted, splitIntoPlates, type PrintJobDetail, type PrintJobItem, type PrintModelItem, type PrintRequestItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { errorMessage, formatDate, invalidateAdminTags, sendJson } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { JobStatusPill, PRODUCTION_BASE, bedSummary, plateDownloads, usePrintRequests, type JobFilter } from "./production-shared";

// Asking for a print and listing the requests: the catalog, the queue and a model's page all use these. A request is
// N pieces of a model, split into plates of one bed each (the last one partial); each plate is downloaded, printed by
// hand in Bambu Studio and marked printed here.

type Go = (path: string) => void;

export function PrintDialog({ model, onClose, onOrdered }: { model: PrintModelItem; onClose: () => void; onOrdered?: (request: PrintRequestItem) => void }) {
  const t = useT(productionMessages);
  const tc = useT(commonMessages);
  const { toast } = useToast();
  const beds = model.currentVersion?.beds ?? [];
  const [bedLabel, setBedLabel] = useState(beds[0]?.label ?? "");
  const bed = beds.find((b) => b.label === bedLabel) ?? beds[0];
  const copies = bed?.copies ?? 1;
  const [quantity, setQuantity] = useState(String(copies));
  const [notes, setNotes] = useState("");
  const serialized = model.kind === "serialized";
  const max = PRINT_MAX_PLATES * copies;
  const count = Math.min(Math.max(Number.parseInt(quantity, 10) || 0, 0), max);
  const plates = splitIntoPlates(count, copies, serialized);
  const pieces = plates.reduce((sum, n) => sum + n, 0);
  const order = useMutation({
    mutationFn: () => sendJson<PrintRequestItem>("POST", "/api/xpot/admin/print-jobs", { model: model.id, bed: bed?.label, quantity: count, notes }),
    onSuccess: async (request) => {
      await invalidateAdminTags();
      toast({ title: t("ordered"), description: t.plural("plateSplit", request.plates.length, { split: request.plates.map((p) => p.quantity).join(" + ") }) });
      onClose();
      onOrdered?.(request);
    },
    onError: (err) => toast({ title: t("couldNotOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("printTitle", { title: model.title })}</DialogTitle>
          <DialogDescription>{serialized ? t("printDescSerialized") : t("printDescPart")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {beds.length > 1 ? (
            <Field label={t("fieldBed")}>
              <Select
                value={bed?.label ?? ""}
                onChange={(e) => {
                  setBedLabel(e.target.value);
                  setQuantity(String(beds.find((b) => b.label === e.target.value)?.copies ?? 1));
                }}
                options={beds.map((b) => ({ value: b.label, label: bedSummary(b, t) }))}
                data-testid="production-print-bed"
              />
            </Field>
          ) : null}
          <Field label={t("fieldQuantity")} hint={t(serialized ? "fieldQuantityHint" : "fieldQuantityHintPart", { copies, max })}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              data-testid="production-print-quantity"
            />
          </Field>
          <Field label={t("fieldNotes")}>
            <Textarea value={notes} rows={2} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {plates.length ? (
            <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-white/70" data-testid="production-print-summary">
              {t.plural("plateSplit", plates.length, { split: plates.join(" + ") })}
              {" · "}
              {serialized ? t.plural("willIssue", pieces) : t.plural("willPrint", pieces)}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="button" variant="brand" accent="tags" disabled={!bed || !plates.length} loading={order.isPending} onClick={() => order.mutate()} data-testid="production-print-confirm">
            <Printer />
            {t("print")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestList({ filter, model, go, emptyHint }: { filter: JobFilter; model?: string; go: Go; emptyHint?: string }) {
  const t = useT(productionMessages);
  const { data, isLoading, error, refetch } = usePrintRequests(filter, model);
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
  if (!data?.length) return <EmptyState tone="tags" icon={Printer} title={t("queueEmpty")} hint={emptyHint ?? t("queueEmptyHint")} />;
  return (
    <>
      <ul className="space-y-3">
        {data.map((request) => (
          <li key={request.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03]" data-testid="production-request">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
              <button type="button" className="min-w-0 truncate text-left text-sm font-semibold text-white hover:underline" onClick={() => go(`${PRODUCTION_BASE}/models/${request.modelSlug}`)}>
                {request.modelTitle}
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
        {canMarkPrinted(plate.status) ? (
          <Button type="button" variant="brand" accent="tags" size="sm" onClick={onPrinted} data-testid="production-plate-printed">
            {t("markPrinted")}
          </Button>
        ) : null}
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
