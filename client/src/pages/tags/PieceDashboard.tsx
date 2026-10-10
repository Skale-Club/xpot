import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { TagPieceDashboard } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { tagsGet } from "./lib";
import { CARD, EYEBROW_MUTED } from "./ui";

const QR_COLOR = "#60a5fa";
const NFC_COLOR = "#a78bfa";

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.035] px-3 py-2.5">
      <p className="text-xl font-extrabold tabular-nums text-white">{value}</p>
      <p className="truncate text-[11px] text-white/40">{label}</p>
    </div>
  );
}

export default function PieceDashboard({ tagId }: { tagId: string }) {
  const t = useT(tagsMessages);
  const { data, isLoading } = useQuery({
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
          <div className="h-14 rounded-2xl bg-white/[0.05]" />
          <div className="h-14 rounded-2xl bg-white/[0.05]" />
        </div>
        <div className="mt-3 h-20 rounded-2xl bg-white/[0.04]" />
      </section>
    );
  }

  if (!data) return null;
  const total = data.scans.qr + data.scans.nfc;
  const chart = data.daily.map((point) => ({
    ...point,
    label: new Date(`${point.day}T12:00:00Z`).toLocaleDateString(t.locale, { day: "numeric", month: "short" }),
  }));

  return (
    <section className={`${CARD} mt-3 overflow-hidden p-4`} data-testid="piece-dashboard">
      <div className="flex items-center justify-between gap-3">
        <h2 className={EYEBROW_MUTED}>{t("pieceAnalyticsTitle")}</h2>
        <span className="rounded-full bg-blue-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-200/80">
          {t("pieceAnalyticsPeriod")}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric value={total} label={t("pieceAnalyticsScans")} />
        <Metric value={data.visitors} label={t("pieceAnalyticsPeople")} />
      </div>

      {total === 0 ? (
        <p className="py-7 text-center text-sm text-white/35">{t("dashEmpty")}</p>
      ) : (
        <div className="mt-3 h-24" role="img" aria-label={t("pieceAnalyticsChartLabel")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%">
              <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={48} tick={{ fill: "rgba(255,255,255,0.32)", fontSize: 9 }} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }}
              />
              <Bar dataKey="qr" name="QR" stackId="piece" fill={QR_COLOR} />
              <Bar dataKey="nfc" name="NFC" stackId="piece" fill={NFC_COLOR} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/[0.06] pt-3 text-xs text-white/45">
        <div className="flex items-center gap-3">
          <span><span style={{ color: QR_COLOR }}>■</span> QR <b className="tabular-nums text-white/75">{data.scans.qr}</b></span>
          <span><span style={{ color: NFC_COLOR }}>■</span> NFC <b className="tabular-nums text-white/75">{data.scans.nfc}</b></span>
        </div>
        {data.devices.length > 0 && (
          <span className="truncate">
            {data.devices.map((device) => `${device.os === "other" ? t("dashOtherDevice") : device.os} ${device.scans}`).join(" · ")}
          </span>
        )}
      </div>
    </section>
  );
}
