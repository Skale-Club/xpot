import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Activity, AlertTriangle, Ban, ChevronRight, Cpu, History, ListOrdered, RotateCw, ScrollText } from "lucide-react";
import { EYEBROW } from "@/components/xpot/surface";
import { useToast } from "@/hooks/use-toast";
import { describeApiError } from "@/lib/apiErrors";
import { platformAdminMessages } from "@/i18n/messages/platformAdmin";
import { CAUSE_ANCHOR, statusOverview, type StatusCause } from "./platform/servicesUi";
import { ServicesSection, SyncProblemsSection, useServices, useSyncProblems } from "./platform/StatusSections";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { FilterBar, FilterChips, FilterSearch, FilterSelect, FilterToken } from "@/components/xpot/filters";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { ListPager } from "@/components/xpot/pagination";
import { Pill, PILL_DOTS } from "@/components/xpot/StatusPill";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/dates";
import { useT } from "@/i18n";
import { systemHealthMessages } from "@/i18n/messages/systemHealth";
import { SYSTEM_EVENT_SOURCES } from "@shared/schema/observability";
import type { EventGroup, RecentRun, StuckJob, SystemEventRow, SystemHealthSnapshot } from "@shared/system-health";
import { AdminSystemEventDetail } from "./AdminSystemEventDetail";
import {
  Card,
  formatDuration,
  HealthReason,
  healthReason,
  REFRESH_MS,
  runBar,
  RunStatusChip,
  sourceLabel,
  Stat,
  useAgo,
  VERDICT_BANNER,
  VerdictChip,
  verdictTone,
  type T,
} from "./systemHealthUi";

/** /admin/health is Status; /admin/health/events/:id is one event in full. */
export function AdminSystemHealth() {
  const [location] = useLocation();
  const eventId = /^\/admin\/health\/events\/(\d+)/.exec(location)?.[1];
  return eventId ? <AdminSystemEventDetail id={Number(eventId)} /> : <SystemHealthOverview />;
}


/** A short heading between the parts of the page. */
function PartTitle({ children }: { children: string }) {
  return <h2 className={`${EYEBROW} px-1 pt-2`}>{children}</h2>;
}

/** Asks the route builder again for a search that finished without a route, whoever owns it. */
function RetryRouteButton({ job }: { job: StuckJob }) {
  const tp = useT(platformAdminMessages);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/xpot/admin/system-health/jobs/${job.jobId}/retry-route`)).json(),
    onSuccess: () => toast({ title: tp("routeRetried"), variant: "success" }),
    onError: (e: Error) => toast({ title: tp("routeRetryFailed"), description: describeApiError(e), variant: "destructive" }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/system-health"] }),
  });
  return (
    <Button variant="secondary" size="sm" className="shrink-0" loading={retry.isPending} onClick={() => retry.mutate()} data-testid="status-retry-route">
      <RotateCw />
      {tp("retryRoute")}
    </Button>
  );
}

/**
 * Stops a stuck search for whoever owns it (POST /admin/system-health/jobs/:id/cancel):
 * its waiting and running searches stop, and a route not built yet is marked failed.
 */
function CancelSearchButton({ jobId, location, repName }: { jobId: number; location: string; repName: string | null }) {
  const tp = useT(platformAdminMessages);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const cancel = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/xpot/admin/system-health/jobs/${jobId}/cancel`)).json(),
    onSuccess: () => toast({ title: tp("searchCancelled"), variant: "success" }),
    onError: (e: Error) => toast({ title: tp("searchCancelFailed"), description: describeApiError(e), variant: "destructive" }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/system-health"] }),
  });
  return (
    <>
      <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setOpen(true)} data-testid="status-cancel-search">
        <Ban className="text-red-400" />
        {tp("cancelSearch")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title={tp("cancelSearchTitle", { id: jobId })}
        description={tp("cancelSearchBody", { location, rep: repName ? ` · ${repName}` : "" })}
        confirmLabel={tp("cancelSearch")}
        cancelLabel={tp("cancelSearchKeep")}
        testId="status-cancel-search-confirm"
        onConfirm={() => cancel.mutateAsync()}
      />
    </>
  );
}

function SystemHealthOverview() {
  const t = useT(systemHealthMessages);
  const tp = useT(platformAdminMessages);
  const ago = useAgo(t);
  const services = useServices();
  const syncProblems = useSyncProblems();
  const [, setNow] = useState(0);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [runFilter, setRunFilter] = useState<number | null>(null);
  const health = useQuery<SystemHealthSnapshot>({
    queryKey: ["/api/xpot/admin/system-health"],
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });
  // The "x seconds ago" labels keep moving between refreshes.
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  if (health.isLoading) {
    return (
      <div className="space-y-4">
        <ListSkeleton rows={1} rowClassName="h-14 rounded-2xl" />
        <ListSkeleton rows={3} className="grid gap-4 lg:grid-cols-3" rowClassName="h-40 rounded-2xl" />
      </div>
    );
  }
  if (health.isError || !health.data) {
    return <ErrorState message={t("loadFailed")} onRetry={() => void health.refetch()} />;
  }

  const data = health.data;
  const { worker, queue, events } = data;
  // The banner weighs the prospecting pipeline, the services and the CRM sync, and says which one.
  const overview = statusOverview(data, services.data?.services ?? [], syncProblems.data?.problems.length ?? 0);
  const overallTone = verdictTone(overview.verdict);
  const jumpTo = (cause: StatusCause) => document.getElementById(CAUSE_ANCHOR[cause])?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-4" data-testid="system-health">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${VERDICT_BANNER[overallTone]}`} data-testid="status-banner">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PILL_DOTS[overallTone]} ${overview.verdict === "healthy" ? "" : "animate-pulse"}`} />
            <p className="font-semibold">{t(`overall_${overview.verdict}`)}</p>
          </div>
          {overview.causes.length > 0 && (
            <p className="mt-1 pl-[22px] text-xs text-white/60">
              {tp("causedBy")}{" "}
              {overview.causes.map((cause, index) => (
                <span key={cause}>
                  {index > 0 && " · "}
                  <a
                    href={`#${CAUSE_ANCHOR[cause]}`}
                    onClick={(event) => {
                      event.preventDefault();
                      jumpTo(cause);
                    }}
                    className="font-semibold text-white/85 underline underline-offset-2"
                    data-testid={`status-cause-${cause}`}
                  >
                    {tp(`cause_${cause}`)}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void health.refetch()} disabled={health.isFetching} className="text-xs font-medium text-white/55">
          <RotateCw />
          {t("updatedAgo", { time: ago(data.generatedAt) })}
        </Button>
      </div>

      <ServicesSection query={services} />

      <PartTitle>{tp("pipelineTitle")}</PartTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <div id={CAUSE_ANCHOR.worker} className="scroll-mt-24">
          <Card title={t("workerTitle")} icon={Cpu} right={<VerdictChip verdict={worker.verdict} t={t} />}>
            <HealthReason t={t} code={worker.reasonCode} fallback={worker.reason} />
            <p className="mt-2 text-xs text-white/45">
              {t("workerLastTick", { time: ago(worker.lastTickFinishedAt) })}
              {worker.lastTickDurationMs !== null && ` · ${t("workerTickTook", { duration: formatDuration(worker.lastTickDurationMs) })}`}
              {` · ${t("workerEvery", { seconds: Math.round(worker.pollMs / 1000) })}`}
            </p>
            {worker.lastError && (
              <p className="mt-2 break-words text-xs text-red-300/80">
                {t("workerLastError", { time: ago(worker.lastError.at), message: worker.lastError.message })}
              </p>
            )}
          </Card>
        </div>

        <Card title={t("queueTitle")} icon={ListOrdered}>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t("queueQueued")} value={queue.queuedRuns} />
            <Stat label={t("queueOpenJobs")} value={queue.openJobs} />
            <Stat label={t("queueDone24h")} value={queue.completedRuns24h} />
            <Stat label={t("queueFailed24h")} value={queue.failedRuns24h} tone={queue.failedRuns24h ? "bad" : undefined} />
            <Stat label={t("queueRouteFailed24h")} value={queue.failedRoutes24h} tone={queue.failedRoutes24h ? "warn" : undefined} />
          </div>
          {queue.oldestQueuedMs !== null && (
            <p className="mt-2 text-xs text-white/45">{t("queueOldest", { duration: formatDuration(queue.oldestQueuedMs) })}</p>
          )}
        </Card>
      </div>

      <div id={CAUSE_ANCHOR.runs} className="scroll-mt-24">
        <Card title={t("activeRunsTitle")} icon={Activity}>
          {queue.activeRuns.length === 0 ? (
            <EmptyState compact dense icon={Activity} title={t("noActiveRuns")} cardStyle={{}} />
          ) : (
            <ul className="space-y-3">
              {queue.activeRuns.map((run) => {
                const limitMs = run.deadlineMs;
                const pct = Math.min(100, Math.round((run.elapsedMs / limitMs) * 100));
                const typicalPct = run.typicalMs ? Math.min(100, Math.round((run.typicalMs / limitMs) * 100)) : null;
                return (
                  <li key={run.runId} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{run.query} · {run.location}</p>
                        <p className="text-xs text-white/45">
                          {t("runJob", { id: run.jobId })}{run.repName ? ` · ${run.repName}` : ""}{run.wave ? ` · ${t("runWave", { wave: run.wave })}` : ""}
                        </p>
                      </div>
                      <VerdictChip verdict={run.verdict} t={t} />
                    </div>
                    <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${PILL_DOTS[verdictTone(run.verdict)]}`} style={{ width: `${pct}%` }} />
                      {typicalPct !== null && <div className="absolute top-0 h-full w-0.5 bg-white/60" style={{ left: `${typicalPct}%` }} />}
                    </div>
                    <p className="mt-2 text-xs text-white/55">
                      {t("runElapsed", { duration: formatDuration(run.elapsedMs) })}
                      {run.typicalMs !== null && ` · ${t("runTypical", { duration: formatDuration(run.typicalMs) })}`}
                      {` · ${t("runLimit", { duration: formatDuration(limitMs) })}`}
                      {` · ${t("runChecked", { time: ago(run.updatedAt) })}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
                      <div title={run.engineJobId ?? undefined}>
                        <HealthReason t={t} code={run.reasonCode} fallback={run.reason} className="text-xs text-white/40" />
                      </div>
                      <CancelSearchButton jobId={run.jobId} location={run.location} repName={run.repName} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {queue.stuckJobs.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-300/80">{t("stuckJobsTitle")}</p>
              <ul className="space-y-2">
                {queue.stuckJobs.map((job) => {
                  const reason = healthReason(t, job.reasonCode, job.reason);
                  return (
                    <li key={job.jobId} className="flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between" data-testid="status-stuck-job">
                      <div className="min-w-0">
                        <span className="font-semibold">{t("runJob", { id: job.jobId })} · {job.location}</span>
                        <span className="text-white/50"> · {reason.text}{job.repName ? ` · ${job.repName}` : ""} · {ago(job.updatedAt)}</span>
                        {reason.todo && <span className="block text-white/40">{t("whatToDo", { action: reason.todo })}</span>}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {job.canRetry && <RetryRouteButton job={job} />}
                        <CancelSearchButton jobId={job.jobId} location={job.location} repName={job.repName} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <RecentSearches
        runs={queue.recentRuns}
        t={t}
        ago={ago}
        onShowEvents={(runId) => {
          setRunFilter(runId);
          document.getElementById("system-event-log")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <PartTitle>{tp("cause_sync")}</PartTitle>
      <SyncProblemsSection query={syncProblems} />

      <PartTitle>{t("errorsTitle")}</PartTitle>
      <Card title={t("errorsTitle")} icon={AlertTriangle}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t("errors24h")} value={events.errors24h} tone={events.errors24h ? "bad" : undefined} />
          <Stat label={t("warnings24h")} value={events.warnings24h} tone={events.warnings24h ? "warn" : undefined} />
        </div>
        {events.bySource24h.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {events.bySource24h.map((row) => (
              <Pill key={`${row.source}:${row.level}`} tone={row.level === "error" ? "red" : "amber"} bordered>
                {sourceLabel(t, row.source)} · {row.count}
              </Pill>
            ))}
          </div>
        )}
      </Card>
      <ProblemGroups groups={events.groups} t={t} ago={ago} onPick={setFingerprint} />
      <EventLog
        t={t}
        ago={ago}
        fingerprint={fingerprint}
        onClearFingerprint={() => setFingerprint(null)}
        runId={runFilter}
        onClearRun={() => setRunFilter(null)}
      />
    </div>
  );
}

/**
 * The last searches as a strip of bars, oldest on the left: a red streak at the
 * right end means the engine is failing now, before anyone reads a log.
 */
function RecentSearches({ runs, t, ago, onShowEvents }: {
  runs: RecentRun[];
  t: T;
  ago: (v: string | null) => string;
  onShowEvents: (runId: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const timeline = [...runs].reverse();
  const finished = runs.filter((run) => run.status === "completed" || run.status === "failed");
  const failed = finished.filter((run) => run.status === "failed");
  const lastFailure = runs.find((run) => run.status === "failed");
  const durations = runs.flatMap((run) => (run.status === "completed" && run.durationMs ? [run.durationMs] : []));
  const average = durations.length ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : null;
  const selected = runs.find((run) => run.runId === selectedId) ?? null;
  const successRate = finished.length ? Math.round(((finished.length - failed.length) / finished.length) * 100) : null;

  return (
    <Card
      title={t("timelineTitle")}
      icon={History}
      right={successRate !== null ? (
        <span className={`text-xs font-semibold ${successRate >= 95 ? "text-emerald-300" : successRate >= 80 ? "text-amber-300" : "text-red-300"}`}>
          {t("timelineSuccessRate", { rate: successRate })}
        </span>
      ) : undefined}
    >
      {runs.length === 0 ? (
        <EmptyState compact dense icon={History} title={t("timelineEmpty")} cardStyle={{}} />
      ) : (
        <>
          <div className="flex h-8 items-end justify-end gap-[3px]" role="list" aria-label={t("timelineTitle")} data-testid="search-timeline">
            {timeline.map((run) => {
              const active = run.runId === selectedId;
              const label = `${run.query} · ${run.location} · ${t(`runStatus_${run.status}`)} · ${formatDateTime(run.createdAt)}${run.errorMessage ? ` · ${run.errorMessage}` : ""}`;
              return (
                <button
                  key={run.runId}
                  type="button"
                  role="listitem"
                  title={label}
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => setSelectedId(active ? null : run.runId)}
                  className={`h-full min-w-[4px] max-w-[10px] flex-1 rounded-sm transition-opacity ${runBar(run.status)} ${
                    selectedId !== null && !active ? "opacity-35" : "hover:opacity-80"
                  } ${active ? "ring-2 ring-white/70 ring-offset-1 ring-offset-[#0b1020]" : ""}`}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-white/35">
            <span>{t("timelineOlder")}</span>
            <span>{t("timelineNow")}</span>
          </div>
          <p className="mt-2 text-xs text-white/50">
            {t("timelineSummary", { failed: failed.length, total: finished.length })}
            {lastFailure ? ` · ${t("timelineLastFailure", { time: ago(lastFailure.completedAt ?? lastFailure.createdAt) })}` : ""}
            {average !== null ? ` · ${t("timelineAverage", { duration: formatDuration(average) })}` : ""}
          </p>

          {selected && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm" data-testid="search-timeline-detail">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{selected.query} · {selected.location}</p>
                  <p className="text-xs text-white/45">
                    {t("runJob", { id: selected.jobId })} · #{selected.runId}
                    {selected.repName ? ` · ${selected.repName}` : ""}
                    {selected.wave ? ` · ${t("runWave", { wave: selected.wave })}` : ""}
                  </p>
                </div>
                <RunStatusChip status={selected.status} t={t} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <dt className="text-white/40">{t("runStarted")}</dt>
                <dd className="text-white/75">{formatDateTime(selected.startedAt)}</dd>
                <dt className="text-white/40">{t("runDuration")}</dt>
                <dd className="text-white/75">{formatDuration(selected.durationMs)}</dd>
                <dt className="text-white/40">{t("runResults")}</dt>
                <dd className="text-white/75">{selected.resultCount}</dd>
                <dt className="text-white/40">{t("runQueuedAt")}</dt>
                <dd className="text-white/75">{ago(selected.createdAt)}</dd>
              </dl>
              {selected.errorMessage && <p className="mt-2 break-words text-xs text-red-300">{selected.errorMessage}</p>}
              <Button variant="secondary" size="sm" onClick={() => onShowEvents(selected.runId)} className="mt-3">
                {t("timelineShowEvents")}
                <ChevronRight />
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ProblemGroups({ groups, t, ago, onPick }: { groups: EventGroup[]; t: T; ago: (v: string | null) => string; onPick: (fp: string) => void }) {
  return (
    <Card title={t("groupsTitle")} icon={AlertTriangle}>
      {groups.length === 0 ? (
        <EmptyState compact dense icon={AlertTriangle} title={t("groupsEmpty")} cardStyle={{}} />
      ) : (
        <ul className="divide-y divide-white/5">
          {groups.map((group) => (
            <li key={group.fingerprint}>
              <button
                type="button"
                onClick={() => {
                  onPick(group.fingerprint);
                  document.getElementById("system-event-log")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="flex min-h-11 w-full items-start gap-3 py-2.5 text-left hover:bg-white/[0.02]"
                title={t("showOccurrences")}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${group.level === "error" ? PILL_DOTS.red : PILL_DOTS.amber}`} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm text-white/85">{group.message}</span>
                  <span className="text-xs text-white/40">
                    {sourceLabel(t, group.source)} · {t("groupLastSeen", { time: ago(group.lastSeenAt) })}
                  </span>
                </span>
                <Pill tone="slate" className="shrink-0">
                  {t("groupCount", { count: group.count })}
                </Pill>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type EventsPage = { events: SystemEventRow[]; nextBefore: number | null };

function EventLog({ t, ago, fingerprint, onClearFingerprint, runId, onClearRun }: {
  t: T;
  ago: (v: string | null) => string;
  fingerprint: string | null;
  onClearFingerprint: () => void;
  runId: number | null;
  onClearRun: () => void;
}) {
  const [level, setLevel] = useState<"all" | "error" | "warn">("all");
  const [source, setSource] = useState("");
  // FilterSearch reports after typing pauses (debounceMs), so this is already the settled search.
  const [query, setQ] = useState("");
  const q = query.trim();

  const params = new URLSearchParams();
  if (level !== "all") params.set("level", level);
  if (source) params.set("source", source);
  if (q) params.set("q", q);
  if (fingerprint) params.set("fingerprint", fingerprint);
  if (runId) params.set("runId", String(runId));
  const base = `/api/xpot/admin/system-events?${params.toString()}`;
  const events = useInfiniteQuery({
    queryKey: ["/api/xpot/admin/system-events", level, source, q, fingerprint, runId],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<EventsPage> =>
      (await apiRequest("GET", pageParam ? `${base}&before=${pageParam}` : base)).json(),
    getNextPageParam: (last) => last.nextBefore,
    refetchInterval: REFRESH_MS,
  });
  const rows = events.data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <div id="system-event-log" className="scroll-mt-4">
      <Card title={t("eventsTitle")} icon={ScrollText}>
        <FilterBar
          className="mb-3"
          search={<FilterSearch value={query} onChange={setQ} debounceMs={300} placeholder={t("searchPlaceholder")} shortcut={false} />}
          controls={
            <FilterSelect
              value={source}
              onChange={setSource}
              placeholder={t("allSources")}
              options={SYSTEM_EVENT_SOURCES.map((s) => ({ value: s, label: sourceLabel(t, s) }))}
            />
          }
          secondary={
            <div className="flex flex-wrap items-center gap-2">
              <FilterChips
                ariaLabel={t("eventsTitle")}
                value={level}
                onChange={setLevel}
                items={[
                  { id: "all", label: t("filterAll") },
                  { id: "error", label: t("filterErrors"), dot: PILL_DOTS.red },
                  { id: "warn", label: t("filterWarnings"), dot: PILL_DOTS.amber },
                ]}
              />
              {fingerprint && <FilterToken label={t("clearFilter")} onRemove={onClearFingerprint} />}
              {runId && <FilterToken label={t("filterRun", { id: runId })} onRemove={onClearRun} />}
            </div>
          }
        />

        {events.isLoading ? (
          <ListSkeleton rows={4} rowClassName="h-12 rounded-xl" />
        ) : events.isError ? (
          <ErrorState compact message={t("loadFailed")} onRetry={() => void events.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState compact dense icon={ScrollText} title={t("eventsEmpty")} cardStyle={{}} />
        ) : (
          <ul className="divide-y divide-white/5">
            {rows.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/admin/health/events/${event.id}`}
                  className="flex min-h-11 w-full items-start gap-2 rounded-lg py-2.5 text-left hover:bg-white/[0.02]"
                  data-testid="system-event-row"
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.level === "error" ? PILL_DOTS.red : PILL_DOTS.amber}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm text-white/85">{event.message}</span>
                    <span className="text-xs text-white/40">
                      {sourceLabel(t, event.source)} · {ago(event.createdAt)} · {formatDateTime(event.createdAt)}
                      {event.repName ? ` · ${event.repName}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ListPager
          shown={rows.length}
          hasMore={Boolean(events.hasNextPage)}
          onMore={() => {
            if (!events.isFetchingNextPage) void events.fetchNextPage();
          }}
          loading={events.isFetchingNextPage}
        />
      </Card>
    </div>
  );
}
