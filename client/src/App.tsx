import { useEffect, useMemo } from "react";
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

import Login from "./pages/Login";
import { Loader2 } from "@/components/ui/loader";
import { AdminApp } from "./pages/admin/AdminApp";
import { XpotSettings } from "./pages/xpot/XpotSettings";
import { TagsApp } from "./pages/tags/TagsApp";
import { ModuleSwitch, rememberModule, useXpotModules } from "@/components/ModuleSwitch";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { AppLayout } from "@/components/xpot/AppLayout";
import { MobileTabBar } from "@/components/xpot/MobileTabBar";

// Screens redesigned for desktop use the full width there; the rest stay in a
// narrow column until their turn (docs/DESKTOP.md).
const WIDE_TABS = new Set<string>(["leads", "visits", "dashboard"]);

function XpotAppShell() {
  const { me, xpotMeQuery, isOnline, activeTab } = useXpotQueries();
  const [, setLocation] = useLocation();
  const t = useT(commonMessages);
  const tShell = useT(shellMessages);
  const modules = useXpotModules();
  const visitsAllowed = modules.includes("visits");
  useVisits();

  useEffect(() => {
    document.title = "Xpot";
  }, []);
  useEffect(() => {
    if (visitsAllowed) rememberModule("visits");
  }, [visitsAllowed]);

  if (!me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0f1e] text-white">
        {xpotMeQuery.isError ? (
          <>
            <p className="text-sm text-white/50">{t("sessionFailed")}</p>
            <button
              onClick={() => setLocation("/")}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
            >
              {t("goToSignIn")}
            </button>
          </>
        ) : (
          <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
        )}
      </div>
    );
  }

  // A Tags-only reseller has no Visits screens.
  if (!visitsAllowed && modules.includes("tags")) return <Redirect to="/tags" />;

  const current = tabs.find((tab) => tab.id === activeTab);

  return (
    <AppLayout
      title={current ? tShell(current.labelKey) : "Xpot"}
      wide={WIDE_TABS.has(activeTab)}
      mobileHeader={
        <>
          {!isOnline && (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {t("offline")}
            </div>
          )}
          {modules.length > 1 && (
            <div className="mb-4">
              <ModuleSwitch current="visits" />
            </div>
          )}
        </>
      }
      mobileNav={
        <MobileTabBar
          tabs={tabs.map(({ id, labelKey, icon }) => ({ id, label: tShell(labelKey), icon }))}
          activeId={activeTab}
          onSelect={(id) => setLocation(`/${id}`)}
        />
      }
    >
      <div className="space-y-4">
        {activeTab === "dashboard" ? <XpotDashboard /> : null}
        {activeTab === "leads" ? <XpotLeads /> : null}
        {activeTab === "check-in" ? <XpotCheckIn /> : null}
        {activeTab === "visits" ? <XpotVisits /> : null}
        {activeTab === "sales" ? <XpotSales /> : null}
      </div>
    </AppLayout>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { XpotLandingPage } from "./pages/xpot/XpotLandingPage";
import { isStandaloneDisplay, resolveRootView } from "@/lib/pwa";
import { getXpotHomePath } from "@/lib/xpot";
import type { XpotMeResponse } from "./pages/xpot/types";

// "/" is the marketing landing. That is right for a browser visit, but wrong for
// the installed app: older installs cached start_url "/" at install time, so
// every launch dropped the user on the landing page — which renders "Sign In"
// while the session query is still in flight and never navigates away once it
// resolves. Inside the PWA we therefore resolve the session first and go
// straight to the workspace when it is valid. Branch logic lives in
// resolveRootView (lib/pwa.ts) so it can be unit-tested.
function RootRoute() {
  const standalone = useMemo(isStandaloneDisplay, []);
  const { data: me, isLoading, error } = useQuery<XpotMeResponse>({
    queryKey: ["/api/xpot/me"],
    retry: false,
    enabled: standalone,
  });

  const view = resolveRootView({
    standalone,
    isLoading,
    hasSession: Boolean(me),
    error,
  });

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060912]">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  if (view === "workspace") return <Redirect to={getXpotHomePath()} />;

  return <XpotLandingPage />;
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
        <Route path="/" component={RootRoute} />
        <Route path="/login" component={Login} />
        <Route path="/admin/tags/*?">{() => <AdminApp section="tags" />}</Route>
        <Route path="/admin/:section?">
          {(params) => <AdminApp section={params.section ?? "overview"} />}
        </Route>
        <Route path="/settings" component={XpotSettings} />
        <Route path="/tags/*?" component={TagsApp} />
        <Route>
          <GeoProvider>
            <XpotAppShell />
          </GeoProvider>
        </Route>
      </Switch>
    </Router>
  );
}
