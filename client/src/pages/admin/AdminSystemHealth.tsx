import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Activity, AlertTriangle, ChevronRight, Cpu, History, ListOrdered, RefreshCw, Search } from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { Segmented } from "@/components/xpot/Segmented";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/i18n";
import { systemHealthMessages } from "@/i18n/messages/systemHealth";
import { SYSTEM_EVENT_SOURCES } from "@shared/schema/observability";
import type { EventGroup, RecentRun, SystemEventRow, SystemHealthSnapshot } from "@shared/system-health";
import { AdminSystemEventDetail } from "./AdminSystemEventDetail";
import {
  Card,
  formatDuration,
  REFRESH_MS,
  RUN_STATUS_STYLE,
  RunStatusChip,
  sourceLabel,
  Stat,
  useAgo,
  VERDICT_STYLE,
  VerdictChip,
  type T,
} from "./systemHealthUi";

/** /admin/health is the panel; /admin/health/events/:id is one event in full. */
export function AdminSystemHealth() {
  const [location] = useLocation();
  const eventId = /^\/admin\/health\/events\/(\d+)/.exec(location)?.[1];
  return eventId ? <AdminSystemEventDetail id={Number(eventId)} /> : <SystemHealthOverview />;
}


function SystemHealthOverview() {
  const t = useT(systemHealthMessages);
  const ago = useAgo(t);
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
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (health.isError || !health.data) return <p className="text-sm text-red-400">{t("loadFailed")}</p>;

  const data = health.data;
  const { worker, queue, events } = data;

  return (
    <div className="space-y-4" data-testid="system-health">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${VERDICT_STYLE[data.overall].banner}`}>
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${VERDICT_STYLE[data.overall].dot} ${data.overall === "healthy" ? "" : "animate-pulse"}`} />
          <p className="font-semibold">{t(`overall_${data.overall}`)}</p>
        </div>
        <button
          type="button"
          onClick={() => void health.refetch()}
          className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white/80"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${health.isFetching ? "animate-spin" : ""}`} />
          {t("updatedAgo", { time: ago(data.generatedAt) })}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("workerTitle")} icon={Cpu} right={<VerdictChip verdict={worker.verdict} t={t} />}>
          <p className="text-sm text-white/70">{worker.reason}</p>
          <p className="mt-2 text-xs text-white/45">
            {t("workerLastTick", { time: ago(worker.lastTickFinishedAt) })}
            {worker.lastTickDurationMs !== null && ` · ${t("workerTickTook", { duration: formatDuration(worker.lastTickDurationMs) })}`}
            {` · ${t("workerEvery", { seconds: Math.round(worker.pollMs / 1000) })}`}
          </p>
          {!worker.engineConfigured && <p className="mt-2 text-xs text-red-300">{t("engineNotConfigured")}</p>}
          {worker.lastError && (
            <p className="mt-2 break-words text-xs text-red-300/80">
              {t("workerLastError", { time: ago(worker.lastError.at), message: worker.lastError.message })}
            </p>
          )}
        </Card>

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

        <Card title={t("errorsTitle")} icon={AlertTriangle}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t("errors24h")} value={events.errors24h} tone={events.errors24h ? "bad" : undefined} />
            <Stat label={t("warnings24h")} value={events.warnings24h} tone={events.warnings24h ? "warn" : undefined} />
          </div>
          {events.bySource24h.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {events.bySource24h.map((row) => (
                <span
                  key={`${row.source}:${row.level}`}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${row.level === "error" ? "border-red-500/25 text-red-300/90" : "border-amber-500/25 text-amber-300/90"}`}
                >
                  {sourceLabel(t, row.source)} · {row.count}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title={t("activeRunsTitle")} icon={Activity}>
        {queue.activeRuns.length === 0 ? (
          <p className="text-sm text-white/45">{t("noActiveRuns")}</p>
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
                        {t("runJob", { id: run.jobId })}{run.repName ? ` · ${run.repName}` : ""}{run.wave ? ` · wave ${run.wave}` : ""}
                      </p>
                    </div>
                    <VerdictChip verdict={run.verdict} t={t} />
                  </div>
                  <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${VERDICT_STYLE[run.verdict].dot}`} style={{ width: `${pct}%` }} />
                    {typicalPct !== null && <div className="absolute top-0 h-full w-0.5 bg-white/60" style={{ left: `${typicalPct}%` }} />}
                  </div>
                  <p className="mt-2 text-xs text-white/55">
                    {t("runElapsed", { duration: formatDuration(run.elapsedMs) })}
                    {run.typicalMs !== null && ` · ${t("runTypical", { duration: formatDuration(run.typicalMs) })}`}
                    {` · ${t("runLimit", { duration: formatDuration(limitMs) })}`}
                    {` · ${t("runChecked", { time: ago(run.updatedAt) })}`}
                  </p>
                  <p className="mt-1 text-xs text-white/40">{run.reason}{run.engineJobId ? ` · ${run.engineJobId}` : ""}</p>
                </li>
              );
            })}
          </ul>
        )}
        {queue.stuckJobs.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-300/80">{t("stuckJobsTitle")}</p>
            <ul className="space-y-2">
              {queue.stuckJobs.map((job) => (
                <li key={job.jobId} className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-xs">
                  <span className="font-semibold">{t("runJob", { id: job.jobId })} · {job.location}</span>
                  <span className="text-white/50"> · {job.reason} · {ago(job.updatedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <RecentSearches
        runs={queue.recentRuns}
        t={t}
        ago={ago}
        onShowEvents={(runId) => {
          setRunFilter(runId);
          document.getElementById("system-event-log")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
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
        <p className="text-sm text-white/45">{t("timelineEmpty")}</p>
      ) : (
        <>
          <div className="flex h-8 items-end justify-end gap-[3px]" role="list" aria-label={t("timelineTitle")} data-testid="search-timeline">
            {timeline.map((run) => {
              const active = run.runId === selectedId;
              const label = `${run.query} · ${run.location} · ${t(`runStatus_${run.status}`)} · ${new Date(run.createdAt).toLocaleString()}${run.errorMessage ? ` · ${run.errorMessage}` : ""}`;
              return (
                <button
                  key={run.runId}
                  type="button"
                  role="listitem"
                  title={label}
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => setSelectedId(active ? null : run.runId)}
                  className={`h-full min-w-[4px] max-w-[10px] flex-1 rounded-sm transition-opacity ${RUN_STATUS_STYLE[run.status].bar} ${
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
                    {selected.wave ? ` · wave ${selected.wave}` : ""}
                  </p>
                </div>
                <RunStatusChip status={selected.status} t={t} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <dt className="text-white/40">{t("runStarted")}</dt>
                <dd className="text-white/75">{selected.startedAt ? new Date(selected.startedAt).toLocaleString() : "—"}</dd>
                <dt className="text-white/40">{t("runDuration")}</dt>
                <dd className="text-white/75">{formatDuration(selected.durationMs)}</dd>
                <dt className="text-white/40">{t("runResults")}</dt>
                <dd className="text-white/75">{selected.resultCount}</dd>
                <dt className="text-white/40">{t("runQueuedAt")}</dt>
                <dd className="text-white/75">{ago(selected.createdAt)}</dd>
              </dl>
              {selected.errorMessage && <p className="mt-2 break-words text-xs text-red-300">{selected.errorMessage}</p>}
              <button type="button" onClick={() => onShowEvents(selected.runId)} className="mt-3 text-xs font-semibold text-blue-300 hover:text-blue-200">
                {t("timelineShowEvents")} →
              </button>
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
        <p className="text-sm text-white/45">{t("groupsEmpty")}</p>
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
                className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-white/[0.02]"
                title={t("showOccurrences")}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${group.level === "error" ? "bg-red-400" : "bg-amber-400"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm text-white/85">{group.message}</span>
                  <span className="text-xs text-white/40">
                    {sourceLabel(t, group.source)} · {t("groupLastSeen", { time: ago(group.lastSeenAt) })}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs font-semibold text-white/70">
                  {t("groupCount", { count: group.count })}
                </span>
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
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

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
    <section id="system-event-log" className="scroll-mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-white/80">{t("eventsTitle")}</h3>
        <Segmented
          className="w-full sm:w-64"
          value={level}
          onChange={setLevel}
          items={[
            { id: "all", label: t("filterAll") },
            { id: "error", label: t("filterErrors") },
            { id: "warn", label: t("filterWarnings") },
          ]}
        />
      </header>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <select
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
          aria-label={t("allSources")}
        >
          <option value="">{t("allSources")}</option>
          {SYSTEM_EVENT_SOURCES.map((s) => <option key={s} value={s}>{sourceLabel(t, s)}</option>)}
        </select>
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <Search className="h-4 w-4 text-white/40" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
          />
        </label>
      </div>
      {(fingerprint || runId) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {fingerprint && (
            <button type="button" onClick={onClearFingerprint} className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
              {t("clearFilter")} ✕
            </button>
          )}
          {runId && (
            <button type="button" onClick={onClearRun} className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
              {t("filterRun", { id: runId })} ✕
            </button>
          )}
        </div>
      )}

      {events.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("eventsEmpty")}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {rows.map((event) => (
            <li key={event.id}>
              <Link
                href={`/admin/health/events/${event.id}`}
                className="flex w-full items-start gap-2 rounded-lg py-2.5 text-left hover:bg-white/[0.02]"
                data-testid="system-event-row"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.level === "error" ? "bg-red-400" : "bg-amber-400"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm text-white/85">{event.message}</span>
                  <span className="text-xs text-white/40">
                    {sourceLabel(t, event.source)} · {ago(event.createdAt)} · {new Date(event.createdAt).toLocaleString()}
                    {event.repName ? ` · ${event.repName}` : ""}
                  </span>
                </span>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {events.hasNextPage && (
        <button
          type="button"
          onClick={() => void events.fetchNextPage()}
          disabled={events.isFetchingNextPage}
          className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-2 text-sm text-white/70 hover:bg-white/10"
        >
          {events.isFetchingNextPage ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("loadMore")}
        </button>
      )}
    </section>
  );
}
