// What the operation made, and what is sitting on other people's shelves.

import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { AlertTriangle, Boxes, CalendarClock } from "lucide-react";
import { formatCents } from "../../utils";
import { useSalesSummary } from "../../hooks/useSalesModule";
import { Loader2 } from "@/components/ui/loader";
import { StatTile } from "./ui";
import { Segmented } from "@/components/xpot/Segmented";
import { EmptyState } from "@/components/xpot/EmptyState";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

const RANGES = [7, 30, 90] as const;

export function SalesOverview({ onGoToConsignments }: { onGoToConsignments?: () => void }) {
  const t = useT(salesModuleMessages);
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
      style={{ background: "rgba(255,255,255,0.04)" }}>{t("loadFailed")}</p>;
  }

  const chart = s.daily.map((d) => ({
    day: new Date(`${d.date}T12:00:00`).toLocaleDateString(t.locale, { month: "short", day: "numeric" }),
    profit: d.profitCents / 100,
    revenue: d.revenueCents / 100,
  }));
  const topProduct = s.byProduct[0];
  const maxProductRevenue = Math.max(1, ...s.byProduct.map((p) => p.revenueCents));

  return (
    <div className="space-y-4">
      {/* Range */}
      <Segmented variant="chips" className="lg:max-w-md" items={RANGES.map((r) => ({ id: r as number, label: t("rangeDays", { days: r }) }))} value={days} onChange={setDays} />

      {/* Profit is the headline; revenue sits beside it. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-4">
        <StatTile tone="green" label={t("keptPeriod", { days })} value={formatCents(s.profit.periodCents)}
          sub={t("billedAmount", { amount: formatCents(s.revenue.periodCents) })} />
        <StatTile tone="indigo" label={t("keptThisMonth")} value={formatCents(s.profit.monthToDateCents)}
          sub={t("billedAmount", { amount: formatCents(s.revenue.monthToDateCents) })} />
        <StatTile label={t("today")} value={formatCents(s.revenue.todayCents)}
          sub={t("keptAmount", { amount: formatCents(s.profit.todayCents) })} />
        <StatTile label={t("salesPeriod", { days })} value={s.sales.periodCount}
          sub={t.plural("units", s.sales.unitsSold)} />
      </div>

      {/* Unpaid */}
      {s.unpaid.count > 0 && (
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">{t("outstanding", { amount: formatCents(s.unpaid.cents) })}</div>
            <div className="text-[11px] text-white/40">{t.plural("notFullyPaid", s.unpaid.count)}</div>
          </div>
        </div>
      )}

      {/* Daily chart — real figures from sales_sales, not a placeholder. */}
      {chart.length > 1 && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-white">{t("keptPerDay")}</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("lastNDays", { days })}</div>
          </div>
          <div className="h-32 w-full lg:h-60">
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
                  formatter={(v: number, name) => [formatCents(Math.round(v * 100)), name === "profit" ? t("kept") : t("billed")]}
                  cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} fill="url(#profitFill)" />
                <Area type="monotone" dataKey="revenue" stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} fill="none" strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Desktop: stock and products side by side. */}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
      {/* Stock on other people's shelves */}
      <button type="button" onClick={onGoToConsignments} disabled={!onGoToConsignments}
        className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.995] disabled:active:scale-100"
        style={{
          background: s.consignment.dueCount > 0 ? "rgba(239,68,68,0.07)" : "rgba(99,102,241,0.07)",
          border: `1px solid ${s.consignment.dueCount > 0 ? "rgba(239,68,68,0.22)" : "rgba(99,102,241,0.2)"}`,
        }}>
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-indigo-300" />
          <span className="text-sm font-bold text-white">{t("onTheStreet")}</span>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <div>
            <div className="text-lg font-bold tabular-nums text-white">{s.consignment.unitsOnHand}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/35">{t("unitsLabel")}</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-white">{formatCents(s.consignment.valueOnHandCents)}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/35">{t("ifAllSellsLower")}</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-white">{s.consignment.activeCount}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/35">{t("shops")}</div>
          </div>
        </div>
        {(s.consignment.dueCount > 0 || s.consignment.dueSoonCount > 0) && (
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.07] pt-2.5 text-[11px]">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-white/35" />
            <span className={s.consignment.dueCount > 0 ? "text-red-300" : "text-white/45"}>
              {s.consignment.dueCount > 0 ? t.plural("settlementsOverdue", s.consignment.dueCount) : null}
              {s.consignment.dueCount > 0 && s.consignment.dueSoonCount > 0 ? " · " : null}
              {s.consignment.dueSoonCount > 0 ? t("dueWithinWeek", { count: s.consignment.dueSoonCount }) : null}
            </span>
          </div>
        )}
      </button>

      {/* By product */}
      {s.byProduct.length > 0 && (
        <div className="space-y-2">
          <div className="px-1 text-xs font-semibold uppercase tracking-widest text-white/30">{t("byProduct")}</div>
          <div className="space-y-1.5">
            {s.byProduct.map((p) => (
              <div key={`${p.productId ?? p.name}`} className="relative overflow-hidden rounded-xl px-3.5 py-3"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="absolute inset-y-0 left-0 opacity-[0.13]"
                  style={{ width: `${(p.revenueCents / maxProductRevenue) * 100}%`, background: "linear-gradient(90deg, #10b981, transparent)" }} />
                <div className="relative flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/85">{p.name}</div>
                    <div className="text-[10px] text-white/35">{t("nSold", { count: p.quantity })}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-white">{formatCents(p.revenueCents)}</div>
                    <div className="text-[10px] tabular-nums text-emerald-400/70">
                      {t("keptAmount", { amount: formatCents(p.profitCents) })}
                      {p.quantity > 0 ? ` · ${t("perUnitShort", { amount: formatCents(Math.round(p.profitCents / p.quantity)) })}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {topProduct && s.sales.settlementCents > 0 && (
            <p className="px-1 text-[11px] text-white/30">
              {t("directVsSettlement", { direct: formatCents(s.sales.directCents), settlement: formatCents(s.sales.settlementCents) })}
            </p>
          )}
        </div>
      )}

      </div>

      {s.sales.periodCount === 0 && (
        <EmptyState compact icon={Boxes} title={t("noSalesPeriod")} hint={t("noSalesPeriodHint")} />
      )}
    </div>
  );
}
