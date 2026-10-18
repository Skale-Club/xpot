import { useQuery } from "@tanstack/react-query";
import { BarChart3, ScanLine, Users } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { TagPieceDashboard } from "@shared/tagsApi";
import { KpiTile } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Pill } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, tagsGet } from "./lib";
import { CHART_TICK, CHART_TICK_DAY, chartTooltip, formatChartDay, formatCount, NFC_COLOR, QR_COLOR } from "./charts";
import { CARD, EYEBROW_MUTED } from "./ui";

export default function PieceDashboard({ tagId }: { tagId: string }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tags", "piece-dashboard", tagId, 30],
    queryFn: () => tagsGet<TagPieceDashboard>(`/api/xpot/tags/${tagId}/dashboard?days=30`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <section className={`${CARD} mt-3 animate-pulse p-4`} aria-label={t("pieceAnalyticsTitle")}>
        <div className="h-3 w-28 rounded bg-white/10" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="h-[88px] rounded-2xl bg-white/[0.05]" />
          <div className="h-[88px] rounded-2xl bg-white/[0.05]" />
        </div>
        <div className="mt-3 h-20 rounded-2xl bg-white/[0.04]" />
      </section>
    );
  }

  if (!data) {
    return error ? (
      <div className="mt-3">
        <ErrorState compact message={errorText(error, tc("requestFailed"))} onRetry={() => void refetch()} />
      </div>
    ) : null;
  }
  const total = data.scans.qr + data.scans.nfc;

  return (
    <section className={`${CARD} mt-3 overflow-hidden p-4`} data-testid="piece-dashboard">
      <div className="flex items-center justify-between gap-3">
        <h2 className={EYEBROW_MUTED}>{t("pieceAnalyticsTitle")}</h2>
        <Pill tone="violet">{t("pieceAnalyticsPeriod")}</Pill>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <KpiTile accent="violet" icon={ScanLine} value={formatCount(total, t.locale)} label={t("pieceAnalyticsScans")} />
        <KpiTile accent="violet" icon={Users} value={formatCount(data.visitors, t.locale)} label={t("pieceAnalyticsPeople")} />
      </div>

      {total === 0 ? (
        <div className="mt-3">
          <EmptyState compact dense tone="tags" icon={BarChart3} title={t("dashEmpty")} cardStyle={{}} />
        </div>
      ) : (
        <div className="mt-3 h-24" role="img" aria-label={t("pieceAnalyticsChartLabel")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.daily} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%">
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
                tick={CHART_TICK}
                tickFormatter={(day: string) => formatChartDay(day, t.locale, CHART_TICK_DAY)}
              />
              <Tooltip {...chartTooltip(t.locale)} />
              <Bar dataKey="qr" name="QR" stackId="piece" fill={QR_COLOR} />
              <Bar dataKey="nfc" name="NFC" stackId="piece" fill={NFC_COLOR} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/[0.06] pt-3 text-xs text-white/45">
        <div className="flex items-center gap-3">
          <span><span style={{ color: QR_COLOR }}>■</span> QR <b className="tabular-nums text-white/75">{formatCount(data.scans.qr, t.locale)}</b></span>
          <span><span style={{ color: NFC_COLOR }}>■</span> NFC <b className="tabular-nums text-white/75">{formatCount(data.scans.nfc, t.locale)}</b></span>
        </div>
        {data.devices.length > 0 && (
          <span className="truncate">
            {data.devices.map((device) => `${device.os === "other" ? t("dashOtherDevice") : device.os} ${formatCount(device.scans, t.locale)}`).join(" · ")}
          </span>
        )}
      </div>
    </section>
  );
}
