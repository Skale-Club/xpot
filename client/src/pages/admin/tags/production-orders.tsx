import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Printer } from "lucide-react";
import { PRINT_MAX_PLATES, type PrintJobDetail, type PrintModelItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { errorMessage, formatDate, invalidateAdminTags, sendJson } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { JobStatusPill, PRODUCTION_BASE, bedSummary, usePrintJobs, type JobFilter } from "./production-shared";

// Ordering a print and listing orders: the catalog, the queue and a model's page all use these.

type Go = (path: string) => void;

export function PrintDialog({ model, onClose, onOrdered }: { model: PrintModelItem; onClose: () => void; onOrdered: (job: PrintJobDetail) => void }) {
  const t = useT(productionMessages);
  const tc = useT(commonMessages);
  const { toast } = useToast();
  const beds = model.currentVersion?.beds ?? [];
  const [bedLabel, setBedLabel] = useState(beds[0]?.label ?? "");
  const [plates, setPlates] = useState("1");
  const [notes, setNotes] = useState("");
  const bed = beds.find((b) => b.label === bedLabel) ?? beds[0];
  const count = Math.min(Math.max(Number.parseInt(plates, 10) || 1, 1), PRINT_MAX_PLATES);
  const pieces = (bed?.copies ?? 0) * count;
  const order = useMutation({
    mutationFn: () => sendJson<PrintJobDetail>("POST", "/api/xpot/admin/print-jobs", { model: model.id, bed: bed?.label, plates: count, notes }),
    onSuccess: async (job) => {
      await invalidateAdminTags();
      toast({ title: job.batchCode ? t("orderedWithBatch", { batch: job.batchCode }) : t("ordered") });
      onClose();
      onOrdered(job);
    },
    onError: (err) => toast({ title: t("couldNotOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("printTitle", { title: model.title })}</DialogTitle>
          <DialogDescription>{model.kind === "serialized" ? t("printDescSerialized") : t("printDescPart")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("fieldBed")}>
            <Select value={bed?.label ?? ""} onChange={(e) => setBedLabel(e.target.value)} options={beds.map((b) => ({ value: b.label, label: bedSummary(b, t) }))} data-testid="production-print-bed" />
          </Field>
          <Field label={t("fieldPlates")} hint={t("fieldPlatesHint", { max: PRINT_MAX_PLATES })}>
            <Input type="number" inputMode="numeric" min={1} max={PRINT_MAX_PLATES} value={plates} onChange={(e) => setPlates(e.target.value)} />
          </Field>
          <Field label={t("fieldNotes")}>
            <Textarea value={notes} rows={2} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-white/70" data-testid="production-print-summary">
            {model.kind === "serialized" ? t.plural("willIssue", pieces) : t.plural("willPrint", pieces)}
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="button" variant="brand" accent="tags" disabled={!bed} loading={order.isPending} onClick={() => order.mutate()} data-testid="production-print-confirm">
            <Printer />
            {t("print")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function JobList({ filter, model, go, emptyHint }: { filter: JobFilter; model?: string; go: Go; emptyHint?: string }) {
  const t = useT(productionMessages);
  const { data, isLoading, error, refetch } = usePrintJobs(filter, model);
  if (error && !data) return <LoadError what={t("queueWhat")} error={error} onRetry={() => void refetch()} />;
  if (isLoading) return <Loading rows={4} />;
  if (!data?.length) return <EmptyState tone="tags" icon={Printer} title={t("queueEmpty")} hint={emptyHint ?? t("queueEmptyHint")} />;
  return (
    <ul className="space-y-2">
      {data.map((job) => (
        <li key={job.id}>
          <button
            type="button"
            onClick={() => go(`${PRODUCTION_BASE}/jobs/${job.id}`)}
            className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-left hover:bg-white/[0.05]"
            data-testid="production-job-row"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{job.modelTitle}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/45">
                <JobStatusPill status={job.status} />
                <span>v{job.version} · {job.bedLabel}{job.plates > 1 ? ` × ${job.plates}` : ""}</span>
                <span>{t.plural("pieceCount", job.quantity)}</span>
                {job.batchCode ? <span className="font-mono">{job.batchCode}</span> : null}
                {job.pieceCount !== null && job.status === "printed" ? <span>{t("received", { received: job.receivedCount ?? 0, total: job.pieceCount })}</span> : null}
                <span>{formatDate(job.createdAt)}</span>
              </span>
            </span>
            {job.stale ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-label={t("stale")} /> : null}
            <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
