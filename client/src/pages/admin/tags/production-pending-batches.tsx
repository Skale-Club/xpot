import { ArrowRight, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/xpot/EmptyState";
import { useT } from "@/i18n";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { BackLink } from "@/components/xpot/PageHeader";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { BatchProgressPill, useBatches } from "./batches-shared";
import { parseBatchName, pendingBatches } from "./batches-model";
import { Loading, LoadError } from "./pieces-shared";

// The list behind "Batches awaiting pieces" (/batches?pending=1): the same batches the count counts, each opening its page.

export function PendingBatches({ go }: { go: (path: string) => void }) {
  const t = useT(adminTagsFlowMessages);
  const u = useT(unifiedProductionMessages);
  const { data, isLoading, error, refetch } = useBatches();
  if (isLoading) return <Loading rows={4} />;
  if (error || !data) return <LoadError what={t("whatPendingBatches")} error={error} onRetry={() => void refetch()} />;
  const batches = pendingBatches(data);
  return <section className="space-y-3" data-testid="pending-batches">
    <BackLink onBack={() => go("/production")}>{u("title")}</BackLink>
    <div><h1 className="text-2xl font-semibold tracking-tight text-white">{t("queueBatchesNotReceived")}</h1><p className="mt-1 text-sm text-white/50">{t("queueBatchesNotReceivedHint")}</p></div>
    {batches.length ? <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      {batches.map((batch) => <li key={batch.id}>
        <button type="button" onClick={() => go(`/batches/${batch.id}`)} className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04]" data-testid={`pending-batch-${batch.id}`}>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block whitespace-nowrap font-mono text-xs text-white/50">{batch.batchCode}</span>
            <span className="block break-words text-sm font-medium leading-snug text-white">{parseBatchName(batch.name).title}</span>
            <span className="block text-xs text-white/50">{t("pendingBatchPieces", { pending: batch.pendingCount, total: batch.tagCount })}</span>
          </span>
          <BatchProgressPill batch={batch} />
          <ArrowRight className="h-4 w-4 shrink-0 text-white/35 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>
      </li>)}
    </ul> : <EmptyState compact dense tone="tags" icon={CheckCircle2} title={t("queueEmpty")} />}
  </section>;
}
