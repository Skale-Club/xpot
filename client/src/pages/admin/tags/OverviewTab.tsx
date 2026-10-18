import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  Ban,
  Boxes,
  CalendarDays,
  CalendarRange,
  History,
  Package,
  Power,
  PowerOff,
  Radio,
  ScanLine,
  Trophy,
  UserCheck,
  UserRound,
  Users,
  Warehouse,
} from "lucide-react";
import type { TagAnalytics, TagOverview } from "@shared/tagsApi";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { KpiTile, SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Pill } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { shellMessages } from "@/i18n/messages/shell";
import { ADMIN_TAGS_KEY, errorMessage, formatDateTime, formatShare, getJson, STALE_MS } from "./api";
import { Loading, LoadError, SectionLink } from "./pieces-shared";
import { useTagLabels } from "./labels";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";

/** A row of a feed: the piece on the left, a date (and chips) on the right. Never wider than the screen. */
const FEED_ROW = "flex w-full min-w-0 items-center gap-3 py-2 text-left transition-colors hover:bg-white/[0.03]";
const FEED_DATE = "shrink-0 whitespace-nowrap text-[11px] tabular-nums text-white/40";

/** Most scanned pieces in the last 30 days (from the fleet analytics). */
function TopPieces({ go }: { go: (path: string) => void }) {
  const t = useT(manageTagsMessages);
  const { data, isLoading, error, refetch } = useQuery<TagAnalytics>({
    queryKey: [ADMIN_TAGS_KEY, "analytics", "overview-top-30d"],
    queryFn: () => getJson("/api/xpot/admin/tags/analytics?range=30d"),
    staleTime: STALE_MS,
  });
  return (
    <SectionCard
      accent="tags"
      icon={Trophy}
      title={t("ovTopPieces")}
      actions={<SectionLink onClick={() => go("/team")}>{t("ovResellersReport")}</SectionLink>}
      bodyClassName="px-4 py-2"
    >
      {isLoading ? (
        <Loading rows={3} className="py-2" />
      ) : error || !data ? (
        <ErrorState compact title={t("ovTopPiecesError")} message={error ? errorMessage(error) : undefined} onRetry={() => void refetch()} />
      ) : data.topTags.length === 0 ? (
        <EmptyState compact dense tone="tags" icon={Trophy} title={t("ovNoScans30")} cardStyle={{}} />
      ) : (
        <ol className="divide-y divide-white/5">
          {data.topTags.slice(0, 8).map((p, i) => (
            <li key={p.id}>
              <button type="button" onClick={() => go(`/pieces/${p.id}`)} className={`${FEED_ROW} text-sm`}>
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/30">{i + 1}</span>
                <TagPieceMention
                  publicCode={p.publicCode}
                  productType={p.productType}
                  face={p.face}
                  batchCode={p.batchCode}
                  customer={p.leadName}
                  details={p.repName ?? undefined}
                  className="min-w-0 flex-1"
                />
                <span className="shrink-0 text-right text-xs tabular-nums text-white/50">
                  <span className="block font-semibold text-white">{p.qr + p.nfc}</span>
                  <span className="block whitespace-nowrap text-[11px]">{p.qr} QR · {p.nfc} NFC</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

export function OverviewTab({ go }: { go: (path: string) => void }) {
  const t = useT(manageTagsMessages);
  const ts = useT(shellMessages);
  const labels = useTagLabels();
  // Batches are the global admin's; a manager's "Total pieces" opens the pieces instead.
  const isAdmin = useIsSuperAdmin();
  const { data, isLoading, error, refetch } = useQuery<TagOverview>({
    queryKey: [ADMIN_TAGS_KEY, "overview"],
    queryFn: () => getJson(`/api/xpot/admin/tags/overview?timezoneOffset=${new Date().getTimezoneOffset()}`),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading rows={6} />;
  if (error || !data) return <LoadError what={t("whatOverview")} error={error} onRetry={() => void refetch()} />;

  const { counts, stock, interactions, split30 } = data;
  const split = split30.qr + split30.nfc;
  const unsold = stock.house + stock.withResellers;

  return (
    <div className="min-w-0 space-y-4" data-testid="admin-tags-overview">
      <SectionCard accent="tags" icon={Warehouse} title={t("ovStock")} actions={<SectionLink onClick={() => go("/kits")}>{ts("manageKits")}</SectionLink>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div data-testid="overview-stock-house">
            <KpiTile accent="violet" icon={Warehouse} label={t("ovInHouse")} value={stock.house} detail={t("ovInHouseHint", { percent: formatShare(stock.house, unsold) })} onClick={() => go("/pieces?stock=house")} />
          </div>
          <div data-testid="overview-stock-resellers">
            <KpiTile accent="violet" icon={Users} label={t("ovWithResellers")} value={stock.withResellers} detail={t("ovWithResellersHint", { percent: formatShare(stock.withResellers, unsold) })} onClick={() => go("/pieces?stock=reps")} />
          </div>
          <div data-testid="overview-total">
            <KpiTile
              accent="violet"
              icon={Boxes}
              label={t("ovTotalPieces")}
              value={counts.total}
              detail={t.plural(isAdmin ? "ovTotalHint" : "ovTotalHintPieces", counts.retired)}
              onClick={() => go(isAdmin ? "/batches" : "/pieces")}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard accent="tags" icon={Package} title={t("ovLifecycle")} actions={<SectionLink onClick={() => go("/pieces")}>{ts("managePieces")}</SectionLink>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiTile accent="violet" icon={Package} label={labels.status("inventory")} value={counts.inventory} detail={t("ovInventoryHint")} onClick={() => go("/pieces?status=inventory")} />
          <KpiTile accent="violet" icon={UserCheck} label={labels.status("assigned")} value={counts.assigned} detail={t("ovAssignedHint")} onClick={() => go("/pieces?status=assigned")} />
          <KpiTile accent="violet" icon={Radio} label={labels.status("active")} value={counts.active} detail={t("ovActiveHint")} onClick={() => go("/pieces?status=active")} />
          <KpiTile accent="violet" icon={PowerOff} label={labels.status("disabled")} value={counts.disabled} onClick={() => go("/pieces?status=disabled")} />
          <KpiTile accent="violet" icon={Archive} label={labels.status("retired")} value={counts.retired} onClick={() => go("/pieces?status=retired")} />
          <KpiTile accent="violet" icon={Ban} label={labels.status("damaged")} value={counts.damaged} onClick={() => go("/pieces?stock=damaged")} />
        </div>
      </SectionCard>

      <SectionCard accent="tags" icon={ScanLine} title={t("scansTaps")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile accent="violet" icon={ScanLine} label={t("ovToday")} value={interactions.today} detail={t("ovUtcDay")} />
          <KpiTile accent="violet" icon={CalendarDays} label={t("ovLast7")} value={interactions.last7} />
          <KpiTile
            accent="violet"
            icon={CalendarRange}
            label={t("ovLast30")}
            value={interactions.last30}
            detail={`QR ${formatShare(split30.qr, split)} · NFC ${formatShare(split30.nfc, split)}`}
          />
          <KpiTile accent="violet" icon={UserRound} label={t("ovApproxUnique")} value={data.approxUnique30} detail={t("ovApproxHint")} />
        </div>
      </SectionCard>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard accent="tags" icon={Activity} title={t("ovLatestScans")} className="min-w-0" bodyClassName="px-4 py-2">
          {data.recentEvents.length === 0 ? (
            <EmptyState compact dense tone="tags" icon={Activity} title={t("ovNoScansYet")} cardStyle={{}} />
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {data.recentEvents.map((e) => (
                <li key={e.id}>
                  <button type="button" className={FEED_ROW} onClick={() => go(`/pieces/${e.tagId}`)}>
                    <TagPieceMention
                      publicCode={e.publicCode}
                      productType={e.productType}
                      face={e.face}
                      batchCode={e.batchCode}
                      customer={e.leadName}
                      details={[labels.event(e.eventType), e.deviceType].filter(Boolean).join(" · ")}
                      className="min-w-0 flex-1"
                    />
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Pill tone="slate" className="uppercase">{e.accessMethod}</Pill>
                      <span className={FEED_DATE}>{formatDateTime(e.occurredAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="min-w-0 space-y-4">
          <TopPieces go={go} />

          <SectionCard accent="tags" icon={Power} title={t("ovRecentlyActivated")} bodyClassName="px-4 py-2">
            {data.recentActivations.length === 0 ? (
              <EmptyState compact dense tone="tags" icon={Power} title={t("ovNoLivePieces")} cardStyle={{}} />
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {data.recentActivations.map((a) => (
                  <li key={a.id}>
                    <button type="button" className={FEED_ROW} onClick={() => go(`/pieces/${a.id}`)}>
                      <TagPieceMention
                        publicCode={a.publicCode}
                        productType={a.productType}
                        face={a.face}
                        batchCode={a.batchCode}
                        customer={a.leadName}
                        details={a.repName ?? undefined}
                        className="min-w-0 flex-1"
                      />
                      <span className={FEED_DATE}>{formatDateTime(a.activatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard accent="tags" icon={History} title={t("ovRecentChanges")} bodyClassName="px-4 py-2">
            {data.recentChanges.length === 0 ? (
              <EmptyState compact dense tone="tags" icon={History} title={t("ovNoChanges")} cardStyle={{}} />
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {data.recentChanges.map((c) => (
                  <li key={c.id} className="min-w-0">
                    <button type="button" className={`${FEED_ROW} flex-wrap`} onClick={() => go(`/pieces/${c.tagId}`)}>
                      <TagPieceMention publicCode={c.publicCode} productType={c.productType} face={c.face} batchCode={c.batchCode} className="min-w-0 flex-1" />
                      <span className={FEED_DATE}>{formatDateTime(c.createdAt)}</span>
                      <span className="block w-full min-w-0 truncate text-xs text-white/40">
                        {c.newUrl ? `${labels.destination(c.newDestinationType)} · ${c.newUrl}` : c.reason ? t("ovDestClearedReason", { reason: c.reason }) : t("ovDestCleared")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
