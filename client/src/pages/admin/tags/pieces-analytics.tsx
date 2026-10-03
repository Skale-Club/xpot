import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TagAnalytics } from "@shared/tagsApi";
import { ADMIN_TAGS_KEY, formatDateTime, getJson, percent, STALE_MS, withQuery } from "./api";
import { CARD, Stat } from "./ui";
import { Loading, LoadError } from "./pieces-shared";

// Range picker + KPIs + daily QR/NFC chart, for the whole fleet (Team tab) or
// one piece (PieceDetail).

export type RangePreset = "today" | "7d" | "30d" | "90d";

export const RANGE_PRESETS: ReadonlyArray<{ id: RangePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

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

const PILL = "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors";
const PILL_ON = "bg-blue-500 text-white";
const PILL_OFF = "border border-white/10 bg-white/5 text-white/60 hover:bg-white/10";
const DATE_INPUT = "h-7 rounded-lg border border-white/10 bg-[#0a0f1e] px-2 text-xs text-white [color-scheme:dark]";

export function RangePicker({ value, onChange }: { value: AnalyticsRange; onChange: (r: AnalyticsRange) => void }) {
  const [custom, setCustom] = useState({ from: value.from ?? "", to: value.to ?? "" });
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="admin-tags-range">
      {RANGE_PRESETS.map((p) => (
        <button key={p.id} type="button" className={`${PILL} ${value.preset === p.id ? PILL_ON : PILL_OFF}`} onClick={() => onChange({ preset: p.id })}>
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1">
        <input type="date" aria-label="From" className={DATE_INPUT} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
        <span className="text-xs text-white/40">–</span>
        <input type="date" aria-label="To" className={DATE_INPUT} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
        <button
          type="button"
          className={`${PILL} ${value.preset === "custom" ? PILL_ON : PILL_OFF} disabled:opacity-40`}
          disabled={!custom.from}
          onClick={() => onChange({ preset: "custom", from: custom.from, to: custom.to || undefined })}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// Validated for the dark surface (blue / amber: ΔE ≥ 28 under every CVD type).
const QR_COLOR = "#3b82f6";
const NFC_COLOR = "#d97706";

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
  const url = withQuery(scopeUrl, { ...scope, ...rangeParams(range) });
  const { data, isLoading, error } = useQuery<TagAnalytics>({
    queryKey: [ADMIN_TAGS_KEY, "analytics", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <LoadError what="analytics" error={error} />;

  const { totals } = data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Interactions" value={totals.interactions} hint="QR scans + NFC taps" />
        <Stat label="QR scans" value={totals.qr} hint={percent(totals.qr, totals.interactions)} />
        <Stat label="NFC taps" value={totals.nfc} hint={percent(totals.nfc, totals.interactions)} />
        <Stat label="Approx. unique" value={totals.approxUnique} hint="Per piece, per day estimate" />
      </div>

      <div className={`${CARD} p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">Interactions by day</p>
          <p className="text-xs text-white/40">Last interaction: {formatDateTime(totals.lastInteractionAt)}</p>
        </div>
        {data.daily.length === 0 || totals.interactions === 0 ? (
          <p className="py-10 text-center text-sm text-white/40">No scans or taps in this period.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }} tickFormatter={(d: string) => d.slice(5)} stroke="rgba(255,255,255,0.1)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }} stroke="rgba(255,255,255,0.1)" />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "12px", color: "#fff" }}
                  itemStyle={{ color: "#fff" }}
                  cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }} />
                <Area type="monotone" dataKey="qr" name="QR scans" stackId="1" stroke={QR_COLOR} strokeWidth={2} fill={QR_COLOR} fillOpacity={0.25} />
                <Area type="monotone" dataKey="nfc" name="NFC taps" stackId="1" stroke={NFC_COLOR} strokeWidth={2} fill={NFC_COLOR} fillOpacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-xs text-white/40">
          An interaction is a QR scan or NFC tap that reached the destination. It is not a review, lead or sale.
          {totals.botHits > 0 ? ` ${totals.botHits} automated hit(s) excluded.` : ""}
          {totals.inactiveScans > 0 ? ` ${totals.inactiveScans} scan(s) while not live.` : ""}
        </p>
      </div>

      <div className={`grid gap-4 ${showTopTags ? "md:grid-cols-2" : ""}`}>
        <div className={`${CARD} p-4`}>
          <p className="mb-2 text-sm font-semibold text-white">Devices</p>
          {data.devices.length === 0 ? (
            <p className="text-sm text-white/40">No interactions in this period.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.devices.map((d) => (
                <li key={d.deviceType} className="flex justify-between">
                  <span className="capitalize text-white/80">{d.deviceType}</span>
                  <span className="tabular-nums text-white/50">
                    {d.count} <span className="text-xs text-white/30">({percent(d.count, totals.interactions)})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {showTopTags ? (
          <div className={`${CARD} p-4`}>
            <p className="mb-2 text-sm font-semibold text-white">Top pieces</p>
            {data.topTags.length === 0 ? (
              <p className="text-sm text-white/40">No interactions in this period.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.topTags.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <button type="button" className="min-w-0 truncate text-left font-mono text-white hover:underline" onClick={() => onOpenTag?.(t.id)}>
                      {t.publicCode}
                      <span className="ml-2 font-sans text-white/50">{t.leadName ?? "No customer"}</span>
                      {t.repName ? <span className="ml-1 font-sans text-xs text-white/30">· {t.repName}</span> : null}
                    </button>
                    <span className="shrink-0 tabular-nums text-white/50">
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
