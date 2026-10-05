import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Home, Link2, Package } from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { LanguagePicker } from "@/components/LanguagePicker";
import { ModuleSwitch, rememberModule, useXpotModules } from "@/components/ModuleSwitch";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
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
  const tc = useT(commonMessages);
  const [location, navigate] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const modules = useXpotModules();
  const allowed = modules.includes("tags");
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (allowed) rememberModule("tags");
  }, [allowed]);

  if (!meQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#060912] text-white">
        {meQuery.isError ? (
          <>
            <p className="text-sm text-white/50">{tc("sessionFailed")}</p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
            >
              {tc("goToSignIn")}
            </button>
          </>
        ) : (
          <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
        )}
      </div>
    );
  }

  // Tags switched off for this rep: back to Visits (the server refuses the API anyway).
  if (!allowed) return <Redirect to="/check-in" />;

  const current = activeNav(location);
  // Home and the pieces table use the desktop width; a piece and Direct stay narrow.
  const wide = location === APP_BASE || location.startsWith(`${APP_BASE}/pieces`);

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
          <LanguagePicker compact />
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
