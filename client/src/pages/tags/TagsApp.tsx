import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Home, Link2, Package, Settings } from "lucide-react";
import { ModuleSwitch, rememberModule, useXpotModules } from "@/components/ModuleSwitch";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { shellMessages } from "@/i18n/messages/shell";
import type { XpotMeResponse } from "@/pages/xpot/types";
import DirectScreen from "./DirectScreen";
import HomeScreen from "./HomeScreen";
import PiecesScreen from "./PiecesScreen";
import TagScreen from "./TagScreen";
import { APP_BASE, tagPath } from "./lib";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { AppLayout } from "@/components/xpot/AppLayout";
import { MobileTabBar } from "@/components/xpot/MobileTabBar";
import { XpotMark } from "@/components/xpot/XpotMark";
import { MODULE_HOME } from "@/lib/xpot";
import { SessionGate } from "@/components/xpot/SessionGate";

const NAV = [
  { href: APP_BASE, key: "navHome", icon: Home },
  { href: `${APP_BASE}/pieces`, key: "navPieces", icon: Package },
  { href: `${APP_BASE}/direct`, key: "navDirect", icon: Link2 },
] as const;

function activeNav(path: string): string {
  if (path.startsWith(`${APP_BASE}/pieces`)) return `${APP_BASE}/pieces`;
  if (path.startsWith(`${APP_BASE}/direct`)) return `${APP_BASE}/direct`;
  return APP_BASE;
}

/** The Tags module: read, sell and write QR/NFC pieces. Mounted at /tags/*. */
export function TagsApp() {
  const t = useT(tagsMessages);
  const ts = useT(shellMessages);
  const [location, navigate] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const modules = useXpotModules();
  const allowed = modules.includes("tags");
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (allowed) rememberModule("tags");
  }, [allowed]);

  if (!meQuery.data) return <SessionGate failed={meQuery.isError} />;

  // Tags switched off for this rep: back to Visits (the server refuses the API anyway).
  if (!allowed) return <Redirect to={MODULE_HOME.visits} />;

  const current = activeNav(location);
  // Every desktop screen uses the full width; only a piece stays narrow, and on
  // desktop it opens beside the pieces table anyway.
  const wide = !location.startsWith(`${APP_BASE}/t/`);

  const currentNav = NAV.find((n) => n.href === current) ?? NAV[0];
  const pieceCode = location.startsWith(`${APP_BASE}/t/`) ? decodeURIComponent(location.slice(`${APP_BASE}/t/`.length)) : null;

  return (
    <AppLayout
      title={pieceCode ?? t(currentNav.key)}
      wide={wide}
      mobileColumnClassName="pb-28 pt-[calc(env(safe-area-inset-top)+16px)]"
      mobileHeader={
        <div className="mb-5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {modules.length > 1 ? (
              <ModuleSwitch current="tags" />
            ) : (
              <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
                <XpotMark />
                Xpot
              </span>
            )}
          </div>
          {/* The account (language, profile) lives in Settings, as on the Visits dashboard. */}
          <button
            type="button"
            onClick={() => navigate("/settings")}
            title={ts("navSettings")}
            aria-label={ts("navSettings")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-white/5 bg-white/[0.03] text-white/40 transition-all hover:bg-white/10 hover:text-white active:scale-95 touch-manipulation"
            data-testid="tags-settings"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </div>
      }
      mobileNav={
        <MobileTabBar
          module="tags"
          tabs={NAV.map(({ href, key, icon }) => ({ id: href, label: t(key), icon, testId: `tags-nav-${key}` }))}
          activeId={current}
          onSelect={navigate}
        />
      }
    >
      <Switch>
        <Route path={`${APP_BASE}/t/:code`}>
          {(params) =>
            // On desktop a piece opens beside the pieces table.
            isDesktop ? <Redirect to={`${APP_BASE}/pieces/${params.code}`} replace /> : <TagScreen key={params.code} code={decodeURIComponent(params.code)} />
          }
        </Route>
        <Route path={`${APP_BASE}/pieces/:code`}>
          {(params) => (isDesktop ? <PiecesScreen selectedCode={decodeURIComponent(params.code)} /> : <Redirect to={tagPath(decodeURIComponent(params.code))} replace />)}
        </Route>
        <Route path={`${APP_BASE}/pieces`}>{() => <PiecesScreen />}</Route>
        <Route path={`${APP_BASE}/direct`} component={DirectScreen} />
        <Route path={APP_BASE} component={HomeScreen} />
        <Route>
          <Redirect to={APP_BASE} />
        </Route>
      </Switch>
    </AppLayout>
  );
}
