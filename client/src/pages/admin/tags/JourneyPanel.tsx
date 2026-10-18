import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Archive, Bot, Check, ChevronRight, ClipboardList, Cog, History, Layers, Plus, User } from "lucide-react";
import { ListPager } from "@/components/xpot/pagination";
import { JOURNEY_PRODUCTION_ACTIONS, isClosedPlanStatus } from "@shared/tagJourney";
import type { TagJourneyEntryItem, TagPlanItem } from "@shared/tagsApi";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { PILL_DOTS, toneOf, JOURNEY_KIND_TONE } from "@/components/xpot/StatusPill";
import { adminTagsUiMessages } from "@/i18n/messages/adminTagsUi";
import { errorMessage, formatDate, formatDateTime, formatTime, invalidateAdminTags, sendJson } from "./api";
import { Loading } from "./pieces-shared";
import { groupJourneyRows } from "./journey-group";
import { NewEntryDialog, NewPlanDialog, PlanStatusDialog } from "./JourneyForms";
import {
  EntryStatusBadge,
  JOURNEY_PAGE,
  KindBadge,
  PlanStatusBadge,
  useIsTagAdmin,
  useJourney,
  useJourneyLabels,
  type JourneyFilters,
  type JourneyScope,
} from "./journey-shared";

// The Journey timeline and plans of a scope (a batch, a piece, or everything).
// Admin only: for anyone else the panel renders nothing and sends no request.

const TAGS_BASE = "/admin/tags";
const SMALL_BTN =
  "inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40";
/**
 * Archiving is occasional: on a mouse it shows on hover or keyboard focus, not on every row; on touch
 * (no hover) it is always visible, since there is nothing to hover.
 */
const HOVER_REVEAL =
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100";
const LINK = "font-mono hover:text-white hover:underline";

/** Who did it: the AI session (MCP), a person (rep name, else email) or the system. */
function ActorLabel({ entry }: { entry: TagJourneyEntryItem }) {
  const t = useT(manageTagsMessages);
  const Icon = entry.actor === "ai" ? Bot : entry.actor === "human" ? User : Cog;
  const who = entry.actor === "ai" ? t("actorAi") : entry.actor === "human" ? entry.actorName ?? entry.actorEmail ?? t("actorAdmin") : t("actorSystem");
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3 w-3 shrink-0" />
      {who}
      {entry.source === "field" ? ` ${t("fromApp")}` : ""}
    </span>
  );
}

/** "destinationUrl" → "destination url", "pause_z" → "pause z". */
function humanKey(key: string): string {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** Metadata (files, minutes, codes, checks): folded away until asked for. */
function MetadataDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useT(manageTagsMessages);
  const [open, setOpen] = useState(false);
  const items = Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (items.length === 0) return null;
  return (
    <div className="pt-0.5">
      <button type="button" className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/70" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        {open ? t("journeyHideDetails") : t("journeyDetails", { count: items.length })}
      </button>
      {open ? (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
          {items.slice(0, 20).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-white/40">{humanKey(k)}</dt>
              <dd className="min-w-0 break-all font-mono text-white/70">{Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/** Timeline dot: the entry's kind at a glance (a decision, a risk, a result...), in the kind's tone. */
const kindDot = (kind: string) => PILL_DOTS[toneOf(JOURNEY_KIND_TONE, kind)];

/** Production steps get a label of their own; system actions repeat what the title says. */
const LABELLED_ACTIONS = new Set<string>(JOURNEY_PRODUCTION_ACTIONS);

function EntryRow({ entry, showScope }: { entry: TagJourneyEntryItem; showScope: boolean }) {
  const t = useT(manageTagsMessages);
  const tt = useT(tagsMessages);
  const labels = useJourneyLabels();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const review = useMutation({
    mutationFn: (status: string) => sendJson("PATCH", `/api/xpot/admin/tag-journey/${entry.id}`, { status }),
    onSuccess: () => void invalidateAdminTags(),
    onError: (err) => toast({ title: t("couldNotUpdateEntry"), description: errorMessage(err), variant: "destructive" }),
  });
  const dimmed = entry.status === "archived" || entry.status === "superseded";
  // A piece's status change reads as the status names people see (Available → Live).
  const isStatusChange = !!entry.action?.startsWith("tag_");
  const value = (v: string) => {
    if (!isStatusChange) return v;
    const key = `status_${v}`;
    const label = tt(key as never);
    return label === key ? v : label;
  };
  const actorName = entry.actor === "human" ? entry.actorName ?? entry.actorEmail : null;
  const labelledAction = entry.action && LABELLED_ACTIONS.has(entry.action) ? entry.action : null;
  return (
    <li className={`group relative min-w-0 space-y-1 py-3 pl-5 ${dimmed ? "opacity-60" : ""}`} data-testid="journey-entry">
      <span className={`absolute -left-[4.5px] top-[1.15rem] h-2 w-2 rounded-full ${kindDot(entry.kind)}`} aria-hidden />
      {/* Only what is not routine: execution and "active" are the norm, so they stay quiet. */}
      {(entry.kind !== "execution" || labelledAction || entry.status !== "active") && (
        <div className="flex flex-wrap items-center gap-2">
          {entry.kind !== "execution" && <KindBadge kind={entry.kind} />}
          {labelledAction && <span className="text-xs font-medium text-white/55">{labels.action(labelledAction)}</span>}
          {entry.status !== "active" && <EntryStatusBadge status={entry.status} />}
        </div>
      )}
      <p className="break-words font-medium text-white">{entry.title}</p>
      {(entry.beforeValue || entry.afterValue) && (
        <p className="break-all text-sm">
          {entry.beforeValue && (
            <>
              <span className="text-white/40">{value(entry.beforeValue)}</span>
              <span className="mx-1 text-white/30">→</span>
            </>
          )}
          <span className="text-white/80">{entry.afterValue ? value(entry.afterValue) : t("valueNone")}</span>
        </p>
      )}
      {entry.content && <p className="whitespace-pre-wrap break-words text-sm text-white/55">{entry.content}</p>}
      <MetadataDetails metadata={entry.metadata} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
        <span title={formatDateTime(entry.occurredAt)}>{formatTime(entry.occurredAt)}</span>
        <ActorLabel entry={entry} />
        {showScope && entry.batchCode && (
          <button type="button" className={LINK} onClick={() => entry.batchId && setLocation(`${TAGS_BASE}/batches/${entry.batchId}`)}>
            {entry.batchCode}
          </button>
        )}
        {showScope && entry.publicCode && (
          <button type="button" className={LINK} onClick={() => entry.tagId && setLocation(`${TAGS_BASE}/pieces/${entry.tagId}`)}>
            {entry.publicCode}
            {entry.serialNumber ? ` #${entry.serialNumber}` : ""}
          </button>
        )}
        {entry.kitId && <span className="font-mono">{t("kitShort", { id: entry.kitId.slice(0, 8) })}</span>}
        {entry.repName && entry.repName !== actorName && <span>{entry.repName}</span>}
        {entry.leadName && <span className="text-white/60">{entry.leadName}</span>}
        {entry.planTitle && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <ClipboardList className="h-3 w-3 shrink-0" />
            <span className="truncate">{entry.planTitle}</span>
          </span>
        )}
        <span className="ml-auto flex gap-1">
          {entry.status === "needs_review" && (
            <button type="button" className={SMALL_BTN} onClick={() => review.mutate("active")} disabled={review.isPending} data-testid="journey-entry-approve">
              <Check className="h-3 w-3" />
              {t("approve")}
            </button>
          )}
          {!dimmed && (
            <button
              type="button"
              className={`${SMALL_BTN} ${HOVER_REVEAL}`}
              onClick={() => review.mutate("archived")}
              disabled={review.isPending}
              data-testid="journey-entry-archive"
            >
              <Archive className="h-3 w-3" />
              {t("archive")}
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

/** A run of the same automatic entry ("24 similar entries"), folded until opened. */
function EntryGroup({ entries, showScope }: { entries: TagJourneyEntryItem[]; showScope: boolean }) {
  const t = useT(adminTagsUiMessages);
  const [open, setOpen] = useState(false);
  const newest = entries[0];
  const oldest = entries[entries.length - 1];
  if (open) {
    return (
      <>
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} showScope={showScope} />
        ))}
        <li className="py-2 pl-5">
          <button type="button" className={SMALL_BTN} onClick={() => setOpen(false)} aria-expanded>
            <ChevronRight className="h-3 w-3 -rotate-90" />
            {t("journeyGroupHide")}
          </button>
        </li>
      </>
    );
  }
  return (
    <li className="relative min-w-0 space-y-1 py-3 pl-5" data-testid="journey-entry-group">
      <span className={`absolute -left-[4.5px] top-[1.15rem] h-2 w-2 rounded-full ${kindDot(newest.kind)}`} aria-hidden />
      <p className="flex items-center gap-1.5 text-xs font-medium text-white/55">
        <Layers className="h-3 w-3" aria-hidden="true" />
        {t("journeyGroup", { count: entries.length })}
      </p>
      <p className="break-words font-medium text-white">{newest.title}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
        <span>
          {formatTime(oldest.occurredAt)} – {formatTime(newest.occurredAt)}
        </span>
        <ActorLabel entry={newest} />
        <span className="ml-auto">
          <button type="button" className={SMALL_BTN} onClick={() => setOpen(true)} aria-expanded={false} data-testid="journey-entry-group-open">
            <ChevronRight className="h-3 w-3 rotate-90" />
            {t("journeyGroupShow")}
          </button>
        </span>
      </div>
    </li>
  );
}

function PlanList({ plans, onOpen }: { plans: TagPlanItem[]; onOpen: (plan: TagPlanItem) => void }) {
  const t = useT(manageTagsMessages);
  const labels = useJourneyLabels();
  if (plans.length === 0) return <EmptyState compact dense tone="tags" icon={ClipboardList} title={t("noPlans")} cardStyle={{}} />;
  return (
    <ul className="divide-y divide-white/5">
      {plans.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onOpen(p)}
            className={`w-full min-w-0 space-y-1 py-2.5 text-left transition-colors hover:bg-white/[0.03] ${isClosedPlanStatus(p.status) ? "opacity-70" : ""}`}
            data-testid="journey-plan"
          >
            <div className="flex flex-wrap items-center gap-2">
              <PlanStatusBadge status={p.status} />
              <span className="text-xs text-white/45">{labels.planKind(p.kind)}</span>
              {p.dueDate && <span className="text-xs text-white/45">{t("planDue", { date: formatDate(`${p.dueDate}T12:00:00`) })}</span>}
            </div>
            <p className="break-words text-sm font-medium text-white">{p.title}</p>
            {p.outcome && <p className="break-words text-xs text-white/50">{p.outcome}</p>}
            {(p.batchCode || p.publicCode || p.leadName) && (
              <p className="break-words font-mono text-[11px] text-white/40">{[p.batchCode, p.publicCode, p.leadName].filter(Boolean).join(" · ")}</p>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Day headings over a newest-first list. */
function groupByDay(entries: TagJourneyEntryItem[]) {
  const groups: Array<{ day: string; entries: TagJourneyEntryItem[] }> = [];
  for (const e of entries) {
    const day = formatDate(e.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }
  return groups;
}

/**
 * The journey of one scope (a batch, a piece, or everything): the timeline on
 * the left, the plans on the right, and buttons to add to both. `scope` is
 * where new entries and plans are attached; filters narrow what is listed.
 */
export function JourneyPanel(props: { scope: JourneyScope; filters?: Omit<JourneyFilters, keyof JourneyScope>; title?: string; search?: string }) {
  // The gate lives here so a manager never mounts the query below.
  const isAdmin = useIsTagAdmin();
  if (!isAdmin) return null;
  return <JourneyPanelBody {...props} />;
}

function JourneyPanelBody({ scope, filters, title, search = "" }: { scope: JourneyScope; filters?: Omit<JourneyFilters, keyof JourneyScope>; title?: string; search?: string }) {
  const t = useT(manageTagsMessages);
  const ts = useT(shellMessages);
  const [entryOpen, setEntryOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<TagPlanItem | null>(null);
  const { data, isLoading, isError, error, refetch, hasMore, loadingMore, loadMore } = useJourney({ ...scope, ...filters }, true);
  const scopeLabel = scope.tagId ? ("piece" as const) : scope.batchId ? ("batch" as const) : undefined;
  const repFiltered = filters?.repId != null;
  // Search runs over what is loaded: titles, notes, codes, customers, reps.
  const query = search.trim().toLowerCase();
  const entries = (data?.entries ?? []).filter((e) =>
    !query ||
    [e.title, e.content, e.publicCode, e.batchCode, e.leadName, e.repName, e.action, e.beforeValue, e.afterValue]
      .some((v) => v?.toLowerCase().includes(query)),
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="admin-tags-journey">
      <SectionCard
        accent="tags"
        icon={History}
        title={title ?? ts("manageJourney")}
        className="min-w-0"
        actions={
          <Button type="button" variant="secondary" size="sm" className="min-h-10" onClick={() => setEntryOpen(true)} data-testid="journey-record">
            <Plus className="h-3.5 w-3.5" />
            {t("journeyRecord")}
          </Button>
        }
      >
        {isLoading ? (
          <Loading rows={4} />
        ) : isError ? (
          <ErrorState compact title={t("journeyLoadError")} message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : !data || data.entries.length === 0 ? (
          <EmptyState compact tone="tags" icon={History} title={t("journeyEmpty")} cardStyle={{}} />
        ) : entries.length === 0 ? (
          <EmptyState compact tone="tags" icon={History} title={t("journeyNoMatch")} cardStyle={{}} />
        ) : (
          <div className="space-y-3">
            {groupByDay(entries).map((g) => (
              <div key={g.day}>
                <p className="py-1 text-xs font-semibold uppercase tracking-wider text-white/40">{g.day}</p>
                <ul className="ml-[3px] divide-y divide-white/5 border-l border-white/10">
                  {groupJourneyRows(g.entries).map((row) =>
                    row.type === "group" ? (
                      <EntryGroup key={row.key} entries={row.entries} showScope={!scope.tagId} />
                    ) : (
                      <EntryRow key={row.entry.id} entry={row.entry} showScope={!scope.tagId} />
                    ),
                  )}
                </ul>
              </div>
            ))}
            <ListPager shown={data.entries.length} hasMore={hasMore} onMore={loadMore} loading={loadingMore} pageSize={JOURNEY_PAGE} />
          </div>
        )}
      </SectionCard>

      <SectionCard
        accent="tags"
        icon={ClipboardList}
        title={t("plans")}
        className="h-fit min-w-0"
        bodyClassName="px-4 py-2"
        actions={
          <Button type="button" variant="secondary" size="sm" className="min-h-10" onClick={() => setPlanOpen(true)} data-testid="journey-new-plan">
            <Plus className="h-3.5 w-3.5" />
            {t("newPlanButton")}
          </Button>
        }
      >
        {isLoading ? <Loading rows={2} /> : <PlanList plans={data?.plans ?? []} onOpen={setPlan} />}
        {repFiltered && <p className="mt-2 text-[11px] text-white/40">{t("plansHiddenRep")}</p>}
        {scopeLabel && <p className="my-2 text-[11px] text-white/40">{t(scopeLabel === "piece" ? "attachedPanelPiece" : "attachedPanelBatch")}</p>}
      </SectionCard>

      <NewEntryDialog open={entryOpen} onOpenChange={setEntryOpen} scope={scope} scopeLabel={scopeLabel} />
      <NewPlanDialog open={planOpen} onOpenChange={setPlanOpen} scope={scope} scopeLabel={scopeLabel} />
      <PlanStatusDialog plan={plan} onClose={() => setPlan(null)} />
    </div>
  );
}
