import { lazy, Suspense, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { useXpotQueries } from "./pages/xpot/hooks/useXpotQueries";
import { GeoProvider } from "./pages/xpot/hooks/GeoProvider";
import { AppLoader } from "@/components/ui/spinner";
import { NavigationPreload } from "@/components/xpot/NavigationPreload";
import { RouteLoader } from "@/components/xpot/RouteLoader";
import { screens } from "@/lib/screens";
import { AdminApp } from "./pages/admin/AdminApp";
import { TagsApp } from "./pages/tags/TagsApp";
import { ModuleSwitch, rememberModule, useXpotModules } from "@/components/ModuleSwitch";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { PieceViewerHost } from "@/components/xpot/PieceViewer3D";
import { ShellHeader } from "@/components/xpot/ShellHeader";
import { AppLayout, MODULE_COLUMN } from "@/components/xpot/AppLayout";
import { VisitsTabBar } from "@/components/xpot/VisitsTabBar";
import { visitsScreen, type VisitsScreen } from "@/components/xpot/moduleNav";
import { navIaMessages } from "@/i18n/messages/navIa";
import { SessionGate } from "@/components/xpot/SessionGate";
import { isStandaloneDisplay, resolveRootView } from "@/lib/pwa";
import { getXpotHomePath, isVisitsPath, MODULE_HOME, rememberModuleRoute } from "@/lib/xpot";
import NotFound from "./pages/NotFound";
import type { XpotMeResponse } from "./pages/xpot/types";
import { PersistentRouteProgress } from "@/components/xpot/PersistentRouteProgress";
import { WorkspaceBoundary } from "@/components/xpot/WorkspaceBoundary";

const {
  leads: XpotLeads, sales: XpotSales, dashboard: XpotDashboard,
  route: XpotProspecting, tasks: XpotTasks, checkIn: XpotCheckIn,
  settings: XpotSettings, academy: AcademyApp, organizations: OrganizationsPage, organizationPerson: OrganizationPerson,
} = screens;
const Login = lazy(() => import("./pages/Login"));
const MyApp = lazy(() => import("./pages/my/MyApp"));
const LegalPage = lazy(() => import("./pages/legal/LegalPage").then((module) => ({ default: module.LegalPage })));
const XpotLandingPage = lazy(() => import("./pages/xpot/XpotLandingPage").then((module) => ({ default: module.XpotLandingPage })));

// Screens redesigned for desktop use the full width there; the rest stay in a
// narrow column until their turn (docs/DESKTOP.md).
const WIDE_TABS = new Set<string>(["leads", "visits", "dashboard", "sales", "route", "tasks"]);

/** The top bar's title of each Visits screen: the sidebar's label (moduleNav), "Visit" for the visit itself. */
const SCREEN_TITLE: Record<Exclude<VisitsScreen, "manage" | "visit">, "tabDashboard" | "tabRoute" | "tabLeads" | "tabVisits" | "tabTasks" | "tabSales"> = {
  dashboard: "tabDashboard",
  route: "tabRoute",
  leads: "tabLeads",
  visits: "tabVisits",
  tasks: "tabTasks",
  sales: "tabSales",
};

/**
 * Decides who gets the Visits screens before any Visits data is asked for: a
 * Tags-only reseller is sent to Tags without the dashboard and visits requests
 * (and the GPS prompt) that XpotAppShell's hooks would fire, and that the server
 * now refuses with 403 module_off.
 */
function VisitsGate() {
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const modules = useXpotModules();
  // No session opens sign-in and returns here (/dashboard is the PWA start_url); a sign-up still
  // under review says so, and a dropped connection offers to try again.
  if (!meQuery.data) return <SessionGate error={meQuery.error} />;
  if (!modules.includes("visits") && modules.includes("tags")) return <Redirect to={MODULE_HOME.tags} />;
  return (
    <GeoProvider>
      <XpotAppShell />
    </GeoProvider>
  );
}

/** Every path no other route claimed is a Visits screen, or a wrong address. */
function VisitsOrNotFound() {
  const [location] = useLocation();
  return isVisitsPath(location) ? <VisitsGate /> : <NotFound />;
}

function XpotAppShell() {
  const { me, xpotMeQuery, isOnline, activeTab, pathname } = useXpotQueries();
  const [, setLocation] = useLocation();
  const t = useT(commonMessages);
  const tShell = useT(shellMessages);
  const tNav = useT(navIaMessages);
  const modules = useXpotModules();
  const visitsAllowed = modules.includes("visits");

  useEffect(() => {
    if (!visitsAllowed) return;
    rememberModule("visits");
    const path = pathname.split("?")[0];
    const search = typeof window !== "undefined" ? window.location.search : "";
    rememberModuleRoute("visits", `${path}${search}`);
  }, [pathname, visitsAllowed]);

  useEffect(() => {
    const path = pathname.split("?")[0];
    const search = typeof window !== "undefined" ? window.location.search : "";
    if (path === "/visits" || path.startsWith("/visits/")) {
      setLocation(`${path.replace(/^\/visits/, "/dashboard/history")}${search}`, { replace: true });
    } else if (path === "/check-in" || (path === "/route" && new URLSearchParams(search).has("leadId"))) {
      // One URL for the visit screen; /route?leadId= was its second one.
      setLocation(`/route/check-in${search}`, { replace: true });
    } else if (path === "/prospecting" || path === "/leads/prospects") {
      setLocation(`/route${search}`, { replace: true });
    } else if (path === "/leads/prospecting" || path.startsWith("/leads/prospecting/")) {
      setLocation(`${path.replace(/^\/leads\/prospecting/, "/route")}${search}`, { replace: true });
    }
  }, [pathname, setLocation]);

  if (!me) return <SessionGate error={xpotMeQuery.error} />;

  const screen = visitsScreen(pathname.split("?")[0]);
  const title = screen === "visit" ? tNav("visitScreen") : screen === "manage" ? "Xpot" : tShell(SCREEN_TITLE[screen]);

  return (
    <AppLayout
      title={title}
      wide={WIDE_TABS.has(activeTab)}
      mobileColumnClassName={MODULE_COLUMN}
      mobileHeader={
        <>
          {!isOnline && (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {t("offline")}
            </div>
          )}
          <ShellHeader />
          {modules.length > 1 && (
            <div className="mb-4">
              <ModuleSwitch current="visits" />
            </div>
          )}
          <PersistentRouteProgress className="mb-4" />
        </>
      }
      mobileNav={<VisitsTabBar />}
    >
      <div className="space-y-4">
        {activeTab === "dashboard" ? <XpotDashboard /> : null}
        {activeTab === "leads" ? <XpotLeads /> : null}
        {activeTab === "sales" ? <XpotSales /> : null}
        {activeTab === "route"
          ? (screen === "visit" || new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").has("leadId")
              ? <XpotCheckIn />
              : <XpotProspecting />)
          : null}
        {activeTab === "tasks" ? <XpotTasks /> : null}
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
    return <AppLoader />;
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
      <NavigationPreload />
      <Suspense fallback={<RouteLoader />}>
        <WorkspaceBoundary>
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
        {/* One teammate's work: Organizations › an organization › Team › a person. */}
        <Route path="/organizations/:organizationId/people/:repId">
          {(params) => <OrganizationPerson organizationId={Number(params.organizationId)} repId={Number(params.repId)} />}
        </Route>
        <Route path="/organizations/:organizationId">
          {(params) => <OrganizationsPage organizationId={Number(params.organizationId)} />}
        </Route>
        <Route path="/organizations">{() => <OrganizationsPage />}</Route>
        <Route path="/admin/tags/*?">{() => <AdminApp section="tags" />}</Route>
        <Route path="/admin/health/*?">{() => <AdminApp section="health" />}</Route>
        <Route path="/admin/integrations/*?">{() => <AdminApp section="integrations" />}</Route>
        {/* One person: /admin/reps/:repId (People opens them beside the list or as a page). */}
        <Route path="/admin/reps/*?">{() => <AdminApp section="reps" />}</Route>
        <Route path="/admin/work/*?">{() => <AdminApp section="work" />}</Route>
        <Route path="/admin/:section?">
          {(params) => <AdminApp section={params.section ?? "home"} />}
        </Route>
        <Route path="/my/*?" component={MyApp} />
        <Route path="/settings" component={XpotSettings} />
        <Route path="/academy/*?" component={AcademyApp} />
        <Route path="/tags/*?" component={TagsApp} />
        <Route>{() => <VisitsOrNotFound />}</Route>
        </Switch>
        </WorkspaceBoundary>
      </Suspense>
      {/* The viewer has its own loading boundary and never blocks navigation. */}
      <PieceViewerHost />
    </Router>
  );
}
