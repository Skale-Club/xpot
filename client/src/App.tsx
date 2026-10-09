import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
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
import { LegalPage } from "./pages/legal/LegalPage";
import { Loader2 } from "@/components/ui/loader";
import { AdminApp } from "./pages/admin/AdminApp";
import { XpotSettings } from "./pages/xpot/XpotSettings";
import { TagsApp } from "./pages/tags/TagsApp";
import { ModuleSwitch, rememberModule, useXpotModules } from "@/components/ModuleSwitch";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { ShellHeader } from "@/components/xpot/ShellHeader";
import { AppLayout, MODULE_COLUMN } from "@/components/xpot/AppLayout";
import { MobileTabBar } from "@/components/xpot/MobileTabBar";
import { SessionGate } from "@/components/xpot/SessionGate";
import { XpotLandingPage } from "./pages/xpot/XpotLandingPage";
import { getHttpStatus, isStandaloneDisplay, resolveRootView } from "@/lib/pwa";
import { getXpotHomePath, MODULE_HOME } from "@/lib/xpot";
import type { XpotMeResponse } from "./pages/xpot/types";
import { OrganizationsPage } from "./pages/xpot/OrganizationsPage";

// Screens redesigned for desktop use the full width there; the rest stay in a
// narrow column until their turn (docs/DESKTOP.md).
const WIDE_TABS = new Set<string>(["leads", "visits", "dashboard", "sales"]);

/**
 * Decides who gets the Visits screens before any Visits data is asked for: a
 * Tags-only reseller is sent to Tags without the dashboard and visits requests
 * (and the GPS prompt) that XpotAppShell's hooks would fire, and that the server
 * now refuses with 403 module_off.
 */
function VisitsGate() {
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const modules = useXpotModules();
  // An expired or refused session goes back to sign-in on its own, as XpotAppShell's
  // useXpotQueries did before this gate stood in front of it (/dashboard is the PWA start_url).
  const status = getHttpStatus(meQuery.error);
  if (status === 401 || status === 403) return <Redirect to="/" />;
  if (!meQuery.data) return <SessionGate failed={meQuery.isError} />;
  if (!modules.includes("visits") && modules.includes("tags")) return <Redirect to={MODULE_HOME.tags} />;
  return (
    <GeoProvider>
      <XpotAppShell />
    </GeoProvider>
  );
}

function XpotAppShell() {
  const { me, xpotMeQuery, isOnline, activeTab } = useXpotQueries();
  const [, setLocation] = useLocation();
  const t = useT(commonMessages);
  const tShell = useT(shellMessages);
  const modules = useXpotModules();
  const visitsAllowed = modules.includes("visits");
  useVisits();

  useEffect(() => {
    if (visitsAllowed) rememberModule("visits");
  }, [visitsAllowed]);

  if (!me) return <SessionGate failed={xpotMeQuery.isError} />;

  const current = tabs.find((tab) => tab.id === activeTab);

  return (
    <AppLayout
      title={current ? tShell(current.labelKey) : "Xpot"}
      wide={WIDE_TABS.has(activeTab)}
      mobileColumnClassName={MODULE_COLUMN}
      mobileHeader={
        <>
          {!isOnline && (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {t("offline")}
            </div>
          )}
          <ShellHeader module="visits" />
          {modules.length > 1 && (
            <div className="mb-4">
              <ModuleSwitch current="visits" />
            </div>
          )}
        </>
      }
      mobileNav={
        <MobileTabBar
          module="visits"
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
        <Route path="/pt" component={RootRoute} />
        <Route path="/es" component={RootRoute} />
        <Route path="/login" component={Login} />
        <Route path="/privacy">{() => <LegalPage doc="privacy" />}</Route>
        <Route path="/terms">{() => <LegalPage doc="terms" />}</Route>
        <Route path="/pt/privacy">{() => <LegalPage doc="privacy" />}</Route>
        <Route path="/pt/terms">{() => <LegalPage doc="terms" />}</Route>
        <Route path="/es/privacy">{() => <LegalPage doc="privacy" />}</Route>
        <Route path="/es/terms">{() => <LegalPage doc="terms" />}</Route>
        <Route path="/organizations/:organizationId">
          {(params) => <OrganizationsPage organizationId={Number(params.organizationId)} />}
        </Route>
        <Route path="/organizations">{() => <OrganizationsPage />}</Route>
        <Route path="/admin/tags/*?">{() => <AdminApp section="tags" />}</Route>
        <Route path="/admin/:section?">
          {(params) => <AdminApp section={params.section ?? "overview"} />}
        </Route>
        <Route path="/settings" component={XpotSettings} />
        <Route path="/tags/*?" component={TagsApp} />
        <Route>
          <VisitsGate />
        </Route>
      </Switch>
    </Router>
  );
}
