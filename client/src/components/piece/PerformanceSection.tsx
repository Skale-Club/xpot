import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Nfc, QrCode, ScanLine, Users } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { TagAnalytics } from "@shared/tagsApi";
import { KpiTile } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/dates";
import { formatShare } from "@/lib/format";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { RangePicker, rangeParams, type AnalyticsRange } from "@/pages/admin/tags/pieces-analytics";
import { withQuery } from "@/pages/admin/tags/api";
import { CHART_TICK, CHART_TICK_DAY, chartTickInterval, chartTooltip, formatChartDay, formatCount, NFC_COLOR, QR_COLOR } from "@/pages/tags/charts";
import { errorText } from "@/pages/tags/lib";
import { CARD, EYEBROW_MUTED } from "@/pages/tags/ui";
import { usePiece } from "./PieceContext";
import { fillDailySeries } from "./pieceView";

// Performance: one range picker, the period's numbers (scans, estimated
// visitors, QR vs NFC by day, devices) clearly apart from the all-time counts,
// and one QR / NFC colour pair (pages/tags/charts.ts) wherever the piece shows.

const DEVICE_KEYS = { mobile: "device_mobile", tablet: "device_tablet", desktop: "device_desktop", unknown: "device_unknown" } as const;
const isDevice = (value: string): value is keyof typeof DEVICE_KEYS => value in DEVICE_KEYS;
const PRESET_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

export function PerformanceSection() {
  const { tag } = usePiece();
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tm = useT(manageTagsPiecesMessages);
  const tp = useT(pieceScreenMessages);
  const [range, setRange] = useState<AnalyticsRange>({ preset: "30d" });
  const url = withQuery(`/api/xpot/tags/${encodeURIComponent(tag.id)}/analytics`, rangeParams(range));
  const { data, isLoading, error, refetch } = useQuery<TagAnalytics>({
    queryKey: ["tags", "piece-analytics", url],
    queryFn: async () => (await apiRequest("GET", url)).json() as Promise<TagAnalytics>,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const series = useMemo(() => (data ? fillDailySeries(data.from, data.to, data.daily) : []), [data]);

  const period = range.preset === "today"
    ? tp("periodToday")
    : range.preset === "custom"
      ? tp("periodRange", { from: range.from ? formatDate(`${range.from}T12:00:00Z`) : "…", to: range.to ? formatDate(`${range.to}T12:00:00Z`) : tp("periodToday") })
      : tp("periodLastDays", { count: PRESET_DAYS[range.preset] });
  const totals = data?.totals;

  return (
    <section className={`${CARD} min-w-0 overflow-hidden p-4`} data-testid="piece-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={EYEBROW_MUTED}>{t("pieceAnalyticsTitle")}</h2>
      </div>
      <div className="mt-2 min-w-0">
        <RangePicker value={range} onChange={setRange} />
      </div>

      {isLoading ? (
        <ListSkeleton rows={2} className="mt-3 space-y-2" />
      ) : error || !totals ? (
        <div className="mt-3">
          <ErrorState compact message={errorText(error, tc("requestFailed"))} onRetry={() => void refetch()} />
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs text-white/45" data-testid="piece-period-label">{tp("periodScans")} · <span className="font-semibold text-white/70">{period}</span></p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <KpiTile accent="violet" icon={ScanLine} value={formatCount(totals.interactions, t.locale)} label={tm("interactions")} />
            <KpiTile accent="violet" icon={Users} value={formatCount(totals.approxUnique, t.locale)} label={tm("approxUnique")} detail={tm("approxUniqueHint")} />
          </div>
          {totals.interactions === 0 ? (
            <div className="mt-3">
              <EmptyState compact dense tone="tags" icon={BarChart3} title={tm("noScansInPeriod")} cardStyle={{}} />
            </div>
          ) : (
            <div className="mt-3 h-28" role="img" aria-label={t("pieceAnalyticsChartLabel")}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%">
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    interval={chartTickInterval(series.length, 5)}
                    tick={CHART_TICK}
                    tickFormatter={(day: string) => formatChartDay(day, t.locale, CHART_TICK_DAY)}
                  />
                  <Tooltip {...chartTooltip(t.locale)} />
                  <Bar dataKey="qr" name={t("qrScans")} stackId="piece" fill={QR_COLOR} />
                  <Bar dataKey="nfc" name={t("nfcTaps")} stackId="piece" fill={NFC_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-white/45">
            <div className="flex items-center gap-3">
              <span><span style={{ color: QR_COLOR }}>■</span> QR <b className="tabular-nums text-white/75">{formatCount(totals.qr, t.locale)}</b> {totals.interactions > 0 ? <span className="text-white/35">{formatShare(totals.qr, totals.interactions)}</span> : null}</span>
              <span><span style={{ color: NFC_COLOR }}>■</span> NFC <b className="tabular-nums text-white/75">{formatCount(totals.nfc, t.locale)}</b> {totals.interactions > 0 ? <span className="text-white/35">{formatShare(totals.nfc, totals.interactions)}</span> : null}</span>
            </div>
            {data.devices.length > 0 && (
              <span className="truncate">
                {data.devices.map((d) => `${isDevice(d.deviceType) ? tm(DEVICE_KEYS[d.deviceType]) : d.deviceType} ${formatCount(d.count, t.locale)}`).join(" · ")}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-white/40">
            {tm("interactionExplain")}
            {totals.botHits > 0 ? ` ${tm.plural("botHits", totals.botHits)}` : ""}
            {totals.inactiveScans > 0 ? ` ${tm.plural("inactiveScans", totals.inactiveScans)}` : ""}
          </p>
        </>
      )}

      {/* Since the piece was made: never mixed with the period above. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.08] pt-3 text-sm text-white/60" data-testid="piece-all-time-scans">
        <span className={EYEBROW_MUTED} title={tp("allTimeScans")}>{t("allTime")}</span>
        <span className="flex items-center gap-1.5">
          <QrCode className="h-4 w-4" style={{ color: QR_COLOR }} />
          <span className="font-bold tabular-nums text-white">{formatCount(tag.qrInteractions, t.locale)}</span> {t("qrScans")}
        </span>
        <span className="flex items-center gap-1.5">
          <Nfc className="h-4 w-4" style={{ color: NFC_COLOR }} />
          <span className="font-bold tabular-nums text-white">{formatCount(tag.nfcInteractions, t.locale)}</span> {t("nfcTaps")}
        </span>
      </div>
    </section>
  );
}
