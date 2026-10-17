import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ChevronDown, ChevronRight, Cpu, ListOrdered, RefreshCw, Search } from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { Segmented } from "@/components/xpot/Segmented";
import { apiRequest } from "@/lib/queryClient";
import { useT, type Translate } from "@/i18n";
import { systemHealthMessages } from "@/i18n/messages/systemHealth";
import { SYSTEM_EVENT_SOURCES } from "@shared/schema/observability";
import type { EventGroup, HealthVerdict, SystemEventRow, SystemHealthSnapshot } from "@shared/system-health";

type T = Translate<typeof systemHealthMessages.en>;

const REFRESH_MS = 15_000;

const VERDICT_STYLE: Record<HealthVerdict, { chip: string; dot: string; banner: string }> = {
  healthy: { chip: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400", banner: "border-emerald-500/25 bg-emerald-500/[0.07]" },
  idle: { chip: "border-white/10 bg-white/5 text-white/50", dot: "bg-white/40", banner: "border-white/10 bg-white/[0.03]" },
  slow: { chip: "border-amber-500/30 bg-amber-500/15 text-amber-300", dot: "bg-amber-400", banner: "border-amber-500/25 bg-amber-500/[0.07]" },
  stalled: { chip: "border-red-500/30 bg-red-500/15 text-red-300", dot: "bg-red-400", banner: "border-red-500/25 bg-red-500/[0.07]" },
  down: { chip: "border-red-500/40 bg-red-500/20 text-red-200", dot: "bg-red-500", banner: "border-red-500/30 bg-red-500/[0.1]" },
};

function useAgo(t: T) {
  return (value: string | null) => {
    if (!value) return t("never");
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 5) return t("justNow");
    if (seconds < 60) return t("secondsAgo", { n: seconds });
    if (seconds < 3600) return t("minutesAgo", { n: Math.floor(seconds / 60) });
    if (seconds < 86_400) return t("hoursAgo", { n: Math.floor(seconds / 3600) });
    return t("daysAgo", { n: Math.floor(seconds / 86_400) });
  };
}

export function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function sourceLabel(t: T, source: string) {
  const key = `source_${source}` as keyof typeof systemHealthMessages.en;
  return key in systemHealthMessages.en ? t(key) : source;
}

function VerdictChip({ verdict, t }: { verdict: HealthVerdict; t: T }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[verdict].chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${VERDICT_STYLE[verdict].dot}`} />
      {t(`verdict_${verdict}`)}
    </span>
  );
}

function Card({ title, icon: Icon, right, children }: { title: string; icon: typeof Activity; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80">
          <Icon className="h-4 w-4 text-white/45" />
          {title}
        </h3>
        {right}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div>
      <p className="text-[11px] text-white/45">{label}</p>
      <p className={`text-xl font-bold ${tone === "bad" ? "text-red-300" : tone === "warn" ? "text-amber-300" : ""}`}>{value}</p>
    </div>
  );
}

export function AdminSystemHealth() {
  const t = useT(systemHealthMessages);
  const ago = useAgo(t);
  const [, setNow] = useState(0);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
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

      <ProblemGroups groups={events.groups} t={t} ago={ago} onPick={setFingerprint} />
      <EventLog t={t} ago={ago} fingerprint={fingerprint} onClearFingerprint={() => setFingerprint(null)} />
    </div>
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

function EventLog({ t, ago, fingerprint, onClearFingerprint }: {
  t: T;
  ago: (v: string | null) => string;
  fingerprint: string | null;
  onClearFingerprint: () => void;
}) {
  const [level, setLevel] = useState<"all" | "error" | "warn">("all");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const params = new URLSearchParams();
  if (level !== "all") params.set("level", level);
  if (source) params.set("source", source);
  if (q) params.set("q", q);
  if (fingerprint) params.set("fingerprint", fingerprint);
  const base = `/api/xpot/admin/system-events?${params.toString()}`;
  const events = useInfiniteQuery({
    queryKey: ["/api/xpot/admin/system-events", level, source, q, fingerprint],
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
      {fingerprint && (
        <button type="button" onClick={onClearFingerprint} className="mb-3 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
          {t("clearFilter")} ✕
        </button>
      )}

      {events.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("eventsEmpty")}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {rows.map((event) => {
            const expanded = open === event.id;
            const Chevron = expanded ? ChevronDown : ChevronRight;
            return (
              <li key={event.id}>
                <button type="button" onClick={() => setOpen(expanded ? null : event.id)} className="flex w-full items-start gap-2 py-2.5 text-left">
                  <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-white/35" />
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.level === "error" ? "bg-red-400" : "bg-amber-400"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm text-white/85">{event.message}</span>
                    <span className="text-xs text-white/40">
                      {sourceLabel(t, event.source)} · {ago(event.createdAt)} · {new Date(event.createdAt).toLocaleString()}
                      {event.repName ? ` · ${event.repName}` : ""}
                    </span>
                  </span>
                </button>
                {expanded && (
                  <div className="mb-3 ml-8 space-y-2">
                    {Object.keys(event.context).length > 0 && (
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">{t("context")}</p>
                        <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 text-[11px] text-white/70">{JSON.stringify(event.context, null, 2)}</pre>
                      </div>
                    )}
                    {event.detail && (
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">{t("detail")}</p>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2 text-[11px] text-white/70">{event.detail}</pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
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
