import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { Stat } from "@/components/xpot/Stat";
import { Pill, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { manageMessages, type ManageKey } from "@/i18n/messages/manage";

type OverviewResponse = {
  metrics: {
    activeReps: number;
    leads: number;
    visitsInProgress: number;
    completedVisits: number;
    openOpportunities: number;
    pipelineValue: number;
    pendingTasks: number;
    syncIssues: number;
  };
  latestSyncEvents: Array<{
    id: number;
    entityType: string;
    entityId: number | string;
    status: string;
    lastError?: string | null;
    createdAt?: string | null;
  }>;
};

const CARDS: Array<{ key: keyof OverviewResponse["metrics"]; label: ManageKey; money?: boolean }> = [
  { key: "activeReps", label: "metricActiveReps" },
  { key: "leads", label: "metricLeads" },
  { key: "visitsInProgress", label: "metricVisitsInProgress" },
  { key: "completedVisits", label: "metricCompletedVisits" },
  { key: "openOpportunities", label: "metricOpenOpportunities" },
  { key: "pipelineValue", label: "metricPipeline", money: true },
  { key: "pendingTasks", label: "metricPendingTasks" },
  { key: "syncIssues", label: "metricSyncIssues" },
];

const SYNC_STATUS_KEYS: Record<string, ManageKey> = {
  pending: "syncStatus_pending",
  synced: "syncStatus_synced",
  failed: "syncStatus_failed",
  needs_review: "syncStatus_needs_review",
};

/** A sync is working when synced, waiting when pending, needs a look otherwise (failed is broken). */
const SYNC_STATUS_TONE: Record<string, PillTone> = {
  synced: "green",
  pending: "slate",
  needs_review: "amber",
  failed: "red",
};

export function AdminOverview() {
  const query = useQuery<OverviewResponse>({ queryKey: ["/api/xpot/admin/overview"] });
  const t = useT(manageMessages);

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <ListSkeleton rows={8} className="grid grid-cols-2 gap-3 sm:grid-cols-4" rowClassName="h-[76px] rounded-2xl" />
        <ListSkeleton rows={3} />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState message={t("overviewLoadFailed")} onRetry={() => void query.refetch()} />;
  }

  const { metrics, latestSyncEvents } = query.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CARDS.map(({ key, label, money }) => (
          <Stat
            key={key}
            card
            label={t(label)}
            tone={key === "syncIssues" && metrics.syncIssues > 0 ? "warning" : "neutral"}
            value={money ? formatCurrency(metrics[key] || 0, "USD") : metrics[key] ?? 0}
          />
        ))}
      </div>

      <SectionCard title={t("recentSync")} icon={RefreshCw} bodyClassName={latestSyncEvents.length === 0 ? "p-3" : ""}>
        {latestSyncEvents.length === 0 ? (
          <EmptyState compact dense icon={RefreshCw} title={t("noSyncEvents")} cardStyle={{}} />
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {latestSyncEvents.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {ev.entityType} <span className="text-white/40">#{ev.entityId}</span>
                  </p>
                  {ev.lastError && <p className="truncate text-xs text-red-300">{ev.lastError}</p>}
                </div>
                <Pill tone={toneOf(SYNC_STATUS_TONE, ev.status, "amber")} className="shrink-0">
                  {SYNC_STATUS_KEYS[ev.status] ? t(SYNC_STATUS_KEYS[ev.status]) : ev.status}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
