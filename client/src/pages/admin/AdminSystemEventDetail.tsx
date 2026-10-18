import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, Clock, FileText, History, Search } from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { getHttpStatus } from "@/lib/pwa";
import { formatDateTime } from "@/lib/dates";
import { useT } from "@/i18n";
import { systemHealthMessages } from "@/i18n/messages/systemHealth";
import type { SystemEventDetail } from "@shared/system-health";
import { Card, formatDuration, RunStatusChip, sourceLabel, useAgo } from "./systemHealthUi";

/** Context values the panel can show as plain text; nested ones keep their JSON. */
function contextValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Admin › System health › one event: what happened, how often, where, and the search it hit. */
export function AdminSystemEventDetail({ id }: { id: number }) {
  const t = useT(systemHealthMessages);
  const ago = useAgo(t);
  const query = useQuery<SystemEventDetail>({ queryKey: [`/api/xpot/admin/system-events/${id}`], retry: false });

  const back = (
    <Link href="/admin/health" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
      <ArrowLeft className="h-4 w-4" />
      {t("backToHealth")}
    </Link>
  );

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        {back}
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        {back}
        <p className="text-sm text-red-400">{getHttpStatus(query.error) === 404 ? t("eventNotFound") : t("loadFailed")}</p>
      </div>
    );
  }

  const { event, group, occurrences, run } = query.data;
  const isError = event.level === "error";
  const contextEntries = Object.entries(event.context).filter(([key]) => key !== "componentStack");
  const componentStack = typeof event.context.componentStack === "string" ? event.context.componentStack : null;

  return (
    <div className="space-y-4" data-testid="system-event-detail">
      {back}

      <section className={`rounded-2xl border p-4 ${isError ? "border-red-500/25 bg-red-500/[0.06]" : "border-amber-500/25 bg-amber-500/[0.06]"}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full border px-2 py-0.5 font-semibold ${isError ? "border-red-500/30 bg-red-500/15 text-red-300" : "border-amber-500/30 bg-amber-500/15 text-amber-300"}`}>
            {isError ? t("levelError") : t("levelWarn")}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">{sourceLabel(t, event.source)}</span>
          <span className="text-white/45">#{event.id}</span>
        </div>
        <h2 className="mt-3 break-words text-lg font-semibold text-white">{event.message}</h2>
        <p className="mt-2 text-xs text-white/50">
          {formatDateTime(event.createdAt)} · {ago(event.createdAt)}
          {event.repName ? ` · ${t("rep")}: ${event.repName}` : ""}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("detailFrequency")} icon={History}>
          <p className="text-2xl font-bold">{t("groupCount", { count: group.count })}</p>
          <p className="mt-1 text-xs text-white/50">{t("detailFirstSeen", { time: ago(group.firstSeenAt) })}</p>
          <p className="text-xs text-white/50">{t("detailLastSeen", { time: ago(group.lastSeenAt) })}</p>
        </Card>

        <Card title={t("detailSearch")} icon={Search} right={run ? <RunStatusChip status={run.status} t={t} /> : undefined}>
          {run ? (
            <div className="text-sm">
              <p className="font-semibold">{run.query} · {run.location}</p>
              <p className="text-xs text-white/45">
                {t("runJob", { id: run.jobId })} · #{run.runId}{run.repName ? ` · ${run.repName}` : ""}
              </p>
              <p className="mt-2 text-xs text-white/55">
                {t("runDuration")}: {formatDuration(run.durationMs)} · {t("runResults")}: {run.resultCount}
              </p>
              {run.errorMessage && <p className="mt-1 break-words text-xs text-red-300">{run.errorMessage}</p>}
            </div>
          ) : (
            <p className="text-sm text-white/45">{t("detailNoSearch")}</p>
          )}
        </Card>

        <Card title={t("detailOccurrences")} icon={Clock}>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {occurrences.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/admin/health/events/${item.id}`}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 ${item.id === event.id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5"}`}
                >
                  <span>{formatDateTime(item.createdAt)}</span>
                  <span className="text-white/40">
                    {item.repeats ? `+${item.repeats}` : ""}{item.repName ? ` ${item.repName}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* For whoever debugs it: the raw context, the stack and the fingerprint, folded away. */}
      <details className="group rounded-2xl border border-white/10 bg-white/[0.02]" data-testid="system-event-technical">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-white/70 marker:content-none">
          {t("technicalDetails")}
          <span className="text-lg font-light text-white/35 transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-4 border-t border-white/[0.07] p-4">
          <Card title={t("context")} icon={FileText}>
            {contextEntries.length === 0 ? (
              <p className="text-sm text-white/45">{t("detailNoContext")}</p>
            ) : (
              <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
                {contextEntries.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="truncate font-mono text-white/45">{key}</dt>
                    <dd className="break-all font-mono text-white/80">{contextValue(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card title={t("detail")} icon={AlertTriangle}>
            {event.detail ? (
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 text-[11px] leading-5 text-white/75">{event.detail}</pre>
            ) : (
              <p className="text-sm text-white/45">{t("detailNoStack")}</p>
            )}
            {componentStack && (
              <>
                <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/40">{t("detailComponentStack")}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 text-[11px] leading-5 text-white/65">{componentStack}</pre>
              </>
            )}
          </Card>

          <p className="text-xs text-white/40">
            {t("fingerprint")}: <span className="font-mono">{event.fingerprint}</span>
          </p>
        </div>
      </details>

      <p className="text-center text-xs text-white/35">
        <Link href={`/admin/health`} className="hover:text-white/60">{t("backToHealth")}</Link>
      </p>
    </div>
  );
}
