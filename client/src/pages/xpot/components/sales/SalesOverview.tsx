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
import { formatCents } from "../../utils";
import { useSalesSummary } from "../../hooks/useSalesModule";
import { Loader2 } from "@/components/ui/loader";
import { PeriodSelector } from "@/components/xpot/DashboardKit";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { EmptyState } from "@/components/xpot/EmptyState";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

const RANGES = [7, 30, 90] as const;

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

function FinancialMetric({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "red" | "amber" }) {
  const color = accent === "emerald" ? "text-emerald-300" : accent === "red" ? "text-rose-300" : accent === "amber" ? "text-amber-300" : "text-white";
  return (
    <div className="min-w-0 border-l border-white/[0.075] pl-3 first:border-l-0 first:pl-0 lg:pl-5">
      <div className="truncate text-[9px] font-bold uppercase tracking-[0.17em] text-white/30 sm:text-[10px]">{label}</div>
      <div className={`mt-2 truncate text-sm font-bold tracking-[-0.02em] tabular-nums sm:text-lg lg:text-xl ${color}`}>{value}</div>
    </div>
  );
}

export function SalesOverview({ onGoToConsignments }: { onGoToConsignments?: () => void }) {
  const t = useT(salesModuleMessages);
  const filters = useUrlFilters({ range: "30" });
  const days = RANGES.find((r) => String(r) === filters.values.range) ?? 30;
  const query = useSalesSummary(days);
  const s = query.data;

  if (query.isLoading && !s) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-300" />
      </div>
    );
  }
  if (!s) {
    return (
      <p className="rounded-3xl border border-white/[0.08] bg-white/[0.035] px-4 py-8 text-center text-sm text-white/40">
        {t("loadFailed")}
      </p>
    );
  }

  const chart = s.daily.map((d) => ({
    day: new Date(`${d.date}T12:00:00`).toLocaleDateString(t.locale, { month: "short", day: "numeric" }),
    profit: d.profitCents / 100,
    revenue: d.revenueCents / 100,
  }));
  const topProduct = s.byProduct[0];
  const maxProductRevenue = Math.max(1, ...s.byProduct.map((p) => p.revenueCents));
  const margin = s.revenue.periodCents > 0 ? Math.round((s.profit.periodCents / s.revenue.periodCents) * 100) : 0;

  return (
    <div className="space-y-4 lg:space-y-5">
      <section className="grid gap-3 lg:grid-cols-12 lg:gap-4">
        <div
          className="relative isolate overflow-hidden rounded-[28px] border border-emerald-300/[0.16] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24)] sm:p-6 lg:col-span-7 lg:min-h-[248px] lg:p-7"
          style={{ background: "linear-gradient(140deg, rgba(11,54,49,0.84) 0%, rgba(11,35,38,0.96) 45%, rgba(9,20,32,0.98) 100%)" }}
        >
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border-[42px] border-emerald-300/[0.055]" />
          <div className="pointer-events-none absolute -bottom-24 right-16 h-52 w-52 rounded-full bg-emerald-300/[0.08] blur-3xl" />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200/60">
                <TrendingUp className="h-3.5 w-3.5" />
                {t("keptPeriod", { days })}
              </div>
              <div className="mt-4 text-[38px] font-bold leading-none tracking-[-0.055em] tabular-nums text-white sm:text-5xl lg:text-[58px]">
                {formatCents(s.profit.periodCents)}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-emerald-50/45">
                <span>{t("billedAmount", { amount: formatCents(s.revenue.periodCents) })}</span>
                <span className="h-1 w-1 rounded-full bg-emerald-200/30" />
                <span>{t("profitMargin", { percent: margin })}</span>
              </div>
            </div>
            <PeriodSelector
              value={days}
              onChange={(next) => filters.set({ range: String(next) })}
              options={RANGES.map((r) => ({ value: r, label: t("rangeDays", { days: r }) }))}
              ariaLabel={t("periodLabel")}
            />
          </div>

          <div className="relative mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:max-w-xl">
            <div className="bg-[#0b2425]/80 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.17em] text-white/30">{t("salesPeriod", { days })}</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-white">{s.sales.periodCount}</div>
              <div className="text-[10px] text-white/35">{t.plural("units", s.sales.unitsSold)}</div>
            </div>
            <div className="bg-[#0b2425]/80 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.17em] text-white/30">{t("keptThisMonth")}</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-white">{formatCents(s.profit.monthToDateCents)}</div>
              <div className="text-[10px] text-white/35">{t("billedAmount", { amount: formatCents(s.revenue.monthToDateCents) })}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:col-span-5 lg:grid-cols-2 lg:gap-4">
          <SignalCard icon={CircleDollarSign} label={t("today")} value={formatCents(s.revenue.todayCents)} detail={t("keptAmount", { amount: formatCents(s.profit.todayCents) })} tone="blue" />
          <SignalCard icon={ShoppingBag} label={t("salesPeriod", { days })} value={s.sales.periodCount} detail={t.plural("units", s.sales.unitsSold)} />
          <SignalCard icon={ReceiptText} label={t("grossRevenue")} value={formatCents(s.financial.grossCents)} detail={t("lastNDays", { days })} tone="emerald" />
          <SignalCard
            icon={AlertTriangle}
            label={t("outstanding", { amount: formatCents(s.unpaid.cents) })}
            value={s.unpaid.count}
            detail={t.plural("notFullyPaid", s.unpaid.count)}
            tone={s.unpaid.count > 0 ? "amber" : "neutral"}
          />
        </div>
      </section>

      <section className="rounded-[24px] border border-white/[0.075] bg-white/[0.028] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:px-5 lg:px-6 lg:py-5">
        <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/32">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-300/60" />
          {t("financialBreakdown")}
        </div>
        <div className="grid grid-cols-4 gap-3">
          <FinancialMetric label={t("grossRevenue")} value={formatCents(s.financial.grossCents)} />
          <FinancialMetric label={t("discountsGiven")} value={formatCents(s.financial.discountCents)} accent="red" />
          <FinancialMetric label={t("acquisitionCosts")} value={formatCents(s.financial.costCents)} accent="amber" />
          <FinancialMetric label={t("grossProfitMetric")} value={formatCents(s.financial.grossProfitCents)} accent="emerald" />
        </div>
      </section>

      {s.unpaid.count > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3.5 shadow-[inset_3px_0_0_rgba(251,113,133,0.55)]">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-300" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">{t("outstanding", { amount: formatCents(s.unpaid.cents) })}</div>
            <div className="text-[11px] text-white/40">{t.plural("notFullyPaid", s.unpaid.count)}</div>
          </div>
        </div>
      )}

      {chart.length > 1 && (
        <section className="overflow-hidden rounded-[28px] border border-white/[0.075] bg-white/[0.028] shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 lg:px-6">
            <div>
              <div className="text-sm font-bold tracking-[-0.01em] text-white">{t("keptPerDay")}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/28">{t("lastNDays", { days })}</div>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />{t("kept")}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400/60" />{t("billed")}</span>
            </div>
          </div>
          <div className="h-52 w-full px-1 pb-3 pt-5 sm:h-60 lg:h-[300px] lg:px-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesProfitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.34} />
                    <stop offset="80%" stopColor="#34d399" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="salesRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.12} />
                    <stop offset="90%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.055)" strokeDasharray="3 5" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} interval="preserveStartEnd" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600 }} dy={10} />
                <Tooltip
                  contentStyle={{ background: "rgba(8,17,28,0.98)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 14, fontSize: 12, color: "#fff", boxShadow: "0 18px 50px rgba(0,0,0,0.45)" }}
                  formatter={(v: number, name) => [formatCents(Math.round(v * 100)), name === "profit" ? t("kept") : t("billed")]}
                  cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#38bdf8" strokeOpacity={0.48} strokeWidth={1.5} fill="url(#salesRevenueFill)" />
                <Area type="monotone" dataKey="profit" stroke="#34d399" strokeWidth={2.5} fill="url(#salesProfitFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-12">
        <button
          type="button"
          onClick={onGoToConsignments}
          disabled={!onGoToConsignments}
          className="group relative isolate overflow-hidden rounded-[26px] border p-5 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-300/30 active:translate-y-0 disabled:hover:translate-y-0 lg:col-span-5 lg:p-6"
          style={{
            background: s.consignment.dueCount > 0 ? "linear-gradient(145deg, rgba(74,25,35,0.7), rgba(14,19,34,0.96))" : "linear-gradient(145deg, rgba(29,35,78,0.78), rgba(13,19,36,0.96))",
            borderColor: s.consignment.dueCount > 0 ? "rgba(251,113,133,0.22)" : "rgba(129,140,248,0.2)",
          }}
        >
          <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full border-[28px] border-indigo-300/[0.05]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-300/15 bg-indigo-300/[0.08]">
              <Boxes className="h-[18px] w-[18px] text-indigo-300" />
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
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-white/35" />
              <span className={s.consignment.dueCount > 0 ? "text-rose-300" : "text-white/45"}>
                {s.consignment.dueCount > 0 ? t.plural("settlementsOverdue", s.consignment.dueCount) : null}
                {s.consignment.dueCount > 0 && s.consignment.dueSoonCount > 0 ? " · " : null}
                {s.consignment.dueSoonCount > 0 ? t("dueWithinWeek", { count: s.consignment.dueSoonCount }) : null}
              </span>
            </div>
          )}
        </button>

        <div className="rounded-[26px] border border-white/[0.075] bg-white/[0.028] p-5 lg:col-span-7 lg:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-white">{t("byProduct")}</div>
              {topProduct && s.sales.settlementCents > 0 ? (
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
                      <div className="truncate text-sm font-semibold text-white/85">{p.name}</div>
                      <div className="text-[10px] text-white/35">{t("nSold", { count: p.quantity })}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold tabular-nums text-white">{formatCents(p.revenueCents)}</div>
                      <div className="text-[10px] tabular-nums text-emerald-300/65">
                        {t("keptAmount", { amount: formatCents(p.profitCents) })}
                        {p.quantity > 0 ? ` · ${t("perUnitShort", { amount: formatCents(Math.round(p.profitCents / p.quantity)) })}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact dense icon={Boxes} title={t("noSalesPeriod")} hint={t("noSalesPeriodHint")} />
          )}
        </div>
      </section>
    </div>
  );
}
