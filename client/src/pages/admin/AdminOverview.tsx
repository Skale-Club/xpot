import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Activity, CalendarCheck, Check, DollarSign, ListTodo, MapPinOff, Target, Users } from "lucide-react";
import { formatCurrency, formatDateTime, formatMoney } from "@/lib/format";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { KpiTile, SectionCard } from "@/components/xpot/DashboardKit";
import { Segmented } from "@/components/xpot/Segmented";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useT } from "@/i18n";
import { manageMessages } from "@/i18n/messages/manage";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { TEAM_PERIODS, teamPeriodSince, type TeamActivityResponse, type TeamActivityRow, type TeamPeriod } from "@shared/teamActivity";

// Visits › Manage › Overview: what the field team did in a period (today, or
// the last 7, 30 or 90 days), each number opening the list behind it, and one
// row per rep that opens them in People. Only people with Visits count; Tags
// has its own report (Tags › Manage › Reps). Sync problems live in Status.

/** The lists the tiles open. Visits history only filters by day, Sales overview by 7/30/90 days. */
function links(period: TeamPeriod) {
  const range = period === "today" ? "7" : period;
  return {
    reps: "/admin/reps?status=active&module=visits",
    visits: period === "today" ? "/dashboard/history?view=day" : "/dashboard/history",
    inProgress: "/dashboard/history?view=day&status=in_progress",
    sales: `/sales?range=${range}`,
    pipeline: "/sales/pipeline",
    tasks: "/tasks",
  };
}

export function AdminOverview() {
  const t = useT(manageMessages);
  const tw = useT(peopleWorkspaceMessages);
  const [, navigate] = useLocation();
  const isSuperAdmin = useIsSuperAdmin();
  // ?period=today|7|30|90 (30 by default).
  const filters = useUrlFilters({ period: "30" });
  const period = TEAM_PERIODS.find((p) => p === filters.values.period) ?? "30";
  // The start is fixed per period choice (not per render), so the query key stays put.
  const since = useMemo(() => teamPeriodSince(period).toISOString(), [period]);
  const query = useQuery<TeamActivityResponse>({ queryKey: [`/api/xpot/admin/team-activity?since=${encodeURIComponent(since)}`] });
  const to = links(period);

  const picker = (
    <Segmented
      size="sm"
      ariaLabel={tw("periodLabel")}
      value={period}
      onChange={(next) => filters.set({ period: next })}
      items={TEAM_PERIODS.map((p) => ({ id: p, label: p === "today" ? tw("periodToday") : tw("periodDays", { days: p }) }))}
    />
  );

  const head = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="sm:order-2">{picker}</div>
      <p className="min-w-0 flex-1 text-xs text-white/45">{tw("scopeNote")}</p>
    </div>
  );

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        {head}
        <ListSkeleton rows={8} className="grid grid-cols-2 gap-3 lg:grid-cols-4" rowClassName="h-[104px] rounded-2xl" />
        <ListSkeleton rows={3} />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        {head}
        <ErrorState message={t("overviewLoadFailed")} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const { metrics: m, reps } = query.data;
  const money = (cents: number) => formatMoney(cents, m.currency, t.locale);

  const columns: CompactDataColumn<TeamActivityRow>[] = [
    { key: "rep", label: tw("colRep"), render: (r) => <span className="font-medium text-white">{r.displayName}</span> },
    { key: "visits", label: tw("colVisits"), align: "right", render: (r) => r.visits },
    { key: "finished", label: tw("colFinished"), align: "right", render: (r) => r.finishedVisits },
    {
      key: "exceptions",
      label: tw("colExceptions"),
      align: "right",
      render: (r) => <span className={r.locationExceptions > 0 ? "text-amber-300" : ""}>{r.locationExceptions}</span>,
    },
    { key: "sales", label: tw("colSales"), align: "right", render: (r) => (r.salesCount > 0 ? money(r.salesTotalCents) : "—") },
    {
      key: "last",
      label: tw("colLastActivity"),
      align: "right",
      cellClassName: "whitespace-nowrap text-white/55",
      render: (r) => (r.lastActivityAt ? formatDateTime(r.lastActivityAt, t.locale) : "—"),
    },
  ];

  return (
    <div className="space-y-6" data-testid="admin-overview">
      {head}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={Users} label={t("metricActiveReps")} value={m.activeReps} detail={tw("kpiActiveRepsDetail")} onClick={() => navigate(to.reps)} />
        <KpiTile icon={CalendarCheck} label={tw("kpiVisits")} value={m.visits} detail={tw("kpiVisitsDetail")} onClick={() => navigate(to.visits)} />
        <KpiTile icon={Check} label={t("metricCompletedVisits")} value={m.finishedVisits} detail={tw("kpiFinishedDetail")} onClick={() => navigate(to.visits)} />
        <KpiTile
          icon={MapPinOff}
          accent={m.locationExceptions > 0 ? "amber" : "blue"}
          label={tw("kpiExceptions")}
          value={m.locationExceptions}
          detail={tw("kpiExceptionsDetail")}
          onClick={() => navigate(to.visits)}
        />
        <KpiTile
          icon={DollarSign}
          accent="emerald"
          label={tw("kpiSales")}
          value={money(m.salesTotalCents)}
          detail={tw.plural("kpiSalesCount", m.salesCount)}
          onClick={() => navigate(to.sales)}
        />
        <KpiTile icon={Activity} label={t("metricVisitsInProgress")} value={m.visitsInProgress} detail={tw("kpiNow")} onClick={() => navigate(to.inProgress)} />
        <KpiTile
          icon={Target}
          label={t("metricOpenOpportunities")}
          value={m.openOpportunities}
          detail={tw("kpiPipelineDetail", { amount: formatCurrency(m.pipelineValue, m.currency, t.locale) })}
          onClick={() => navigate(to.pipeline)}
        />
        <KpiTile icon={ListTodo} label={t("metricPendingTasks")} value={m.pendingTasks} detail={tw("kpiNow")} onClick={() => navigate(to.tasks)} />
      </div>

      <SectionCard title={tw("byRep")} icon={Users} bodyClassName={reps.length === 0 ? "p-3" : "p-0"}>
        {reps.length === 0 ? (
          <EmptyState compact dense icon={Users} title={tw("noFieldReps")} cardStyle={{}} />
        ) : (
          <>
            {/* A phone lists the reps; the table needs a computer's width. */}
            <ul className="divide-y divide-white/[0.06] lg:hidden" data-testid="overview-reps-list">
              {reps.map((r) => (
                <li key={r.repId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/reps/${r.repId}`)}
                    aria-label={tw("openPerson", { name: r.displayName })}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:!-outline-offset-2"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium text-white">{r.displayName}</span>
                      <span className="shrink-0 text-sm tabular-nums text-white/80">{r.salesCount > 0 ? money(r.salesTotalCents) : "—"}</span>
                    </span>
                    <span className="mt-1 block text-xs text-white/45">
                      {tw("colVisits")} {r.visits} · {tw("colFinished")} {r.finishedVisits} ·{" "}
                      <span className={r.locationExceptions > 0 ? "text-amber-300" : ""}>{tw("colExceptions")} {r.locationExceptions}</span>
                    </span>
                    {r.lastActivityAt && (
                      <span className="mt-0.5 block text-xs text-white/35">{tw("colLastActivity")}: {formatDateTime(r.lastActivityAt, t.locale)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <CompactDataTable
              className="hidden rounded-none border-0 bg-transparent lg:block"
              testId="overview-reps"
              columns={columns}
              rows={reps}
              getRowKey={(r) => r.repId}
              onRowClick={(r) => navigate(`/admin/reps/${r.repId}`)}
              getRowAriaLabel={(r) => tw("openPerson", { name: r.displayName })}
            />
          </>
        )}
      </SectionCard>

      {isSuperAdmin && (
        <p className="text-right">
          <button type="button" onClick={() => navigate("/admin/health")} className="min-h-11 text-xs font-medium text-blue-300 hover:text-blue-200">
            {tw("syncProblemsLink")}
          </button>
        </p>
      )}
    </div>
  );
}
