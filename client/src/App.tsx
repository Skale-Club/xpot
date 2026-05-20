import { useEffect } from "react";
import { Route, Router, Switch, useLocation } from "wouter";
import { useXpotQueries } from "./pages/xpot/hooks/useXpotQueries";
import { useVisits } from "./pages/xpot/hooks/useVisits";
import { GeoProvider } from "./pages/xpot/hooks/GeoProvider";
import { tabs } from "./pages/xpot/utils";
import { XpotCheckIn } from "./pages/xpot/XpotCheckIn";
import { XpotLeads } from "./pages/xpot/XpotLeads";
import { XpotVisits } from "./pages/xpot/XpotVisits";
import { XpotSales } from "./pages/xpot/XpotSales";
import { XpotDashboard } from "./pages/xpot/XpotDashboard";
import { XpotProfileEditor } from "./pages/xpot/XpotProfileEditor";
import Login from "./pages/Login";
import { Loader2 } from "@/components/ui/loader";

function XpotAppShell() {
  const { me, xpotMeQuery, isOnline, activeTab } = useXpotQueries();
  const [, setLocation] = useLocation();
  useVisits();

  useEffect(() => {
    document.title = "Xpot";
  }, []);

  if (!me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0f1e] text-white">
        {xpotMeQuery.isError ? (
          <>
            <p className="text-sm text-white/50">Failed to load session</p>
            <button
              onClick={() => setLocation("/login")}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
            >
              Go to Login
            </button>
          </>
        ) : (
          <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: "linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%)" }}
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-28 pt-5">
        {!isOnline && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            You are offline. Check-in and sync are disabled.
          </div>
        )}

        <main className="flex-1 space-y-4">
          {activeTab === "dashboard" ? <XpotDashboard /> : null}
          {activeTab === "leads" ? <XpotLeads /> : null}
          {activeTab === "check-in" ? <XpotCheckIn /> : null}
          {activeTab === "visits" ? <XpotVisits /> : null}
          {activeTab === "sales" ? <XpotSales /> : null}
          {activeTab === "profile" && me ? (
            <XpotProfileEditor me={me} onClose={() => setLocation("/dashboard")} />
          ) : null}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pt-2">
          <div
            className="mx-auto flex max-w-md items-center gap-1 rounded-2xl border border-white/10 px-2 py-1.5"
            style={{ background: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(20px)" }}
          >
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLocation(`/${id}`)}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-all touch-manipulation ${
                    isActive ? "text-white" : "text-white/35 hover:text-white/60"
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute inset-0 rounded-xl"
                      style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.25) 0%, rgba(99,102,241,0.25) 100%)" }}
                    />
                  )}
                  <Icon className={`relative h-[18px] w-[18px] transition-all ${isActive ? "drop-shadow-[0_0_6px_rgba(99,102,241,0.8)]" : ""}`} />
                  <span className="relative truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.body.style.backgroundColor = "#060912";
    document.documentElement.style.backgroundColor = "#060912";
  }, []);

  return (
    <Router>
      <Switch>
        <Route path="/login" component={Login} />
        <Route>
          <GeoProvider>
            <XpotAppShell />
          </GeoProvider>
        </Route>
      </Switch>
    </Router>
  );
}
