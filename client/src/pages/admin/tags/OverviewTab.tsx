import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  ClipboardCheck,
  Inbox,
  Layers,
  ListTodo,
  Nfc,
  Package,
  PackageX,
  Radio,
  ScanLine,
  ShoppingBag,
  Truck,
  UserRound,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { TagListItem, TagOverview } from "@shared/tagsApi";
import type { TagPieceQueue } from "@shared/tagQueues";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { useReasonText } from "@/components/piece/reasonText";
import { KpiTile, SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { FilterBar, FilterChips, FilterSelect } from "@/components/xpot/filters";
import { BackLink } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { ADMIN_TAGS_KEY, formatShare, getJson, STALE_MS, withQuery } from "./api";
import { formatDate } from "@/lib/format";
import { Loading, LoadError, useBatchOptions, useLeads, useReps } from "./pieces-shared";
import { useTagLabels } from "./labels";
import { PieceTable } from "./piece-table";
import { AnalyticsPanel, RangePicker, useDeviceLabel, type AnalyticsRange } from "./pieces-analytics";
import {
  ACTIVITY_FILTERS,
  activityFeed,
  needsActionQueues,
  pieceQueueCard,
  stockFunnel,
  type ActivityFilter,
  type FunnelStepId,
  type QueueId,
} from "./overview-model";

type Go = (path: string) => void;

/** A row of the feed: the piece on the left, a date (and chips) on the right. Never wider than the screen. */
const FEED_ROW = "flex w-full min-w-0 items-center gap-3 py-2 text-left transition-colors hover:bg-white/[0.03]";
const FEED_DATE = "shrink-0 whitespace-nowrap text-[11px] tabular-nums text-white/40";
/** "Oct 17, 8:38 PM": the feed is recent, and on a phone the year ("17 de out. de 2026, 20:38") left the details one letter. */
const feedDate = (at: string) => formatDate(at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const QUEUE_ICONS: Record<QueueId, LucideIcon> = {
  stuscleOrders: Inbox,
  batchesNotReceived: Truck,
  chipPending: Nfc,
  scannedNotLive: ScanLine,
  noProduct: PackageX,
};

const FUNNEL_ICONS: Record<FunnelStepId, LucideIcon> = {
  notReceived: Truck,
  house: Warehouse,
  withResellers: Users,
  sold: ShoppingBag,
  live: Radio,
};

/** Row 1: what needs someone now. Each count opens the list it counts. */
function NeedsAction({ overview, go }: { overview: TagOverview; go: Go }) {
  const t = useT(adminTagsFlowMessages);
  const isAdmin = useIsSuperAdmin();
  const cards = needsActionQueues(overview.queues, isAdmin);
  const open = cards.filter((c) => c.count > 0).length;
  return (
    <SectionCard accent="tags" icon={ListTodo} title={t("needsAction")} actions={<span className="text-xs text-white/40">{open ? t.plural("needsActionOpen", open) : t("needsActionClear")}</span>} testId="overview-needs-action">
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${cards.length > 4 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        {cards.map((card) => (
          <div key={card.id} className="grid" data-testid={`overview-queue-${card.id}`}>
            <KpiTile
              accent={card.count > 0 ? "amber" : "violet"}
              icon={QUEUE_ICONS[card.id]}
              label={t(card.labelKey)}
              value={card.count}
              detail={t(card.hintKey)}
              onClick={() => go(card.href)}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/** Row 2: the stock funnel, one shared stock number per step, each opening the pieces it counts. */
function StockFunnel({ overview, go }: { overview: TagOverview; go: Go }) {
  const t = useT(adminTagsFlowMessages);
  const steps = stockFunnel(overview.funnel);
  return (
    <SectionCard accent="tags" icon={Package} title={t("funnelTitle")} testId="overview-funnel">
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {steps.map((step, i) => (
          <li key={step.id} className="relative grid" data-testid={`overview-funnel-${step.id}`}>
            <KpiTile accent="violet" icon={FUNNEL_ICONS[step.id]} label={t(step.labelKey)} value={step.count} detail={t(step.hintKey)} onClick={() => go(step.href)} />
            {i < steps.length - 1 ? (
              <ChevronRight className="pointer-events-none absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-white/25 xl:block" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-white/40">{t("funnelFootnote")}</p>
    </SectionCard>
  );
}

/** Row 3: scans (kept from the old Overview). */
function Scans({ overview }: { overview: TagOverview }) {
  const t = useT(manageTagsMessages);
  const tf = useT(adminTagsFlowMessages);
  const { interactions, split30 } = overview;
  const split = split30.qr + split30.nfc;
  return (
    <SectionCard accent="tags" icon={ScanLine} title={t("scansTaps")}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile accent="violet" icon={ScanLine} label={t("ovToday")} value={interactions.today} detail={tf("localDay")} />
        <KpiTile accent="violet" icon={CalendarDays} label={t("ovLast7")} value={interactions.last7} />
        <KpiTile accent="violet" icon={CalendarRange} label={t("ovLast30")} value={interactions.last30} detail={`QR ${formatShare(split30.qr, split)} · NFC ${formatShare(split30.nfc, split)}`} />
        <KpiTile accent="violet" icon={UserRound} label={t("ovApproxUnique")} value={overview.approxUnique30} detail={t("ovApproxHint")} />
      </div>
      <p className="mt-3 text-xs text-white/40">{tf("scansFootnote")}</p>
    </SectionCard>
  );
}

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
  return (
    <SectionCard accent="tags" icon={BarChart3} title={tf("analyticsTitle")} actions={<RangePicker value={range} onChange={setRange} />} testId="overview-analytics">
      <div className="min-w-0 space-y-4">
        <FilterBar
          testId="admin-overview-analytics-filters"
          controls={
            <>
              <FilterSelect value={product} onChange={(next) => filters.set({ product: next })} placeholder={t("allProducts")} options={labels.productOptions} icon={Package} />
              <FilterSelect value={rep} onChange={(next) => filters.set({ rep: next })} placeholder={t("allResellers")} options={reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }))} icon={Users} />
              <FilterSelect value={lead} onChange={(next) => filters.set({ lead: next })} placeholder={t("allCustomers")} options={leads.map((l) => ({ value: String(l.id), label: l.name }))} icon={Building2} />
              <FilterSelect value={batch} onChange={(next) => filters.set({ batch: next })} placeholder={t("allBatches")} options={batches.map((b) => ({ value: b.id, label: b.batchCode }))} icon={Layers} />
            </>
          }
          summary={{ active: filters.activeCount() > 0, onClear: () => filters.reset() }}
        />
        <AnalyticsPanel scopeUrl="/api/xpot/admin/tags/analytics" scope={scope} range={range} showTopTags onOpenTag={(id) => go(`/pieces/${id}`)} />
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
  const items = activityFeed(overview, filter);
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
                    details={[labels.event(item.event.eventType), item.event.deviceType && deviceLabel(item.event.deviceType)].filter(Boolean).join(" · ")}
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
                  <TagPieceMention publicCode={item.change.publicCode} productType={item.change.productType} face={item.change.face} batchCode={item.change.batchCode} className="min-w-0 flex-1" />
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
    </SectionCard>
  );
}

/** /admin/tags/overview/<queue>: the pieces behind a "Needs action" count, by the same rule (GET /api/xpot/tags?queue=). */
export function OverviewQueue({ queue, go }: { queue: TagPieceQueue; go: Go }) {
  const t = useT(adminTagsFlowMessages);
  const card = pieceQueueCard(queue);
  const url = withQuery("/api/xpot/tags", { queue, limit: 2000 });
  const { data = [], isLoading, error, refetch } = useQuery<TagListItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "pieces", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });
  return (
    <div className="min-w-0 space-y-4" data-testid={`admin-tags-queue-${queue}`}>
      <BackLink onBack={() => go("/overview")}>{t("backToOverview")}</BackLink>
      <SectionCard accent="tags" icon={ClipboardCheck} title={`${t(card.labelKey)} (${isLoading ? "…" : data.length})`}>
        <p className="mb-3 text-xs text-white/50">{t(card.hintKey)}</p>
        {isLoading ? (
          <Loading rows={4} />
        ) : error ? (
          <LoadError what={t("thePieces")} error={error} onRetry={() => void refetch()} />
        ) : (
          <PieceTable
            pieces={data}
            onOpen={(id) => go(`/pieces/${id}`)}
            columns={queue === "chipPending" ? ["customer", "reseller", "chip"] : queue === "scannedNotLive" ? ["customer", "reseller", "lastInteraction"] : ["reseller", "batch"]}
            pageSize={50}
            empty={t("queueEmpty")}
          />
        )}
      </SectionCard>
    </div>
  );
}

/**
 * Overview: (1) what needs action, (2) the stock funnel (not received → house stock → with resellers → sold → live),
 * (3) scans, then the fleet analytics with the one Top pieces list, and one activity feed.
 */
export function OverviewTab({ go }: { go: Go }) {
  const t = useT(manageTagsMessages);
  const { data, isLoading, error, refetch } = useQuery<TagOverview>({
    queryKey: [ADMIN_TAGS_KEY, "overview"],
    queryFn: () => getJson(`/api/xpot/admin/tags/overview?timezoneOffset=${new Date().getTimezoneOffset()}`),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading rows={6} />;
  if (error || !data) return <LoadError what={t("whatOverview")} error={error} onRetry={() => void refetch()} />;

  return (
    <div className="min-w-0 space-y-4" data-testid="admin-tags-overview">
      <NeedsAction overview={data} go={go} />
      <StockFunnel overview={data} go={go} />
      <Scans overview={data} />
      <FleetAnalytics go={go} />
      <ActivityFeed overview={data} go={go} />
    </div>
  );
}
