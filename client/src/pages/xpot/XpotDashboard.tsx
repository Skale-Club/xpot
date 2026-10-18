import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MapPinned, DollarSign, Target, Clock3, Footprints, Activity, AlertTriangle, RefreshCw, ArrowLeft, ChevronRight, Route as RouteIcon, ListTodo, Check, Plus, CalendarClock } from "lucide-react";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { useSyncStatus } from "./hooks/useSyncStatus";
import { formatCents } from "./utils";
import { useSalesSummary } from "./hooks/useSalesModule";
import { useT } from "@/i18n";
import { dashboardMessages } from "@/i18n/messages/dashboard";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useLocation } from "wouter";
import { XpotVisits } from "./XpotVisits";
import { QuickCheckIn } from "./components/QuickCheckIn";
import { StatusBadge } from "./components/VisitStatus";
import { AttentionItem, AttentionList, DashboardSection, EmptyMetricState, KpiTile, MetricSelector, PeriodSelector } from "@/components/xpot/DashboardKit";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type DashboardRoute = {
  id: number;
  name: string;
  routeDate: string;
  status: "draft" | "published" | "in_progress" | "completed" | "cancelled";
};

type DashboardRouteStop = {
  id: number;
  name: string;
  position: number;
  status: string;
  estimatedArrivalAt?: string | null;
};

type DashboardRouteDetail = {
  route: DashboardRoute;
  stops: DashboardRouteStop[];
};

type ActivityMetric = "visits" | "revenue" | "profit" | "sales";

const ACTIVITY_TONES: Record<ActivityMetric, { stroke: string; fill: string }> = {
  visits: { stroke: "#60a5fa", fill: "#3b82f6" },
  revenue: { stroke: "#818cf8", fill: "#6366f1" },
  profit: { stroke: "#34d399", fill: "#10b981" },
  sales: { stroke: "#c084fc", fill: "#a855f7" },
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function DashboardOverview() {
  const { dashboardQuery, setLocation } = useXpotQueries();
  const { toast } = useToast();
  const t = useT(dashboardMessages);
  const metrics = dashboardQuery.data?.metrics;
  const { failedEvents, retryMutation } = useSyncStatus();
  const [periodDays, setPeriodDays] = useState(7);
  const [activityMetric, setActivityMetric] = useState<ActivityMetric>("visits");
  const salesSummary = useSalesSummary(periodDays * 2);
  const routesQuery = useQuery<DashboardRoute[]>({ queryKey: ["/api/xpot/prospecting/routes"] });
  const isDesktop = useIsDesktop();

  const todayRoute = routesQuery.data?.find((route) => route.routeDate === localDateKey() && route.status !== "cancelled");
  const routeDetailQuery = useQuery<DashboardRouteDetail>({
    queryKey: [`/api/xpot/prospecting/routes/${todayRoute?.id ?? "none"}`],
    enabled: Boolean(todayRoute),
  });
  const routeStops = routeDetailQuery.data?.stops ?? [];
  const completedStops = routeStops.filter((stop) => stop.status === "completed").length;
  const nextStop = routeStops.find((stop) => stop.status === "en_route")
    ?? routeStops.find((stop) => stop.status === "planned");
  const tasksToday = dashboardQuery.data?.tasksToday ?? [];
  const completeTask = useMutation({
    mutationFn: async (taskId: number) => (await apiRequest("POST", `/api/xpot/tasks/${taskId}/complete`)).json(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] }),
        queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/xpot/tasks") }),
      ]);
      toast({ title: t("taskCompleted"), variant: "success" });
    },
  });
  const allDaily = salesSummary.data?.daily ?? [];
  const activityOptions = [
    { value: "visits" as const, label: t("activityVisits"), swatchClassName: "bg-blue-400" },
    { value: "revenue" as const, label: t("activityRevenue"), swatchClassName: "bg-indigo-400" },
    { value: "profit" as const, label: t("activityProfit"), swatchClassName: "bg-emerald-400" },
    { value: "sales" as const, label: t("activitySales"), swatchClassName: "bg-violet-400" },
  ];
  const activityLabel = activityOptions.find((option) => option.value === activityMetric)?.label ?? t("activityVisits");
  const activityDaily = activityMetric === "visits"
    ? (dashboardQuery.data?.visitActivityDaily ?? []).map((day) => ({ date: day.date, value: day.visits }))
    : allDaily.map((day) => ({
      date: day.date,
      value: activityMetric === "revenue"
        ? day.revenueCents / 100
        : activityMetric === "profit"
          ? day.profitCents / 100
          : day.salesCount,
    }));
  const chartDaily = activityDaily.slice(-periodDays);
  const previousDaily = activityDaily.slice(-(periodDays * 2), -periodDays);
  const currentActivity = chartDaily.reduce((sum, day) => sum + day.value, 0);
  const previousActivity = previousDaily.reduce((sum, day) => sum + day.value, 0);
  const hasChartActivity = chartDaily.some((day) => day.value !== 0);
  const activityChange = previousActivity !== 0 ? Math.round(((currentActivity - previousActivity) / Math.abs(previousActivity)) * 100) : null;
  const activityLoading = activityMetric === "visits" ? dashboardQuery.isLoading : salesSummary.isLoading;
  const activityTone = ACTIVITY_TONES[activityMetric];
  const isCurrencyActivity = activityMetric === "revenue" || activityMetric === "profit";

  function routeStatusLabel(status: DashboardRoute["status"]) {
    if (status === "draft") return t("routeStatusDraft");
    if (status === "published") return t("routeStatusPublished");
    if (status === "in_progress") return t("routeStatusInProgress");
    if (status === "completed") return t("routeStatusCompleted");
    return t("routeStatusCancelled");
  }

  function taskTimeLabel(value: Date | string | null | undefined) {
    if (!value) return t("taskNoDueDate");
    return new Date(value).toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" });
  }

  const chartBlock = (
    <DashboardSection
      title={t("visitActivity")}
      icon={Activity}
      bodyClassName="p-4 lg:p-5"
      action={(
        <div className="flex items-center gap-1.5 sm:gap-2">
          {hasChartActivity && (activityChange !== null || currentActivity > 0) ? (
            <span className={`hidden rounded-full px-2 py-1 text-[10px] font-semibold lg:inline-flex ${activityChange !== null && activityChange < 0 ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>
              {activityChange === null ? t("newActivity") : t("versusPrevious", { change: `${activityChange > 0 ? "+" : ""}${activityChange}` })}
            </span>
          ) : null}
          <MetricSelector
            value={activityMetric}
            onChange={setActivityMetric}
            ariaLabel={t("activityMetricSelector")}
            options={activityOptions}
          />
          <PeriodSelector
            value={periodDays}
            onChange={setPeriodDays}
            ariaLabel={t("periodSelector")}
            options={[
              { value: 7, label: t("period7Days") },
              { value: 30, label: t("period30Days") },
            ]}
          />
        </div>
      )}
    >
      {activityLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-white/[0.035] lg:h-56" />
      ) : !hasChartActivity ? (
        <div className="h-48 lg:h-56">
          <EmptyMetricState
            icon={Activity}
            title={t("noMetricActivity", { metric: activityLabel.toLocaleLowerCase(t.locale) })}
            hint={t("noMetricActivityHint")}
            action={<button type="button" onClick={() => setLocation(activityMetric === "visits" ? "/dashboard/history" : "/sales")} className="text-xs font-semibold text-indigo-300 transition-colors hover:text-indigo-200">{activityMetric === "visits" ? t("openVisits") : t("openSales")}</button>}
          />
        </div>
      ) : (
        <div className="h-48 w-full lg:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartDaily.map((day, index, values) => ({
              day: index === values.length - 1
                ? t("today")
                : new Date(`${day.date}T12:00:00`).toLocaleDateString(t.locale, { weekday: "short" }),
              value: day.value,
            }))} margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={`activityGradient-${activityMetric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={activityTone.fill} stopOpacity={0.32} />
                  <stop offset="95%" stopColor={activityTone.fill} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600 }} dy={10} interval="preserveStartEnd" />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "12px", color: "#fff" }}
                itemStyle={{ color: "#fff", fontWeight: "bold" }}
                formatter={(value: number) => [isCurrencyActivity ? formatCents(Math.round(value * 100)) : new Intl.NumberFormat(t.locale).format(value), activityLabel]}
                cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              <Area type="monotone" dataKey="value" stroke={activityTone.stroke} strokeWidth={2.5} fillOpacity={1} fill={`url(#activityGradient-${activityMetric})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardSection>
  );

  const salesBlock = (
    <>
      {/* Sales — what the operation made and what is out on shelves */}
      {salesSummary.isLoading ? (
        <div className="h-28 animate-pulse rounded-[18px] border border-white/[0.07] bg-white/[0.03]" />
      ) : salesSummary.data ? (
        <button
          type="button"
          onClick={() => setLocation("/sales")}
          className="w-full rounded-[18px] p-4 text-left transition-all hover:brightness-110 active:scale-[0.995]"
          style={{
            background: salesSummary.data.consignment.dueCount > 0 ? "rgba(239,68,68,0.07)" : "rgba(16,185,129,0.07)",
            border: `1px solid ${salesSummary.data.consignment.dueCount > 0 ? "rgba(239,68,68,0.22)" : "rgba(16,185,129,0.2)"}`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{t("salesKeptMonth")}</div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-400">
                {formatCents(salesSummary.data.profit.monthToDateCents)}
              </div>
              <div className="text-[11px] text-white/35">
                {t("salesBilled", { amount: formatCents(salesSummary.data.revenue.monthToDateCents) })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{t("salesOnStreet")}</div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-white">
                {salesSummary.data.consignment.unitsOnHand}
              </div>
              <div className="text-[11px] text-white/35">
                {formatCents(salesSummary.data.consignment.valueOnHandCents)}
              </div>
            </div>
          </div>
          {salesSummary.data.consignment.dueCount > 0 && (
            <div className="mt-2.5 border-t border-white/[0.07] pt-2.5 text-[11px] text-red-300">
              {t.plural(isDesktop ? "salesOverdueClick" : "salesOverdueTap", salesSummary.data.consignment.dueCount)}
            </div>
          )}
        </button>
      ) : null}
    </>
  );

  const todayBlock = (
    <DashboardSection
      title={t("yourDay")}
      icon={CalendarClock}
      bodyClassName="p-0"
      action={(
        <button type="button" onClick={() => setLocation(todayRoute ? `/route?routeId=${todayRoute.id}` : "/route")} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-300 transition-colors hover:text-indigo-200">
          {t("viewRoute")} <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    >
      <button
        type="button"
        onClick={() => setLocation(todayRoute ? `/route?routeId=${todayRoute.id}` : "/route")}
        className="group w-full border-b border-white/[0.06] bg-gradient-to-r from-indigo-500/[0.075] via-blue-500/[0.035] to-transparent px-4 py-4 text-left transition-colors hover:from-indigo-500/[0.11] lg:px-5"
      >
        <div className="flex items-start gap-3.5">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${todayRoute ? "bg-indigo-500/15 text-indigo-300" : "bg-white/[0.045] text-white/35"}`}>
            <RouteIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{t("todayRoute")}</span>
              {todayRoute ? <span className="rounded-full bg-white/[0.055] px-2 py-0.5 text-[10px] font-semibold text-white/50">{routeStatusLabel(todayRoute.status)}</span> : null}
            </span>
            <span className="mt-1 block truncate text-base font-bold text-white/90">{todayRoute?.name ?? t("routeNotCreated")}</span>
            {todayRoute && routeStops.length ? (
              <>
                <span className="mt-1 block text-xs text-white/40">{nextStop ? t("routeNextStop", { stop: nextStop.name }) : t("routeProgress", { completed: completedStops, total: routeStops.length })}</span>
                <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-400 transition-[width]" style={{ width: `${Math.round((completedStops / routeStops.length) * 100)}%` }} />
                </span>
                <span className="mt-1.5 block text-[10px] font-medium tabular-nums text-white/30">{t("routeProgress", { completed: completedStops, total: routeStops.length })}</span>
              </>
            ) : (
              <span className="mt-1 block text-xs text-white/35">{todayRoute ? routeStatusLabel(todayRoute.status) : t("routeMissingHint")}</span>
            )}
          </span>
          <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-white/50" aria-hidden="true" />
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 lg:px-5">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-blue-300" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white/50">{t("tasksTodayTitle")}</h3>
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-blue-300">{metrics?.tasksToday ?? 0}</span>
        </div>
        <button type="button" onClick={() => setLocation("/tasks?new=1")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/10 hover:text-indigo-200">
          <Plus className="h-3.5 w-3.5" /> {t("addTask")}
        </button>
      </div>

      {tasksToday.length ? (
        <div className="px-2 pb-2 lg:px-3 lg:pb-3">
          {tasksToday.slice(0, 5).map((task) => (
            <div key={task.id} className="group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.03]">
              <button
                type="button"
                onClick={() => completeTask.mutate(task.id)}
                disabled={completeTask.isPending}
                aria-label={t("completeTask", { task: task.title })}
                title={t("completeTask", { task: task.title })}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-transparent transition-colors hover:border-emerald-400/60 hover:bg-emerald-400/10 hover:text-emerald-300 disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setLocation(task.leadId ? `/leads/${task.leadId}` : "/tasks")} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-white/82">{task.title}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-white/34">
                  <span className="shrink-0 tabular-nums">{taskTimeLabel(task.dueAt)}</span>
                  {task.lead ? <><span aria-hidden="true">·</span><span className="truncate">{task.lead.name}</span></> : null}
                </span>
              </button>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/10 transition group-hover:text-white/35" aria-hidden="true" />
            </div>
          ))}
          <button type="button" onClick={() => setLocation("/tasks")} className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl border-t border-white/[0.05] px-3 pt-3 text-xs font-semibold text-indigo-300/75 transition-colors hover:text-indigo-200">
            {t("viewAllTasks")} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="px-5 pb-5 pt-2 text-center">
          <div className="text-sm font-semibold text-white/55">{t("todayTasksClear")}</div>
          <div className="mt-1 text-xs text-white/28">{t("todayTasksClearHint")}</div>
        </div>
      )}
    </DashboardSection>
  );

  const attentionBlock = (
    <DashboardSection title={t("needsAttention")} icon={AlertTriangle} bodyClassName="p-0">
      {(metrics?.overdueTasks ?? 0) > 0 || (salesSummary.data?.consignment.dueCount ?? 0) > 0 || (metrics?.openOpportunities ?? 0) > 0 ? (
        <AttentionList>
          {(metrics?.overdueTasks ?? 0) > 0 ? <AttentionItem icon={Clock3} eyebrow={t("taskOverdue")} title={t("overdueTasksTitle")} detail={t.plural("overdueTasksDetail", metrics?.overdueTasks ?? 0)} tone="amber" onClick={() => setLocation("/tasks")} /> : null}
          {(salesSummary.data?.consignment.dueCount ?? 0) > 0 ? <AttentionItem icon={DollarSign} eyebrow={t("salesOnStreet")} title={t("settlementsDueTitle")} detail={t.plural("settlementsDueDetail", salesSummary.data?.consignment.dueCount ?? 0)} tone="amber" onClick={() => setLocation("/sales")} /> : null}
          {(metrics?.openOpportunities ?? 0) > 0 ? <AttentionItem icon={Target} eyebrow={t("metricOpportunities")} title={t("openOpportunitiesTitle")} detail={t.plural("openOpportunitiesDetail", metrics?.openOpportunities ?? 0)} tone="violet" onClick={() => setLocation("/sales")} /> : null}
        </AttentionList>
      ) : (
        <div className="px-5 py-7 text-center">
          <div className="text-sm font-semibold text-white/60">{t("attentionClear")}</div>
          <div className="mt-1 text-xs text-white/30">{t("attentionClearHint")}</div>
        </div>
      )}
    </DashboardSection>
  );

  const syncBlock = (
    <>
      {/* Sync failures */}
      {failedEvents.length > 0 && (
        <div
          className="rounded-[18px] p-4 space-y-2"
          style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <div className="text-xs font-bold uppercase tracking-widest text-red-400">
              {t.plural("syncFailures", failedEvents.length)}
            </div>
          </div>
          {failedEvents.slice(0, 3).map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: "rgba(0,0,0,0.2)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white/80 truncate">
                  {event.entityType.replace("sales_", "").replace("_", " ")} #{event.entityId}
                </div>
                <div className="text-[10px] text-red-400/70 truncate">{event.lastError ?? t("unknownError")}</div>
              </div>
              <button
                type="button"
                onClick={() => retryMutation.mutate({ entityType: event.entityType, entityId: event.entityId })}
                disabled={retryMutation.isPending}
                aria-label={t("retrySync")}
                title={t("retrySync")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${retryMutation.isPending ? "animate-spin" : ""}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const recentBlock = (
    <DashboardSection
      title={t("latestVisits")}
      icon={Footprints}
      bodyClassName="p-2"
      action={<button type="button" onClick={() => setLocation("/dashboard/history")} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-300/80 transition-colors hover:text-indigo-200">{t("viewHistory")}<ChevronRight className="h-3.5 w-3.5" /></button>}
    >
      {dashboardQuery.data?.recentVisits?.length ? (
        <div className="divide-y divide-white/[0.05]" data-testid="dashboard-recent-visits">
          {dashboardQuery.data.recentVisits.map((visit) => {
            const when = visit.checkedOutAt ?? visit.checkedInAt ?? visit.scheduledAt;
            // The status is the outcome the rep picked; the note line adds what they wrote, if anything.
            const noteLine = visit.note?.outcome || visit.note?.nextStep;
            return (
              <button key={visit.id} type="button" onClick={() => setLocation(`/dashboard/history/${visit.id}`)} className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left transition-colors hover:bg-white/[0.03]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-indigo-500/10 text-indigo-300"><MapPinned className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white/78">{visit.lead?.name ?? `#${visit.leadId}`}</span>
                  <span className="mt-1 flex min-w-0 items-center gap-2">
                    <StatusBadge status={visit.status} />
                    {noteLine ? <span className="min-w-0 truncate text-[11px] text-white/30">{noteLine}</span> : null}
                  </span>
                </span>
                {when ? <span className="shrink-0 text-right text-[10px] leading-relaxed tabular-nums text-white/28">{new Date(when).toLocaleDateString(t.locale, { month: "short", day: "numeric" })}<br />{new Date(when).toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" })}</span> : null}
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/10 transition group-hover:text-white/35" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-8 text-center"><div className="text-sm font-semibold text-white/55">{t("noVisitsYet")}</div><div className="mt-1 text-xs text-white/28">{t("goToCheckIn")}</div></div>
      )}
    </DashboardSection>
  );

  return (
    <div className="space-y-5 lg:space-y-6">
      <QuickCheckIn />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        <KpiTile label={t("metricVisitsToday")} value={metrics?.visitsToday ?? 0} icon={MapPinned} accent="blue" detail={t.plural("metricVisitsRemaining", metrics?.remainingVisitsToday ?? 0)} loading={dashboardQuery.isLoading} onClick={() => setLocation("/route")} />
        <KpiTile label={t("metricCompletedToday")} value={metrics?.completedVisitsToday ?? 0} icon={Check} accent="emerald" detail={t.plural("metricVisitsCompleted", metrics?.completedVisitsToday ?? 0)} loading={dashboardQuery.isLoading} onClick={() => setLocation("/dashboard/history?view=day")} />
        <KpiTile label={t("metricTasksToday")} value={metrics?.tasksToday ?? 0} icon={ListTodo} accent="amber" detail={t.plural("metricTasksOverdue", metrics?.overdueTasks ?? 0)} loading={dashboardQuery.isLoading} onClick={() => setLocation("/tasks")} />
        <KpiTile label={t("metricSalesToday")} value={salesSummary.data ? formatCents(salesSummary.data.revenue.todayCents) : "—"} icon={DollarSign} accent="violet" detail={salesSummary.data ? t("metricSalesProfit", { amount: formatCents(salesSummary.data.profit.todayCents) }) : undefined} loading={salesSummary.isLoading} onClick={() => setLocation("/sales")} />
      </div>

      {isDesktop ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
            <div className="min-w-0">{todayBlock}</div>
            <div className="space-y-4">
              {attentionBlock}
              {salesBlock}
              {syncBlock}
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
            <div className="min-w-0">{chartBlock}</div>
            <div>{recentBlock}</div>
          </div>
        </>
      ) : (
        <>
          {todayBlock}
          {attentionBlock}
          {salesBlock}
          {chartBlock}
          {recentBlock}
          {syncBlock}
        </>
      )}
    </div>
  );
}

export function XpotDashboard() {
  const [location, navigate] = useLocation();
  const t = useT(dashboardMessages);
  const view = location.startsWith("/dashboard/history") || location.startsWith("/visits") ? "history" : "overview";
  const visitDetailOpen = /^\/dashboard\/history\/\d+/.test(location);

  if (view === "overview") return <DashboardOverview />;

  return (
    <div className="space-y-4">
      {!visitDetailOpen ? <header className="flex items-start gap-3 px-1">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          aria-label={t("backToDashboard")}
          title={t("backToDashboard")}
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">{t("historyTitle")}</h1>
          <p className="mt-0.5 text-sm text-white/40">{t("historySubtitle")}</p>
        </div>
      </header> : null}
      <XpotVisits basePath="/dashboard/history" />
    </div>
  );
}
