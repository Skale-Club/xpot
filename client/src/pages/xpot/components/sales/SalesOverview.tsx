// The revenue command center: what the operation made, kept, and still has in the field.

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarClock,
  CircleDollarSign,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCents, formatShortDate } from "../../utils";
import { MONEY_CHART, MONEY_DUE_TONE } from "./moneyPalette";
import { useSalesSummary } from "../../hooks/useSalesModule";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { PeriodSelector } from "@/components/xpot/DashboardKit";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Button } from "@/components/ui/button";
import { useShowProfit } from "../../hooks/useShowProfit";
import { hasCost, marginPercent, profitCoverage, profitOnCostedProducts } from "./profitRules";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

// 1 is today: the window is counted in calendar days, so one day starts at midnight (shared/dayKeys.ts).
const RANGES = [1, 7, 30, 90] as const;

function SignalCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "neutral" | "emerald" | "blue" | "amber";
}) {
  const tones = {
    neutral: { icon: "text-white/55", iconBg: "bg-white/[0.05] border-white/[0.07]", glow: "" },
    emerald: { icon: "text-emerald-300", iconBg: "bg-emerald-300/[0.09] border-emerald-300/15", glow: "from-emerald-400/[0.07]" },
    blue: { icon: "text-blue-300", iconBg: "bg-blue-400/[0.09] border-blue-300/15", glow: "from-blue-400/[0.07]" },
    amber: { icon: "text-amber-300", iconBg: "bg-amber-300/[0.09] border-amber-300/15", glow: "from-amber-400/[0.07]" },
  }[tone];

  return (
    <div className="relative isolate overflow-hidden rounded-2xl border border-white/[0.075] bg-white/[0.032] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      {tones.glow ? <div className={`pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br ${tones.glow} to-transparent`} /> : null}
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${tones.iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${tones.icon}`} />
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</div>
      </div>
      <div className="mt-4 text-[22px] font-bold tracking-[-0.03em] tabular-nums text-white lg:text-2xl">{value}</div>
      {detail ? <div className="mt-1 text-[11px] text-white/38">{detail}</div> : null}
    </div>
  );
}

/** A figure of the breakdown: profit emerald, money out or not earned the neutral cost tone (moneyPalette). */
function FinancialMetric({ label, value, accent }: { label: string; value: string; accent?: "profit" | "cost" }) {
  const color = accent ? MONEY_CHART[accent].text : "text-white";
  return (
    <div className="min-w-0 border-l border-white/[0.075] pl-3 first:border-l-0 first:pl-0 max-sm:odd:border-l-0 max-sm:odd:pl-0 lg:pl-5">
      <div className="truncate text-[9px] font-bold uppercase tracking-[0.17em] text-white/30 sm:text-[10px]">{label}</div>
      <div className={`mt-2 truncate text-sm font-bold tracking-[-0.02em] tabular-nums sm:text-lg lg:text-xl ${color}`}>{value}</div>
    </div>
  );
}

export function SalesOverview({ onGoToConsignments, onNewSale }: { onGoToConsignments?: () => void; onNewSale?: () => void }) {
  const t = useT(salesModuleMessages);
  // A rep sells and collects; what the products cost and what is left over is the owner's number.
  const showProfit = useShowProfit();
  const filters = useUrlFilters({ range: "30" });
  const days = RANGES.find((r) => String(r) === filters.values.range) ?? 30;
  const query = useSalesSummary(days);
  const s = query.data;

  if (query.isLoading && !s) {
    return <ListSkeleton rows={3} rowClassName="h-32 rounded-2xl" className="space-y-3" />;
  }
  if (!s) {
    return <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />;
  }

  // What was sold is the figure for everyone, and the one Team results shows. The owner's headline is profit, but only
  // where a cost was entered: a product with none would show the whole sale as profit.
  const chart = s.daily.map((d) => ({
    day: formatShortDate(`${d.date}T12:00:00`),
    revenue: d.revenueCents / 100,
    profit: (d.profitCents ?? 0) / 100,
  }));
  const maxProductRevenue = Math.max(1, ...s.byProduct.map((p) => p.revenueCents));
  const costed = profitOnCostedProducts(s.byProduct);
  const coverage = profitCoverage(s.byProduct);
  const hasProfit = showProfit && coverage !== "none";
  // Every product sold has a cost: the totals by day, today and month are all real profit, not only the headline.
  const allCosted = showProfit && coverage === "all";
  const costedMargin = marginPercent(costed);
  // On the 1st the month is one day old: "this month" next to a bigger "last 30 days" figure reads as an error.
  const monthIsNew = new Date().getDate() < 2;
  const monthLabel = monthIsNew ? t("sinceToday", { date: formatShortDate(new Date()) }) : t("soldThisMonth");

  const periodPicker = (
    <PeriodSelector
      value={days}
      onChange={(next) => filters.set({ range: String(next) })}
      options={RANGES.map((r) => ({ value: r, label: r === 1 ? t("rangeToday") : t("rangeDays", { days: r }) }))}
      ariaLabel={t("periodLabel")}
    />
  );

  return (
    <div className="space-y-4 lg:space-y-5">
      <section className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <div
          className="relative isolate min-w-0 overflow-hidden rounded-2xl border border-emerald-300/[0.16] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24)] sm:p-6 lg:col-span-7 lg:p-7"
          style={{ background: "linear-gradient(140deg, rgba(11,54,49,0.84) 0%, rgba(11,35,38,0.96) 45%, rgba(9,20,32,0.98) 100%)" }}
        >
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border-[42px] border-emerald-300/[0.055]" />
          <div className="pointer-events-none absolute -bottom-24 right-16 h-52 w-52 rounded-full bg-emerald-300/[0.08] blur-3xl" />

          {/* Wraps on a phone: the period picker drops under the figure instead of squeezing "30 days" onto two lines. */}
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200/60">
                <TrendingUp className="h-3.5 w-3.5" />
                {showProfit ? (days === 1 ? t("keptToday") : t("keptPeriod", { days })) : days === 1 ? t("soldToday") : t("soldPeriod", { days })}
              </div>
              <div className="mt-4 text-[38px] font-bold leading-none tracking-[-0.055em] tabular-nums text-white sm:text-5xl lg:text-[58px]" data-testid="sales-overview-main">
                {showProfit ? (hasProfit ? formatCents(costed.profitCents) : "-") : formatCents(s.revenue.periodCents)}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-emerald-50/45">
                {hasProfit ? (
                  <>
                    <span>{allCosted ? t("billedAmount", { amount: formatCents(s.revenue.periodCents) }) : t("profitOfSales", { profit: formatCents(costed.profitCents), sales: formatCents(costed.revenueCents) })}</span>
                    <span className="h-1 w-1 rounded-full bg-emerald-200/30" />
                    <span data-testid="sales-margin">{t("profitMargin", { percent: costedMargin })}</span>
                  </>
                ) : showProfit ? (
                  <span className="max-w-sm" data-testid="sales-no-cost">{s.sales.periodCount === 0 ? t("noSalesPeriod") : t("noCostYet")}</span>
                ) : (
                  <span>{t.plural("salesCount", s.sales.periodCount)} · {t.plural("units", s.sales.unitsSold)}</span>
                )}
              </div>
              {hasProfit && !allCosted ? <div className="mt-1.5 max-w-sm text-[11px] text-emerald-50/35" data-testid="sales-partial-cost">{t("partialCost")}</div> : null}
            </div>
            {periodPicker}
          </div>

          {showProfit ? (
            <div className="relative mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:max-w-xl">
              <div className="bg-[#0b2425]/80 px-4 py-3">
                <div className="text-[9px] font-bold uppercase tracking-[0.17em] text-white/30">{t("salesPeriod", { days })}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-white">{s.sales.periodCount}</div>
                <div className="text-[10px] text-white/35">{t.plural("units", s.sales.unitsSold)}</div>
              </div>
              <div className="bg-[#0b2425]/80 px-4 py-3">
                <div className="text-[9px] font-bold uppercase tracking-[0.17em] text-white/30">{t("keptThisMonth")}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-white">{allCosted ? formatCents(s.profit?.monthToDateCents ?? 0) : "-"}</div>
                <div className="text-[10px] text-white/35">{allCosted ? t("billedAmount", { amount: formatCents(s.revenue.monthToDateCents) }) : t("partialCostShort")}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:col-span-5 lg:gap-4">
          {showProfit ? (
            <>
              <SignalCard icon={CircleDollarSign} label={t("today")} value={formatCents(s.revenue.todayCents)} detail={allCosted ? t("keptAmount", { amount: formatCents(s.profit?.todayCents ?? 0) }) : undefined} tone="emerald" />
              <SignalCard icon={ShoppingBag} label={monthLabel} value={formatCents(s.revenue.monthToDateCents)} />
              <SignalCard icon={ReceiptText} label={t("grossRevenue")} value={formatCents(s.financial.grossCents)} detail={t("lastNDays", { days })} tone="emerald" />
            </>
          ) : (
            <SignalCard icon={CircleDollarSign} label={monthLabel} value={formatCents(s.revenue.monthToDateCents)} tone="emerald" />
          )}
          <SignalCard
            icon={AlertTriangle}
            label={t("toCollect")}
            value={formatCents(s.unpaid.cents)}
            detail={s.unpaid.count > 0 ? t.plural("notFullyPaid", s.unpaid.count) : t("allPaid")}
            tone={s.unpaid.count > 0 ? MONEY_DUE_TONE.outstanding : "neutral"}
          />
        </div>
      </section>

      {showProfit ? (
        <section className="rounded-[24px] border border-white/[0.075] bg-white/[0.028] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:px-5 lg:px-6 lg:py-5" data-testid="sales-breakdown">
          <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/32">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-300/60" />
            {t("financialBreakdown")}
          </div>
          {/* Two by two on a phone, where four columns cut the amounts ("$1,05…"). */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 sm:gap-y-3">
            <FinancialMetric label={t("grossRevenue")} value={formatCents(s.financial.grossCents)} />
            <FinancialMetric label={t("discountsGiven")} value={formatCents(s.financial.discountCents)} accent="cost" />
            <FinancialMetric label={t("acquisitionCosts")} value={formatCents(s.financial.costCents ?? 0)} accent="cost" />
            <FinancialMetric
              label={allCosted ? t("grossProfitMetric") : t("profitWithCost")}
              value={allCosted ? formatCents(s.financial.grossProfitCents ?? 0) : hasProfit ? t("profitOfSales", { profit: formatCents(costed.profitCents), sales: formatCents(costed.revenueCents) }) : "-"}
              accent="profit"
            />
          </div>
        </section>
      ) : null}

      {chart.length > 1 && (
        <section className="overflow-hidden rounded-[28px] border border-white/[0.075] bg-white/[0.028] shadow-[0_18px_60px_rgba(0,0,0,0.18)]" data-testid={allCosted ? "sales-profit-chart" : "sales-sold-chart"}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 lg:px-6">
            <div>
              <div className="text-sm font-bold tracking-[-0.01em] text-white">{allCosted ? t("keptPerDay") : t("soldPerDay")}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/28">{t("lastNDays", { days })}</div>
            </div>
            {allCosted ? (
              <div className="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${MONEY_CHART.profit.swatch}`} />{t("kept")}</span>
                <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${MONEY_CHART.revenue.swatch}`} />{t("billed")}</span>
              </div>
            ) : null}
          </div>
          <div className="h-52 w-full px-1 pb-3 pt-5 sm:h-60 lg:h-[300px] lg:px-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesProfitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={MONEY_CHART.profit.stroke} stopOpacity={0.34} />
                    <stop offset="80%" stopColor={MONEY_CHART.profit.stroke} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="salesRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={MONEY_CHART.revenue.stroke} stopOpacity={allCosted ? 0.12 : 0.34} />
                    <stop offset="90%" stopColor={MONEY_CHART.revenue.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.055)" strokeDasharray="3 5" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} interval="preserveStartEnd" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600 }} dy={10} />
                <Tooltip
                  contentStyle={{ background: "rgba(8,17,28,0.98)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 14, fontSize: 12, color: "#fff", boxShadow: "0 18px 50px rgba(0,0,0,0.45)" }}
                  formatter={(v: number, name) => [formatCents(Math.round(v * 100)), allCosted ? (name === "profit" ? t("kept") : t("billed")) : t("soldPerDay")]}
                  cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Area type="monotone" dataKey="revenue" stroke={MONEY_CHART.revenue.stroke} strokeOpacity={allCosted ? 0.6 : 1} strokeWidth={allCosted ? 1.5 : 2.5} fill="url(#salesRevenueFill)" />
                {allCosted ? <Area type="monotone" dataKey="profit" stroke={MONEY_CHART.profit.stroke} strokeWidth={2.5} fill="url(#salesProfitFill)" /> : null}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <button
          type="button"
          onClick={onGoToConsignments}
          disabled={!onGoToConsignments}
          className="group relative isolate flex min-w-0 flex-col self-start overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04] p-5 text-left transition-colors hover:bg-white/[0.06] lg:col-span-5 lg:p-6"
        >
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
              <Boxes className="h-[18px] w-[18px] text-white/60" aria-hidden="true" />
            </div>
            <ArrowRight className="h-4 w-4 text-white/25 transition-transform group-hover:translate-x-1 group-hover:text-white/55" />
          </div>
          <div className="relative mt-5 text-sm font-bold text-white">{t("onTheStreet")}</div>
          <div className="relative mt-4 grid grid-cols-3 gap-3">
            <div>
              <div className="text-2xl font-bold tracking-[-0.04em] tabular-nums text-white">{s.consignment.unitsOnHand}</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">{t("unitsLabel")}</div>
            </div>
            <div>
              <div className="truncate text-xl font-bold tracking-[-0.04em] tabular-nums text-white">{formatCents(s.consignment.valueOnHandCents)}</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">{t("ifAllSellsLower")}</div>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-[-0.04em] tabular-nums text-white">{s.consignment.activeCount}</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">{t("shops")}</div>
            </div>
          </div>
          {(s.consignment.dueCount > 0 || s.consignment.dueSoonCount > 0) && (
            <div className="relative mt-5 flex items-center gap-2 border-t border-white/[0.07] pt-3 text-[11px]">
              <CalendarClock className={`h-3.5 w-3.5 shrink-0 ${s.consignment.dueCount > 0 ? "text-red-300" : "text-white/35"}`} />
              {/* Only the overdue count is red: the card is a stock summary, not an alarm. */}
              <span className="text-white/45">
                {s.consignment.dueCount > 0 ? <span className="font-semibold text-red-300">{t.plural("settlementsOverdue", s.consignment.dueCount)}</span> : null}
                {s.consignment.dueCount > 0 && s.consignment.dueSoonCount > 0 ? " · " : null}
                {s.consignment.dueSoonCount > 0 ? t("dueWithinWeek", { count: s.consignment.dueSoonCount }) : null}
              </span>
            </div>
          )}
        </button>

        <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5 lg:col-span-7 lg:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-white">{t("byProduct")}</div>
              {s.byProduct.length > 0 && s.sales.settlementCents > 0 ? (
                <div className="mt-0.5 text-[10px] text-white/28">{t("directVsSettlement", { direct: formatCents(s.sales.directCents), settlement: formatCents(s.sales.settlementCents) })}</div>
              ) : null}
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
              <ShoppingBag className="h-4 w-4 text-white/40" />
            </div>
          </div>

          {s.byProduct.length > 0 ? (
            <div className="space-y-2">
              {s.byProduct.map((p, index) => (
                <div key={`${p.productId ?? p.name}`} className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-black/[0.12] px-4 py-3.5">
                  <div className="absolute inset-y-0 left-0 opacity-[0.11] transition-opacity group-hover:opacity-[0.17]" style={{ width: `${(p.revenueCents / maxProductRevenue) * 100}%`, background: "linear-gradient(90deg, #34d399, transparent)" }} />
                  <div className="relative flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-[10px] font-bold tabular-nums text-white/35">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-semibold text-white/85">{p.name}</div>
                      <div className="text-[10px] text-white/35">{t("nSold", { count: p.quantity })}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold tabular-nums text-white">{formatCents(p.revenueCents)}</div>
                      {/* Only a product with a cost has a profit; without one it would repeat the sale in green. */}
                      {showProfit && hasCost(p) ? (
                        <div className="text-[10px] tabular-nums text-emerald-300/65">
                          {t("keptAmount", { amount: formatCents(p.profitCents ?? 0) })}
                          {p.quantity > 1 ? ` · ${t("perUnitShort", { amount: formatCents(Math.round((p.profitCents ?? 0) / p.quantity)) })}` : ""}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact dense icon={Boxes} title={t("noSalesPeriod")} hint={t("noSalesPeriodHint")}>
              {onNewSale ? <Button type="button" variant="brand" size="sm" onClick={onNewSale}>{t("newSale")}</Button> : null}
            </EmptyState>
          )}
        </div>
      </section>
    </div>
  );
}
