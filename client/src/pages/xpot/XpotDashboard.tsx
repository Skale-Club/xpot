import { useRef } from "react";
import { Camera, MapPinned, DollarSign, Target, Clock3, Footprints, LogOut, Activity, AlertTriangle, RefreshCw, Settings, Shield } from "lucide-react";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Nfc } from "lucide-react";
import type { TagRepSummary } from "@shared/tagsApi";
import { useXpotModules } from "@/components/ModuleSwitch";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { useSyncStatus } from "./hooks/useSyncStatus";
import { VisitRow } from "./components/VisitRow";
import { formatCurrency, formatCents } from "./utils";
import { useSalesSummary } from "./hooks/useSalesModule";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { dashboardMessages } from "@/i18n/messages/dashboard";
import { EmptyState } from "@/components/xpot/EmptyState";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { ModuleBadge } from "@/components/xpot/ModuleBadge";

const METRIC_CARDS = [
  {
    labelKey: "metricVisitsToday" as const,
    key: "visitsToday" as const,
    icon: MapPinned,
    gradient: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
    glow: "rgba(99,102,241,0.35)",
  },
  {
    labelKey: "metricPipelineValue" as const,
    key: "pipelineValue" as const,
    icon: DollarSign,
    gradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    glow: "rgba(16,185,129,0.35)",
  },
  {
    labelKey: "metricOpportunities" as const,
    key: "openOpportunities" as const,
    icon: Target,
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
    glow: "rgba(139,92,246,0.35)",
  },
  {
    labelKey: "metricPendingTasks" as const,
    key: "pendingTasks" as const,
    icon: Clock3,
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    glow: "rgba(245,158,11,0.35)",
  },
] as const;

function getGreetingKey() {
  const h = new Date().getHours();
  if (h < 12) return "greetingMorning" as const;
  if (h < 18) return "greetingAfternoon" as const;
  return "greetingEvening" as const;
}

export function XpotDashboard() {
  const { dashboardQuery, repName, me, signOut, isOnline, setLocation } = useXpotQueries();
  const { toast } = useToast();
  const t = useT(dashboardMessages);
  const metrics = dashboardQuery.data?.metrics;
  const firstName = repName?.split(" ")[0] ?? "";
  const { failedEvents, retryMutation } = useSyncStatus();
  const salesSummary = useSalesSummary(7);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSellTags = useXpotModules().includes("tags");
  const isDesktop = useIsDesktop();
  const { data: tagSummary } = useQuery<TagRepSummary>({
    queryKey: ["/api/xpot/tags/summary"],
    enabled: canSellTags,
    staleTime: 30_000,
  });

  const initials = repName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const avatarUrl = me?.rep.avatarUrl;

  const avatarMutation = useMutation({
    mutationFn: async (imageData: string) => {
      const res = await apiRequest("POST", "/api/xpot/me/avatar", { imageData });
      return res.json() as Promise<{ avatarUrl: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
      toast({ title: t("photoUpdated") });
    },
    onError: (err: Error) => {
      toast({ title: t("uploadFailed"), description: err.message, variant: "destructive" });
    },
  });

  const handleAvatarClick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      avatarMutation.mutate(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  function metricValue(key: typeof METRIC_CARDS[number]["key"]) {
    if (!metrics) return "—";
    if (key === "pipelineValue") return formatCurrency(metrics.pipelineValue ?? 0, "USD");
    return metrics[key] ?? 0;
  }

  const tagsBlock = (
    <>
      {/* Tags at a glance, for reps who sell QR/NFC pieces */}
      {tagSummary && (
        <button
          type="button"
          onClick={() => setLocation("/tags")}
          className="flex w-full items-center gap-3 rounded-[20px] p-4 text-left transition-transform active:scale-[0.98]"
          style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.22)", WebkitTapHighlightColor: "transparent" }}
          data-testid="dashboard-tags"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/15 text-violet-300">
            <Nfc className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              {t("tagsTitle")}
              <ModuleBadge module="tags" />
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {([
                ["tagsInKit", tagSummary.inStock],
                ["tagsLive", tagSummary.active],
                ["tagsScans", tagSummary.scansLast30.qr + tagSummary.scansLast30.nfc],
              ] as const).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <div className="text-lg font-extrabold leading-none text-white tabular-nums">{value}</div>
                  <div className="mt-1 truncate text-[9px] font-semibold uppercase tracking-wider text-white/40">{t(key)}</div>
                </div>
              ))}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-label={t("tagsOpen")} />
        </button>
      )}
    </>
  );

  const chartBlock = (
    <>
      {/* Timeline Chart */}
      <div
        className="relative overflow-hidden rounded-[20px] p-5"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-indigo-500/20 text-indigo-400">
              <Activity className="h-4 w-4" />
            </div>
            <div className="text-sm font-bold text-white">{t("visitActivity")}</div>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("last7Days")}</div>
        </div>
        <div className="h-36 w-full mt-2 lg:h-56">
          <ResponsiveContainer width="100%" height="100%">
            {/* VND-14: this series used to be generated with Math.random(),
                re-rolling on every render. These are the real daily figures. */}
            <AreaChart data={(salesSummary.data?.daily ?? []).map((d, i, arr) => ({
              day: i === arr.length - 1
                ? t("today")
                : new Date(`${d.date}T12:00:00`).toLocaleDateString(t.locale, { weekday: "short" }),
              value: d.revenueCents / 100,
            }))} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="visitsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 600 }} dy={10} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Billed"]}
                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#visitsGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );

  const salesBlock = (
    <>
      {/* Sales — what the operation made and what is out on shelves */}
      {salesSummary.data && (
        <button
          type="button"
          onClick={() => setLocation("/sales")}
          className="w-full rounded-[18px] p-4 text-left transition-all active:scale-[0.995]"
          style={{
            background: salesSummary.data.consignment.dueCount > 0 ? "rgba(239,68,68,0.07)" : "rgba(16,185,129,0.07)",
            border: `1px solid ${salesSummary.data.consignment.dueCount > 0 ? "rgba(239,68,68,0.22)" : "rgba(16,185,129,0.2)"}`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Kept this month</div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-400">
                {formatCents(salesSummary.data.profit.monthToDateCents)}
              </div>
              <div className="text-[11px] text-white/35">
                {formatCents(salesSummary.data.revenue.monthToDateCents)} billed
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">On the street</div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-white">
                {salesSummary.data.consignment.unitsOnHand}
              </div>
              <div className="text-[11px] text-white/35">
                {formatCents(salesSummary.data.consignment.valueOnHandCents)}
              </div>
            </div>
          </div>
          {salesSummary.data.consignment.dueCount > 0 && (
            <div className="mt-2.5 border-t border-white/[0.07] pt-2.5 text-[11px] text-red-300">
              {salesSummary.data.consignment.dueCount} settlement
              {salesSummary.data.consignment.dueCount === 1 ? "" : "s"} overdue — {isDesktop ? "click" : "tap"} to see them
            </div>
          )}
        </button>
      )}
    </>
  );

  const syncBlock = (
    <>
      {/* Sync failures */}
      {failedEvents.length > 0 && (
        <div
          className="rounded-[18px] p-4 space-y-2"
          style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <div className="text-xs font-bold uppercase tracking-widest text-red-400">
              {t.plural("syncFailures", failedEvents.length)}
            </div>
          </div>
          {failedEvents.slice(0, 3).map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: "rgba(0,0,0,0.2)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white/80 truncate">
                  {event.entityType.replace("sales_", "").replace("_", " ")} #{event.entityId}
                </div>
                <div className="text-[10px] text-red-400/70 truncate">{event.lastError ?? t("unknownError")}</div>
              </div>
              <button
                type="button"
                onClick={() => retryMutation.mutate({ entityType: event.entityType, entityId: event.entityId })}
                disabled={retryMutation.isPending}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${retryMutation.isPending ? "animate-spin" : ""}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const recentBlock = (
    <>
      {/* Recent visits */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/30">{t("recentVisits")}</div>
        </div>
        {dashboardQuery.data?.recentVisits?.length
          ? dashboardQuery.data.recentVisits.map((visit) => <VisitRow key={visit.id} visit={visit} />)
          : (
            <EmptyState icon={Footprints} title={t("noVisitsToday")} hint={t("goToCheckIn")} />
          )}
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Hero: avatar + greeting + actions */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-4">
          {/* Avatar upload */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarMutation.isPending}
            className="group relative shrink-0 transition-transform active:scale-95 touch-manipulation"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={repName}
                style={{ boxShadow: "0 8px 24px rgba(59,130,246,0.25)" }}
                className="h-[62px] w-[62px] rounded-[22px] object-cover border border-white/10"
              />
            ) : (
              <div
                className="flex h-[62px] w-[62px] items-center justify-center rounded-[22px] text-[22px] font-bold tracking-wide text-white"
                style={{ background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)", boxShadow: "0 8px 24px rgba(59,130,246,0.25)" }}
              >
                {avatarMutation.isPending ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  initials
                )}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-[22px] bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white drop-shadow-lg" />
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[3px] border-[#080d1a] ${isOnline ? "bg-emerald-400" : "bg-slate-500"}`} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarClick} />

          {/* Greeting block */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400/80 mb-1">{t(getGreetingKey())}</div>
            <div className="text-[26px] font-extrabold text-white tracking-tight leading-none mb-1.5">{firstName} 👋</div>
            <div className="text-xs font-medium text-white/40">
              {new Date().toLocaleDateString(t.locale, { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>

        {/* Actions */}
        {/* The desktop sidebar has these; the phone keeps them here. */}
        <div className="flex items-center gap-1.5 shrink-0 lg:hidden">
          {me && (me.user.isAdmin || ["admin", "manager"].includes(me.rep.role)) && (
            <button
              type="button"
              onClick={() => setLocation("/admin/overview")}
              title={t("admin")}
              className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-white/[0.03] text-white/30 transition-all hover:bg-white/10 hover:text-white active:bg-white/10 active:scale-95 touch-manipulation"
              style={{ border: "1px solid rgba(255,255,255,0.05)", WebkitTapHighlightColor: "transparent" }}
            >
              <Shield className="h-[18px] w-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setLocation("/settings")}
            className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-white/[0.03] text-white/30 transition-all hover:bg-white/10 hover:text-white active:bg-white/10 active:scale-95 touch-manipulation"
            style={{ border: "1px solid rgba(255,255,255,0.05)", WebkitTapHighlightColor: "transparent" }}
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={signOut}
            className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-white/[0.03] text-white/30 transition-all hover:bg-red-500/10 hover:text-red-400 active:bg-white/10 active:scale-95 touch-manipulation"
            style={{ border: "1px solid rgba(255,255,255,0.05)", WebkitTapHighlightColor: "transparent" }}
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-2 lg:gap-4">
        {METRIC_CARDS.map(({ labelKey, key, icon: Icon, gradient, glow }) => {
          const label = t(labelKey);
          return (
            <div
              key={key}
              className="relative overflow-hidden rounded-[14px] px-2 py-3 flex flex-col items-center justify-center text-center lg:px-5 lg:py-4 lg:text-left"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.3)`,
              }}
            >
              <div
                className="pointer-events-none absolute -right-2 -top-2 h-16 w-16 rounded-full opacity-40 blur-[20px]"
                style={{ background: glow }}
              />
              <div className="relative flex flex-col items-center w-full lg:flex-row lg:gap-4">
                <div
                  className="mb-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl lg:mb-0 lg:h-11 lg:w-11"
                  style={{ background: gradient, boxShadow: `0 4px 12px ${glow}` }}
                >
                  <Icon className="h-4 w-4 text-white lg:h-5 lg:w-5" />
                </div>
                <div className="flex w-full min-w-0 flex-col items-center lg:items-start">
                  {dashboardQuery.isLoading ? (
                    <div className="h-5 w-8 rounded-md mb-1.5 animate-pulse" style={{ background: "rgba(255,255,255,0.12)" }} />
                  ) : (
                    <div className="text-lg font-extrabold text-white tabular-nums leading-none tracking-tight mb-1.5 lg:text-2xl">{metricValue(key)}</div>
                  )}
                  {/* Two lines on the phone (the tiles are narrow), one on desktop. */}
                  <div className="text-[8px] font-bold text-white/40 uppercase tracking-widest leading-[1.2] w-full break-words lg:text-[10px]">
                    {label.includes(" ") ? (
                      <>
                        <span className="block lg:inline">{label.split(" ")[0]}</span>
                        <span className="hidden lg:inline"> </span>
                        <span className="block lg:inline">{label.substring(label.indexOf(" ") + 1)}</span>
                      </>
                    ) : (
                      label
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isDesktop ? (
        // Desktop: activity on the left, money and alerts on the right.
        <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
          <div className="min-w-0 space-y-6">
            {chartBlock}
            {recentBlock}
          </div>
          <div className="space-y-4">
            {salesBlock}
            {tagsBlock}
            {syncBlock}
          </div>
        </div>
      ) : (
        <>
          {tagsBlock}
          {chartBlock}
          {salesBlock}
          {syncBlock}
          {recentBlock}
        </>
      )}
    </div>
  );
}
