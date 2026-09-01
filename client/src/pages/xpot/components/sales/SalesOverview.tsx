// What the operation made, and what is sitting on other people's shelves.

import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { AlertTriangle, Boxes, CalendarClock } from "lucide-react";
import { formatCents } from "../../utils";
import { useSalesSummary } from "../../hooks/useSalesModule";
import { Loader2 } from "@/components/ui/loader";
import { StatTile } from "./ui";

const RANGES = [7, 30, 90] as const;

export function SalesOverview({ onGoToConsignments }: { onGoToConsignments?: () => void }) {
  const [days, setDays] = useState<number>(30);
  const query = useSalesSummary(days);
  const s = query.data;

  if (query.isLoading && !s) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (!s) {
    return <p className="rounded-2xl px-4 py-6 text-center text-sm text-white/40"
      style={{ background: "rgba(255,255,255,0.04)" }}>Could not load sales figures.</p>;
  }

  const chart = s.daily.map((d) => ({
    day: new Date(`${d.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    profit: d.profitCents / 100,
    revenue: d.revenueCents / 100,
  }));
  const topProduct = s.byProduct[0];
  const maxProductRevenue = Math.max(1, ...s.byProduct.map((p) => p.revenueCents));

  return (
    <div className="space-y-4">
      {/* Range */}
      <div className="flex gap-1.5">
        {RANGES.map((r) => (
          <button key={r} type="button" onClick={() => setDays(r)}
            className="flex-1 rounded-xl py-1.5 text-xs font-semibold transition-all"
            style={days === r
              ? { background: "rgba(99,102,241,0.25)", color: "white", border: "1px solid rgba(99,102,241,0.4)" }
              : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {r} days
          </button>
        ))}
      </div>

      {/* Profit is the headline; revenue sits beside it. */}
      <div className="grid grid-cols-2 gap-2">
        <StatTile tone="green" label={`Kept · ${days}d`} value={formatCents(s.profit.periodCents)}
          sub={`${formatCents(s.revenue.periodCents)} billed`} />
        <StatTile tone="indigo" label="Kept · this month" value={formatCents(s.profit.monthToDateCents)}
          sub={`${formatCents(s.revenue.monthToDateCents)} billed`} />
        <StatTile label="Today" value={formatCents(s.revenue.todayCents)}
          sub={`${formatCents(s.profit.todayCents)} kept`} />
        <StatTile label={`Sales · ${days}d`} value={s.sales.periodCount}
          sub={`${s.sales.unitsSold} units`} />
      </div>

      {/* Unpaid */}
      {s.unpaid.count > 0 && (
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">{formatCents(s.unpaid.cents)} outstanding</div>
            <div className="text-[11px] text-white/40">
              across {s.unpaid.count} {s.unpaid.count === 1 ? "sale" : "sales"} not fully paid
            </div>
          </div>
        </div>
      )}

      {/* Daily chart — real figures from sales_sales, not a placeholder. */}
      {chart.length > 1 && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-white">Kept per day</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Last {days} days</div>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" axisLine={false} tickLine={false} interval="preserveStartEnd"
                  tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600 }} dy={8} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }}
                  formatter={(v: number, name) => [`$${v.toFixed(2)}`, name === "profit" ? "Kept" : "Billed"]}
                  cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} fill="url(#profitFill)" />
                <Area type="monotone" dataKey="revenue" stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} fill="none" strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Stock on other people's shelves */}
      <button type="button" onClick={onGoToConsignments} disabled={!onGoToConsignments}
        className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.995] disabled:active:scale-100"
        style={{
          background: s.consignment.dueCount > 0 ? "rgba(239,68,68,0.07)" : "rgba(99,102,241,0.07)",
          border: `1px solid ${s.consignment.dueCount > 0 ? "rgba(239,68,68,0.22)" : "rgba(99,102,241,0.2)"}`,
        }}>
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-indigo-300" />
          <span className="text-sm font-bold text-white">On the street</span>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <div>
            <div className="text-lg font-bold tabular-nums text-white">{s.consignment.unitsOnHand}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/35">units</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-white">{formatCents(s.consignment.valueOnHandCents)}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/35">if it all sells</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-white">{s.consignment.activeCount}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/35">shops</div>
          </div>
        </div>
        {(s.consignment.dueCount > 0 || s.consignment.dueSoonCount > 0) && (
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.07] pt-2.5 text-[11px]">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-white/35" />
            <span className={s.consignment.dueCount > 0 ? "text-red-300" : "text-white/45"}>
              {s.consignment.dueCount > 0 ? `${s.consignment.dueCount} settlement${s.consignment.dueCount === 1 ? "" : "s"} overdue` : null}
              {s.consignment.dueCount > 0 && s.consignment.dueSoonCount > 0 ? " · " : null}
              {s.consignment.dueSoonCount > 0 ? `${s.consignment.dueSoonCount} due within a week` : null}
            </span>
          </div>
        )}
      </button>

      {/* By product */}
      {s.byProduct.length > 0 && (
        <div className="space-y-2">
          <div className="px-1 text-xs font-semibold uppercase tracking-widest text-white/30">By product</div>
          <div className="space-y-1.5">
            {s.byProduct.map((p) => (
              <div key={`${p.productId ?? p.name}`} className="relative overflow-hidden rounded-xl px-3.5 py-3"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="absolute inset-y-0 left-0 opacity-[0.13]"
                  style={{ width: `${(p.revenueCents / maxProductRevenue) * 100}%`, background: "linear-gradient(90deg, #10b981, transparent)" }} />
                <div className="relative flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/85">{p.name}</div>
                    <div className="text-[10px] text-white/35">{p.quantity} sold</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-white">{formatCents(p.revenueCents)}</div>
                    <div className="text-[10px] tabular-nums text-emerald-400/70">{formatCents(p.profitCents)} kept</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {topProduct && s.sales.settlementCents > 0 && (
            <p className="px-1 text-[11px] text-white/30">
              {formatCents(s.sales.directCents)} sold directly · {formatCents(s.sales.settlementCents)} from consignment settlements
            </p>
          )}
        </div>
      )}

      {s.sales.periodCount === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl py-10 text-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
          <Boxes className="h-6 w-6 text-white/20" />
          <div className="text-xs text-white/30">No sales in this period yet.</div>
          <div className="text-[11px] text-white/20">Sell from a company card or during a check-in.</div>
        </div>
      )}
    </div>
  );
}
