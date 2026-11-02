import { useCallback, useState } from "react";
import { useLocation, useSearchParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Layers,
  Network,
  Package,
  ScanLine,
  SlidersHorizontal,
  UserRound,
  Users,
} from "lucide-react";
import type { TagListItem, TagOverview } from "@shared/tagsApi";
import type { TagPieceQueue } from "@shared/tagQueues";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { useReasonText } from "@/components/piece/reasonText";
import { KpiTile, SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { FilterBar, FilterChips, FilterSelect, FilterToggle } from "@/components/xpot/filters";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { BackLink } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useViewerAccess } from "@/lib/adminMode";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { commonMessages } from "@/i18n/messages/common";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { ADMIN_TAGS_KEY, formatShare, getJson, STALE_MS, withQuery } from "./api";
import { formatDate } from "@/lib/format";
import { Loading, LoadError, organizationFilterOptions, uniqueOptions, useBatchOptions, useLeads, useOrganizations, useReps } from "./pieces-shared";
import { PieceDetail } from "./PieceDetail";
import { useTagLabels } from "./labels";
import { PieceTable } from "./piece-table";
import { AnalyticsPanel, RangePicker, useDeviceLabel, type AnalyticsRange } from "./pieces-analytics";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_PREVIEW,
  activityFeed,
  pieceQueueCard,
  type ActivityFilter,
} from "./overview-model";

type Go = (path: string) => void;

/** A row of the feed: the piece on the left, a date (and chips) on the right. Never wider than the screen. */
const FEED_ROW = "flex w-full min-w-0 items-center gap-3 py-2 text-left transition-colors hover:bg-white/[0.03]";
const FEED_DATE = "shrink-0 whitespace-nowrap text-[11px] tabular-nums text-white/40";
/** "Oct 17, 8:38 PM": the feed is recent, and on a phone the year ("17 de out. de 2026, 20:38") left the details one letter. */
const feedDate = (at: string) => formatDate(at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The fleet analytics (moved from Resellers): range, scope, daily chart, devices and the one Top pieces list. */
function FleetAnalytics({ go }: { go: Go }) {
  const t = useT(manageTagsMessages);
  const tf = useT(adminTagsFlowMessages);
  const labels = useTagLabels();
  const [range, setRange] = useState<AnalyticsRange>({ preset: "30d" });
  // ?product=…&rep=…&lead=…&batch=… (same names as the Pieces filters).
  const filters = useUrlFilters({ product: "", rep: "", lead: "", batch: "" });
  const { product, rep, lead, batch } = filters.values;
  const { data: reps = [] } = useReps();
  const { data: leads = [] } = useLeads();
  const { data: batches = [] } = useBatchOptions();
  const scope = { productType: product || undefined, repId: rep || undefined, leadId: lead || undefined, batchId: batch || undefined };
  // The filters wait behind one button until one is in use, and a filter with one choice is not offered.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showFilters = filtersOpen || filters.activeCount() > 0;
  const resellerOptions = uniqueOptions(reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) })));
  const customerOptions = uniqueOptions(leads.map((l) => ({ value: String(l.id), label: l.name })));
  const batchOptions = uniqueOptions(batches.map((b) => ({ value: b.id, label: b.batchCode })));
  const choice = (selected: string, options: readonly unknown[]) => selected !== "" || options.length > 1;
  return (
    <SectionCard accent="tags" icon={BarChart3} title={tf("analyticsTitle")} actions={<RangePicker value={range} onChange={setRange} />} testId="overview-analytics">
      <div className="min-w-0 space-y-4">
        <FilterBar
          testId="admin-overview-analytics-filters"
          actions={<FilterToggle pressed={showFilters} onChange={setFiltersOpen} label={tf("filterButton")} icon={SlidersHorizontal} testId="overview-filters-toggle" />}
          controls={!showFilters ? undefined : (
            <>
              {choice(product, labels.productOptions) ? <FilterSelect value={product} onChange={(next) => filters.set({ product: next })} placeholder={t("allProducts")} options={labels.productOptions} icon={Package} /> : null}
              {choice(rep, resellerOptions) ? <FilterSelect value={rep} onChange={(next) => filters.set({ rep: next })} placeholder={t("allResellers")} options={resellerOptions} icon={Users} /> : null}
              {choice(lead, customerOptions) ? <FilterSelect value={lead} onChange={(next) => filters.set({ lead: next })} placeholder={t("allCustomers")} options={customerOptions} icon={Building2} /> : null}
              {choice(batch, batchOptions) ? <FilterSelect value={batch} onChange={(next) => filters.set({ batch: next })} placeholder={t("allBatches")} options={batchOptions} icon={Layers} /> : null}
            </>
          )}
          summary={{ active: filters.activeCount() > 0, onClear: () => filters.reset() }}
        />
        <AnalyticsPanel scopeUrl="/api/xpot/admin/tags/analytics" scope={scope} range={range} showTopTags onOpenTag={(id) => go(`/pieces/${id}`)} onOpenNotLive={() => go("/overview/scannedNotLive")} />
      </div>
    </SectionCard>
  );
}

const ACTIVITY_KEYS = { all: "activityAll", scans: "activityScans", activated: "activityActivated", destination: "activityDestination" } as const satisfies Record<ActivityFilter, string>;

/** One feed: latest scans, pieces put live and destination changes, with a filter. */
function ActivityFeed({ overview, go }: { overview: TagOverview; go: Go }) {
  const t = useT(manageTagsMessages);
  const tf = useT(adminTagsFlowMessages);
  const labels = useTagLabels();
  const reasonText = useReasonText();
  const deviceLabel = useDeviceLabel();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [all, setAll] = useState(false);
  const feed = activityFeed(overview, filter);
  const items = all ? feed : feed.slice(0, ACTIVITY_PREVIEW);
  return (
    <SectionCard
      accent="tags"
      icon={Activity}
      title={tf("activityTitle")}
      actions={<FilterChips items={ACTIVITY_FILTERS.map((id) => ({ id, label: tf(ACTIVITY_KEYS[id]) }))} value={filter} onChange={setFilter} ariaLabel={tf("activityTitle")} accent="tags" />}
      bodyClassName="px-4 py-2"
      testId="overview-activity"
    >
      {items.length === 0 ? (
        <EmptyState compact dense tone="tags" icon={Activity} title={tf("activityEmpty")} cardStyle={{}} />
      ) : (
        <ul className="divide-y divide-white/5 text-sm">
          {items.map((item) => (
            <li key={item.key} className="min-w-0">
              {item.kind === "scans" ? (
                <button type="button" className={FEED_ROW} onClick={() => go(`/pieces/${item.event.tagId}`)}>
                  <TagPieceMention
                    publicCode={item.event.publicCode}
                    productType={item.event.productType}
                    face={item.event.face}
                    batchCode={item.event.batchCode}
                    customer={item.event.leadName}
                    details={item.count > 1 ? tf.plural("activityScansN", item.count) : [labels.event(item.event.eventType), item.event.deviceType && deviceLabel(item.event.deviceType)].filter(Boolean).join(" · ")}
                    className="min-w-0 flex-1"
                  />
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone="slate" className="uppercase">{item.event.accessMethod}</Pill>
                    <span className={FEED_DATE}>{feedDate(item.at)}</span>
                  </span>
                </button>
              ) : item.kind === "activated" ? (
                <button type="button" className={FEED_ROW} onClick={() => go(`/pieces/${item.activation.id}`)}>
                  <TagPieceMention
                    publicCode={item.activation.publicCode}
                    productType={item.activation.productType}
                    face={item.activation.face}
                    batchCode={item.activation.batchCode}
                    customer={item.activation.leadName}
                    details={[tf("activityWentLive"), item.activation.repName].filter(Boolean).join(" · ")}
                    className="min-w-0 flex-1"
                  />
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone="green">{tf("activityLive")}</Pill>
                    <span className={FEED_DATE}>{feedDate(item.at)}</span>
                  </span>
                </button>
              ) : (
                <button type="button" className={`${FEED_ROW} flex-wrap`} onClick={() => go(`/pieces/${item.change.tagId}`)}>
                  <TagPieceMention publicCode={item.change.publicCode} productType={item.change.productType} face={item.change.face} batchCode={item.change.batchCode} customer={item.change.leadName} className="min-w-0 flex-1" />
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone="slate">{tf("activityDestinationPill")}</Pill>
                    <span className={FEED_DATE}>{feedDate(item.at)}</span>
                  </span>
                  {/* Its own line (a link needs the width on a phone), indented under the code, past the piece's picture. */}
                  <span className="block w-full min-w-0 truncate pl-12 text-xs text-white/40">
                    {item.change.newUrl
                      ? `${labels.destination(item.change.newDestinationType)} · ${item.change.newUrl}`
                      : item.change.reason
                        ? t("ovDestClearedReason", { reason: reasonText(item.change.reason) ?? "" })
                        : t("ovDestCleared")}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!all && feed.length > ACTIVITY_PREVIEW ? <button type="button" onClick={() => setAll(true)} className="mb-1 mt-1 min-h-10 w-full rounded-xl text-sm font-medium text-white/60 hover:bg-white/[0.04] hover:text-white" data-testid="activity-see-all">{tf("activitySeeAll", { count: feed.length })}</button> : null}
    </SectionCard>
  );
}

/** A queue's rows in the order they are worked: a chip write that failed first, it is the one somebody already tried. */
const byChipTrouble = (a: TagListItem, b: TagListItem) => Number(b.nfcStatus === "failed") - Number(a.nfcStatus === "failed");

/**
 * /admin/tags/overview/<queue>: the pieces behind a Today count, by the same rule (GET /api/xpot/tags?queue=). The
 * platform sees every organization's, which is what its Today counts, with the organization filter in view; a piece
 * opens in the pop-up over the list (a phone gets its page), so resolving seven chips never leaves the queue.
 */
export function OverviewQueue({ queue, go }: { queue: TagPieceQueue; go: Go }) {
  const t = useT(adminTagsFlowMessages);
  const tw = useT(workspacesMessages);
  const tg = useT(manageTagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  const card = pieceQueueCard(queue);
  const { canManage } = useViewerAccess();
  const { data: organizations = [] } = useOrganizations(canManage);
  const filters = useUrlFilters({ org: "" });
  const org = filters.values.org;
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const paneId = params.get("piece") || null;
  const setPane = useCallback(
    (id: string | null) => setParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("piece", id);
      else next.delete("piece");
      return next;
    }, { replace: !id || new URLSearchParams(window.location.search).has("piece") }),
    [setParams],
  );
  const url = withQuery("/api/xpot/tags", { queue, limit: 2000, organizationId: /^\d+$/.test(org) ? org : undefined });
  const { data = [], isLoading, error, refetch } = useQuery<TagListItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "pieces", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });
  const rows = queue === "chipPending" ? [...data].sort(byChipTrouble) : data;
  const open = (id: string) => (isDesktop ? setPane(id) : go(`/pieces/${id}?from=${queue}`));
  // A phone has no pop-up: a shared ?piece= link shows the piece's page.
  if (!isDesktop && paneId) return <PieceDetail id={paneId} go={go} />;
  const list = (
    <SectionCard
      accent="tags"
      icon={ClipboardCheck}
      title={`${t(card.labelKey)} (${isLoading ? "…" : data.length})`}
      actions={canManage ? (
        <FilterSelect value={org} onChange={(next) => filters.set({ org: next })} placeholder={tg("allOrganizations")} options={organizationFilterOptions(organizations, org, (id) => tg("organizationNumber", { id }))} icon={Network} testId="admin-queue-org" />
      ) : undefined}
    >
      <p className="mb-3 text-sm text-white/60">{t(card.actionKey)}</p>
      {isLoading ? (
        <Loading rows={4} />
      ) : error ? (
        <LoadError what={t("thePieces")} error={error} onRetry={() => void refetch()} />
      ) : (
        <PieceTable
          pieces={rows}
          onOpen={open}
          selectedId={paneId}
          columns={[...(canManage && !/^\d+$/.test(org) && organizations.length > 1 ? (["organization"] as const) : []), ...(queue === "chipPending" ? (["customer", "reseller", "chip"] as const) : queue === "scannedNotLive" ? (["customer", "reseller", "scanned"] as const) : (["reseller", "batch"] as const))]}
          pageSize={50}
          empty={t("queueEmpty")}
        />
      )}
    </SectionCard>
  );
  return (
    <div className="min-w-0 space-y-4" data-testid={`admin-tags-queue-${queue}`}>
      <BackLink onBack={() => navigate("/admin")}>{tw("todayTitle")}</BackLink>
      {isDesktop ? (
        <MasterDetail popup closeLabel={tc("close")} onClose={() => setPane(null)} list={list} detail={paneId ? <PieceDetail key={paneId} id={paneId} go={go} onClose={() => setPane(null)} /> : null} />
      ) : (
        list
      )}
    </div>
  );
}

/**
 * The Overview payload; the panel home reads the same cache for its "Today" rows. `organizationId`: that organization's
 * numbers only (the platform narrowing to its own company); an owner's or a partner's are already their organization's.
 */
export function useTagOverview(organizationId?: number) {
  return useQuery<TagOverview>({
    queryKey: organizationId ? [ADMIN_TAGS_KEY, "overview", { organizationId }] : [ADMIN_TAGS_KEY, "overview"],
    queryFn: () => getJson(`/api/xpot/admin/tags/overview?timezoneOffset=${new Date().getTimezoneOffset()}${organizationId ? `&organizationId=${organizationId}` : ""}`),
    staleTime: STALE_MS,
  });
}

/**
 * Overview: scans, then the fleet analytics with the one Top pieces list, and one activity feed. What needs action is
 * the panel home's "Today" list; the queue lists (/overview/<queue>) stay, since Today links to them. The stock
 * breakdown lives at the top of Inventory.
 */
export function OverviewTab({ go }: { go: Go }) {
  const t = useT(manageTagsMessages);
  const { data, isLoading, error, refetch } = useTagOverview();

  if (isLoading) return <Loading rows={6} />;
  if (error || !data) return <LoadError what={t("whatOverview")} error={error} onRetry={() => void refetch()} />;

  return (
    <div className="min-w-0 space-y-4" data-testid="admin-tags-overview">
      <FleetAnalytics go={go} />
      <ActivityFeed overview={data} go={go} />
    </div>
  );
}
