import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Clock, FileText, History, Search } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { PaneBar } from "@/components/xpot/MasterDetail";
import { BackLink } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { getHttpStatus } from "@/lib/pwa";
import { formatDateTime } from "@/lib/dates";
import { useT } from "@/i18n";
import { systemHealthMessages } from "@/i18n/messages/systemHealth";
import { platformAdminMessages } from "@/i18n/messages/platformAdmin";
import type { SystemEventDetail } from "@shared/system-health";
import { Card, formatDuration, RunStatusChip, sourceLabel, useAgo } from "./systemHealthUi";
import { eventScreenPath } from "./platform/servicesUi";

/** Context values the panel can show as plain text; nested ones keep their JSON. */
function contextValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * Admin › Status › one event: in plain words first (what, how often, who, where), then the details.
 * In the event log's side pane (`onClose`, a computer) it is one column with "Open full page" and
 * Close on top, and another occurrence opens in the pane (`onOpen`) rather than on its own page.
 */
export function AdminSystemEventDetail({ id, onClose, onOpen }: { id: number; onClose?: () => void; onOpen?: (id: number) => void }) {
  const t = useT(systemHealthMessages);
  const tp = useT(platformAdminMessages);
  const ago = useAgo(t);
  const query = useQuery<SystemEventDetail>({ queryKey: [`/api/xpot/admin/system-events/${id}`], retry: false });
  const pane = Boolean(onClose);

  const back = onClose
    ? <PaneBar fullHref={`/admin/health/events/${id}`} onClose={onClose} testId="system-event-pane" />
    : <BackLink href="/admin/health">{t("backToHealth")}</BackLink>;

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        {back}
        <ListSkeleton rows={3} rowClassName="h-28 rounded-2xl" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        {back}
        {getHttpStatus(query.error) === 404 ? (
          <EmptyState icon={Search} title={t("eventNotFound")} />
        ) : (
          <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />
        )}
      </div>
    );
  }

  const { event, group, occurrences, run } = query.data;
  const isError = event.level === "error";
  const contextEntries = Object.entries(event.context).filter(([key]) => key !== "componentStack");
  const componentStack = typeof event.context.componentStack === "string" ? event.context.componentStack : null;
  const screen = eventScreenPath(event.context.url);
  const summary = [
    group.count > 1
      ? tp("summaryMany", { count: group.count, first: ago(group.firstSeenAt), last: ago(group.lastSeenAt) })
      : tp("summaryOnce", { time: ago(event.createdAt) }),
    event.repName ? tp("summaryWho", { name: event.repName }) : null,
    screen ? tp("summaryWhere", { path: screen }) : null,
    run ? tp("summarySearch", { query: run.query, location: run.location }) : null,
  ].filter(Boolean).join(" ");

  return (
    <div className="space-y-4" data-testid="system-event-detail">
      {back}

      <section className={`rounded-2xl border p-4 ${isError ? "border-red-400/25 bg-red-500/[0.06]" : "border-amber-400/25 bg-amber-500/[0.06]"}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Pill tone={isError ? "red" : "amber"} bordered>
            {isError ? t("levelError") : t("levelWarn")}
          </Pill>
          <Pill tone="slate">{sourceLabel(t, event.source)}</Pill>
          <span className="text-white/45">#{event.id}</span>
        </div>
        <h2 className="mt-3 break-words text-lg font-semibold text-white">{event.message}</h2>
        <p className="mt-2 text-sm text-white/75" data-testid="system-event-summary">
          <span className="sr-only">{tp("summaryTitle")}: </span>
          {summary}
        </p>
        <p className="mt-1 text-xs text-white/45">{formatDateTime(event.createdAt)}</p>
      </section>

      <div className={`grid gap-4 ${pane ? "" : "lg:grid-cols-3"}`}>
        <Card title={t("detailFrequency")} icon={History}>
          <p className="text-2xl font-bold tabular-nums">{t("groupCount", { count: group.count })}</p>
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
                  onClick={(e) => {
                    // In the pane another occurrence replaces this one; a new-tab click still opens its page.
                    if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    onOpen(item.id);
                  }}
                  aria-current={item.id === event.id ? "true" : undefined}
                  className={`flex min-h-9 items-center justify-between gap-2 rounded-lg px-2 py-1 ${item.id === event.id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5"}`}
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
      <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.025]" data-testid="system-event-technical">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-white/70 marker:content-none">
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
                <p className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{t("detailComponentStack")}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 text-[11px] leading-5 text-white/65">{componentStack}</pre>
              </>
            )}
          </Card>

          <p className="text-xs text-white/40">
            {t("fingerprint")}: <span className="font-mono">{event.fingerprint}</span>
          </p>
        </div>
      </details>

      {!pane && (
        <p className="text-center text-xs text-white/35">
          <Link href="/admin/health" className="hover:text-white/60">{t("backToHealth")}</Link>
        </p>
      )}
    </div>
  );
}
