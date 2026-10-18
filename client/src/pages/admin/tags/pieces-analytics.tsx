import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TagAnalytics } from "@shared/tagsApi";
import { Stat } from "@/components/xpot/Stat";
import { EmptyState } from "@/components/xpot/EmptyState";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { formatDate } from "@/lib/format";
import { ADMIN_TAGS_KEY, formatDateTime, formatShare, getJson, STALE_MS, withQuery } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { FilterChips } from "@/components/xpot/filters";
import { BarChart3, Smartphone, Trophy } from "lucide-react";
// One QR / NFC colour pair everywhere a scan is drawn, the piece screen included.
import { NFC_COLOR, QR_COLOR } from "@/pages/tags/charts";

// Range picker + KPIs + daily QR/NFC chart, for the whole fleet (Team tab) or
// one piece (PieceDetail).

export type RangePreset = "today" | "7d" | "30d" | "90d";

export const RANGE_PRESETS = [
  { id: "today", labelKey: "rangeToday" },
  { id: "7d", labelKey: "range7d" },
  { id: "30d", labelKey: "range30d" },
  { id: "90d", labelKey: "range90d" },
] as const satisfies ReadonlyArray<{ id: RangePreset; labelKey: keyof (typeof manageTagsPiecesMessages)["en"] }>;

const DEVICE_KEYS = {
  mobile: "device_mobile",
  tablet: "device_tablet",
  desktop: "device_desktop",
  unknown: "device_unknown",
} as const satisfies Record<string, keyof (typeof manageTagsPiecesMessages)["en"]>;

const isDevice = (value: string): value is keyof typeof DEVICE_KEYS => value in DEVICE_KEYS;

/** "mobile" → "Mobile", in the language in use; an unknown type stays as it came. */
export function useDeviceLabel() {
  const tm = useT(manageTagsPiecesMessages);
  return (value: string) => (isDevice(value) ? tm(DEVICE_KEYS[value]) : value);
}

/** "2026-10-04" (a UTC day) in the language in use (lib/format). */
function formatDay(day: string, opts: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : formatDate(date, { ...opts, timeZone: "UTC" });
}

const CARD = `rounded-2xl ${GLASS_CLASS}`;

export interface AnalyticsRange {
  preset: RangePreset | "custom";
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

/** Query params the server's analyticsQuerySchema understands. */
export function rangeParams(range: AnalyticsRange): Record<string, string | undefined> {
  if (range.preset !== "custom") return { range: range.preset };
  return {
    from: range.from ? new Date(`${range.from}T00:00:00Z`).toISOString() : undefined,
    // inclusive end date → exclusive upper bound
    to: range.to ? new Date(new Date(`${range.to}T00:00:00Z`).getTime() + 86_400_000).toISOString() : undefined,
  };
}

// Same parts as the list filters (components/xpot/filters.tsx): the presets are
// FilterChips, the custom range sits in a 32px control of the same look.
const DATE_INPUT =
  "h-8 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-2 text-xs text-white/80 outline-none [color-scheme:dark] focus:border-indigo-400/50 sm:w-auto sm:flex-none";

export function RangePicker({ value, onChange }: { value: AnalyticsRange; onChange: (r: AnalyticsRange) => void }) {
  const t = useT(manageTagsPiecesMessages);
  const [custom, setCustom] = useState({ from: value.from ?? "", to: value.to ?? "" });
  const customOn = value.preset === "custom";
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="admin-tags-range">
      <FilterChips<RangePreset | "custom">
        items={RANGE_PRESETS.map((p) => ({ id: p.id, label: t(p.labelKey) }))}
        value={value.preset}
        onChange={(preset) => onChange({ preset })}
        ariaLabel={t("rangeLabel")}
      />
      <div
        className={`flex w-full min-w-0 items-center gap-1 rounded-full border py-0.5 pl-1 pr-0.5 sm:w-auto ${customOn ? "border-indigo-400/40 bg-indigo-500/[0.12]" : "border-white/[0.08] bg-white/[0.03]"}`}
      >
        <input type="date" aria-label={t("rangeFrom")} className={DATE_INPUT} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
        <span className="text-xs text-white/40">–</span>
        <input type="date" aria-label={t("rangeTo")} className={DATE_INPUT} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
        <button
          type="button"
          className={`h-7 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-40 ${customOn ? "bg-indigo-500/30 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
          disabled={!custom.from}
          onClick={() => onChange({ preset: "custom", from: custom.from, to: custom.to || undefined })}
        >
          {t("apply")}
        </button>
      </div>
    </div>
  );
}


export function AnalyticsPanel({
  scopeUrl,
  scope = {},
  range,
  showTopTags = false,
  onOpenTag,
}: {
  scopeUrl: string;
  scope?: Record<string, string | number | undefined>;
  range: AnalyticsRange;
  showTopTags?: boolean;
  onOpenTag?: (id: string) => void;
}) {
  const tm = useT(manageTagsPiecesMessages);
  const tt = useT(tagsMessages);
  const url = withQuery(scopeUrl, { ...scope, ...rangeParams(range) });
  const { data, isLoading, error, refetch } = useQuery<TagAnalytics>({
    queryKey: [ADMIN_TAGS_KEY, "analytics", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading rows={4} />;
  if (error || !data) return <LoadError what={tm("whatAnalytics")} error={error} onRetry={() => void refetch()} />;

  const { totals } = data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat card label={tm("interactions")} value={totals.interactions} detail={tm("interactionsHint")} />
        <Stat card label={tt("qrScans")} value={totals.qr} detail={formatShare(totals.qr, totals.interactions)} />
        <Stat card label={tt("nfcTaps")} value={totals.nfc} detail={formatShare(totals.nfc, totals.interactions)} />
        <Stat card label={tm("approxUnique")} value={totals.approxUnique} detail={tm("approxUniqueHint")} />
      </div>

      <div className={`${CARD} min-w-0 p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">{tm("interactionsByDay")}</p>
          <p className="text-xs text-white/40">{tm("lastInteraction", { date: formatDateTime(totals.lastInteractionAt) })}</p>
        </div>
        {data.daily.length === 0 || totals.interactions === 0 ? (
          <EmptyState compact tone="tags" icon={BarChart3} title={tm("noScansInPeriod")} cardStyle={{}} />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }} tickFormatter={(d: string) => formatDay(d, { month: "short", day: "numeric" })} stroke="rgba(255,255,255,0.1)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }} stroke="rgba(255,255,255,0.1)" />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "12px", color: "#fff" }}
                  itemStyle={{ color: "#fff" }}
                  cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1, strokeDasharray: "4 4" }}
                  labelFormatter={(d) => (typeof d === "string" ? formatDay(d, { dateStyle: "medium" }) : d)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }} />
                <Area type="monotone" dataKey="qr" name={tt("qrScans")} stackId="1" stroke={QR_COLOR} strokeWidth={2} fill={QR_COLOR} fillOpacity={0.25} />
                <Area type="monotone" dataKey="nfc" name={tt("nfcTaps")} stackId="1" stroke={NFC_COLOR} strokeWidth={2} fill={NFC_COLOR} fillOpacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-xs text-white/40">
          {tm("interactionExplain")}
          {totals.botHits > 0 ? ` ${tm.plural("botHits", totals.botHits)}` : ""}
          {totals.inactiveScans > 0 ? ` ${tm.plural("inactiveScans", totals.inactiveScans)}` : ""}
        </p>
      </div>

      <div className={`grid min-w-0 grid-cols-1 gap-4 ${showTopTags ? "md:grid-cols-2" : ""}`}>
        <div className={`${CARD} min-w-0 p-4`}>
          <p className="mb-2 text-sm font-semibold text-white">{tm("devices")}</p>
          {data.devices.length === 0 ? (
            <EmptyState compact dense tone="tags" icon={Smartphone} title={tm("noInteractionsInPeriod")} cardStyle={{}} />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.devices.map((d) => (
                <li key={d.deviceType} className="flex justify-between">
                  <span className="capitalize text-white/80">{isDevice(d.deviceType) ? tm(DEVICE_KEYS[d.deviceType]) : d.deviceType}</span>
                  <span className="tabular-nums text-white/50">
                    {d.count} <span className="text-xs text-white/30">({formatShare(d.count, totals.interactions)})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {showTopTags ? (
          <div className={`${CARD} min-w-0 p-4`}>
            <p className="mb-2 text-sm font-semibold text-white">{tm("topPieces")}</p>
            {data.topTags.length === 0 ? (
              <EmptyState compact dense tone="tags" icon={Trophy} title={tm("noInteractionsInPeriod")} cardStyle={{}} />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.topTags.map((t) => (
                  <li key={t.id} className="flex min-w-0 items-center justify-between gap-2 py-1">
                    <button type="button" className="min-w-0 flex-1 text-left hover:opacity-90" onClick={() => onOpenTag?.(t.id)}>
                      <TagPieceMention
                        publicCode={t.publicCode}
                        productType={t.productType}
                        face={t.face}
                        batchCode={t.batchCode}
                        customer={t.leadName}
                        details={t.repName ?? undefined}
                      />
                    </button>
                    <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-white/50">
                      QR {t.qr} · NFC {t.nfc}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
