import { ArrowRight, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/xpot/EmptyState";
import { useT } from "@/i18n";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { BatchStagePill, useBatches } from "./batches-shared";
import { pendingBatches } from "./batches-model";
import { Loading, LoadError } from "./pieces-shared";

// The list behind "Batches awaiting pieces" (/batches?pending=1): the same batches the count counts, each opening its page.

export function PendingBatches({ go }: { go: (path: string) => void }) {
  const t = useT(adminTagsFlowMessages);
  const { data, isLoading, error, refetch } = useBatches();
  if (isLoading) return <Loading rows={4} />;
  if (error || !data) return <LoadError what={t("whatPendingBatches")} error={error} onRetry={() => void refetch()} />;
  const batches = pendingBatches(data);
  return <section className="space-y-3" data-testid="pending-batches">
    <div><h2 className="text-sm font-semibold text-white">{t("queueBatchesNotReceived")}</h2><p className="mt-0.5 text-xs text-white/50">{t("queueBatchesNotReceivedHint")}</p></div>
    {batches.length ? <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      {batches.map((batch) => <li key={batch.id}>
        <button type="button" onClick={() => go(`/batches/${batch.id}`)} className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04]" data-testid={`pending-batch-${batch.id}`}>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white">{batch.batchCode} · {batch.name}</span><span className="mt-0.5 block text-xs text-white/50">{t("pendingBatchPieces", { pending: batch.pendingCount, total: batch.tagCount })}</span></span>
          <BatchStagePill stage={batch.stage} />
          <ArrowRight className="h-4 w-4 shrink-0 text-white/35 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>
      </li>)}
    </ul> : <EmptyState compact dense tone="tags" icon={CheckCircle2} title={t("queueEmpty")} />}
  </section>;
}
