import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "@/components/ui/loader";

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

const CARDS: Array<{ key: keyof OverviewResponse["metrics"]; label: string; money?: boolean }> = [
  { key: "activeReps", label: "Reps ativos" },
  { key: "leads", label: "Leads" },
  { key: "visitsInProgress", label: "Visitas em andamento" },
  { key: "completedVisits", label: "Visitas concluídas" },
  { key: "openOpportunities", label: "Oportunidades abertas" },
  { key: "pipelineValue", label: "Pipeline", money: true },
  { key: "pendingTasks", label: "Tarefas pendentes" },
  { key: "syncIssues", label: "Problemas de sync" },
];

export function AdminOverview() {
  const query = useQuery<OverviewResponse>({ queryKey: ["/api/xpot/admin/overview"] });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-red-400">Falha ao carregar overview.</p>;
  }

  const { metrics, latestSyncEvents } = query.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CARDS.map(({ key, label, money }) => (
          <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-white/45">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${key === "syncIssues" && metrics.syncIssues > 0 ? "text-amber-400" : ""}`}>
              {money
                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(metrics[key] || 0)
                : metrics[key] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-white/70">Sync recente</h3>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {latestSyncEvents.length === 0 ? (
            <p className="bg-white/[0.03] px-4 py-6 text-center text-sm text-white/40">Nenhum evento de sync.</p>
          ) : (
            latestSyncEvents.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {ev.entityType} <span className="text-white/40">#{ev.entityId}</span>
                  </p>
                  {ev.lastError && <p className="truncate text-xs text-red-400">{ev.lastError}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] ${
                    ev.status === "synced" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {ev.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
