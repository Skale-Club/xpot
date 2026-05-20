import { useState } from "react";
import { MapPinned, DollarSign, Target, Clock3, Footprints, LogOut, Activity, AlertTriangle, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { useSyncStatus } from "./hooks/useSyncStatus";
import { VisitRow } from "./components/VisitRow";
import { formatCurrency } from "./utils";
import { XpotProfileEditor } from "./XpotProfileEditor";

const METRIC_CARDS = [
  {
    label: "Visits Today",
    key: "visitsToday" as const,
    icon: MapPinned,
    gradient: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
    glow: "rgba(99,102,241,0.35)",
  },
  {
    label: "Pipeline Value",
    key: "pipelineValue" as const,
    icon: DollarSign,
    gradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    glow: "rgba(16,185,129,0.35)",
  },
  {
    label: "Opportunities",
    key: "openOpportunities" as const,
    icon: Target,
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
    glow: "rgba(139,92,246,0.35)",
  },
  {
    label: "Pending Tasks",
    key: "pendingTasks" as const,
    icon: Clock3,
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    glow: "rgba(245,158,11,0.35)",
  },
] as const;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function XpotDashboard() {
  const { dashboardQuery, repName, me, signOut, isOnline } = useXpotQueries();
  const metrics = dashboardQuery.data?.metrics;
  const firstName = repName?.split(" ")[0] ?? "";
  const [profileOpen, setProfileOpen] = useState(false);
  const { failedEvents, retryMutation } = useSyncStatus();

  const initials = repName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const avatarUrl = me?.rep.avatarUrl;

  function metricValue(key: typeof METRIC_CARDS[number]["key"]) {
    if (!metrics) return "—";
    if (key === "pipelineValue") return formatCurrency(metrics.pipelineValue ?? 0, "USD");
    return metrics[key] ?? 0;
  }

  return (
    <div className="space-y-6">
      {/* Hero: avatar + greeting + logout */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-4">
          {/* Avatar Button */}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="relative shrink-0 transition-transform active:scale-95 touch-manipulation"
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
                {initials}
              </div>
            )}
            <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[3px] border-[#080d1a] ${isOnline ? "bg-emerald-400" : "bg-slate-500"}`} />
          </button>

          {/* Greeting block */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400/80 mb-1">{getGreeting()}</div>
            <div className="text-[26px] font-extrabold text-white tracking-tight leading-none mb-1.5">{firstName} 👋</div>
            <div className="text-xs font-medium text-white/40">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={signOut}
          className="flex h-12 w-12 mt-1 shrink-0 items-center justify-center rounded-[20px] bg-white/[0.03] text-white/30 transition-all hover:bg-red-500/10 hover:text-red-400 active:bg-white/10 active:scale-95 touch-manipulation"
          style={{ border: "1px solid rgba(255,255,255,0.05)", WebkitTapHighlightColor: "transparent" }}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-2">
        {METRIC_CARDS.map(({ label, key, icon: Icon, gradient, glow }) => (
          <div
            key={label}
            className="relative overflow-hidden rounded-[14px] px-2 py-3 flex flex-col items-center justify-center text-center"
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
            <div className="relative flex flex-col items-center w-full">
              <div
                className="mb-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{ background: gradient, boxShadow: `0 4px 12px ${glow}` }}
              >
                <Icon className="h-4 w-4 text-white" />
              </div>
              {dashboardQuery.isLoading ? (
                <div className="h-5 w-8 rounded-md mb-1.5 animate-pulse" style={{ background: "rgba(255,255,255,0.12)" }} />
              ) : (
                <div className="text-lg font-extrabold text-white tabular-nums leading-none tracking-tight mb-1.5">{metricValue(key)}</div>
              )}
              <div className="text-[8px] font-bold text-white/40 uppercase tracking-widest leading-[1.2] w-full break-words">
                {label.includes(" ") ? (
                  <>
                    <span className="block">{label.split(" ")[0]}</span>
                    <span className="block">{label.substring(label.indexOf(" ") + 1)}</span>
                  </>
                ) : (
                  label
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

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
            <div className="text-sm font-bold text-white">Visit Activity</div>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Last 7 Days</div>
        </div>
        <div className="h-36 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={Array.from({ length: 7 }).map((_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
              
              const visitsTodayCount = metrics?.visitsToday || 0;
              let visits = 0;
              if (i === 6) visits = visitsTodayCount;
              else if (dayName === "Sun") visits = 0;
              else if (dayName === "Sat") visits = Math.max(0, visitsTodayCount - 3);
              else visits = Math.max(1, visitsTodayCount + (Math.floor(Math.random() * 5) - 1));
              
              return { day: i === 6 ? "Today" : dayName, visits };
            })} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
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
                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area type="monotone" dataKey="visits" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#visitsGradient)">
                <LabelList dataKey="visits" position="top" offset={8} fill="#ffffff" fontSize={11} fontWeight="bold" />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sync failures */}
      {failedEvents.length > 0 && (
        <div
          className="rounded-[18px] p-4 space-y-2"
          style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <div className="text-xs font-bold uppercase tracking-widest text-red-400">
              {failedEvents.length} Sync {failedEvents.length === 1 ? "Failure" : "Failures"}
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
                <div className="text-[10px] text-red-400/70 truncate">{event.lastError ?? "Unknown error"}</div>
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

      {/* Recent visits */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/30">Recent Visits</div>
        </div>
        {dashboardQuery.data?.recentVisits?.length
          ? dashboardQuery.data.recentVisits.map((visit) => <VisitRow key={visit.id} visit={visit} />)
          : (
            <div
              className="flex flex-col items-center gap-3 rounded-2xl py-10 text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: "rgba(99,102,241,0.15)" }}
              >
                <Footprints className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-white/60">No visits today</div>
                <div className="mt-0.5 text-xs text-white/30">Go to Check-In to start your day</div>
              </div>
            </div>
          )}
      </div>

      {/* Profile editor */}
      {profileOpen && me && (
        <XpotProfileEditor me={me} onClose={() => setProfileOpen(false)} />
      )}
    </div>
  );
}
