import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ModuleSwitch, rememberModule, useXpotModules } from "@/components/ModuleSwitch";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import type { XpotMeResponse } from "@/pages/xpot/types";
import DirectScreen from "./DirectScreen";
import HomeScreen from "./HomeScreen";
import PiecesScreen from "./PiecesScreen";
import TagScreen from "./TagScreen";
import { APP_BASE, tagPath } from "./lib";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { AppLayout, MODULE_COLUMN } from "@/components/xpot/AppLayout";
import { TAGS_NAV, TagsTabBar, activeTagsTab } from "./TagsTabBar";
import { ShellHeader } from "@/components/xpot/ShellHeader";
import { XpotMark } from "@/components/xpot/XpotMark";
import { MODULE_HOME } from "@/lib/xpot";
import { SessionGate } from "@/components/xpot/SessionGate";


/** The Tags module: read, sell and write QR/NFC pieces. Mounted at /tags/*. */
export function TagsApp() {
  const t = useT(tagsMessages);
  const [location] = useLocation();
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

  const current = activeTagsTab(location);
  // Every desktop screen uses the full width; only a piece stays narrow, and on
  // desktop it opens beside the pieces table anyway.
  const wide = !location.startsWith(`${APP_BASE}/t/`);

  const currentNav = TAGS_NAV.find((n) => n.href === current) ?? TAGS_NAV[0];
  const pieceCode = location.startsWith(`${APP_BASE}/t/`) ? decodeURIComponent(location.slice(`${APP_BASE}/t/`.length)) : null;

  return (
    <AppLayout
      title={pieceCode ?? t(currentNav.key)}
      wide={wide}
      mobileColumnClassName={MODULE_COLUMN}
      mobileHeader={
        <>
          <ShellHeader module="tags" />
          <div className="mb-4">
            {modules.length > 1 ? (
              <ModuleSwitch current="tags" />
            ) : (
              <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
                <XpotMark />
                Xpot
              </span>
            )}
          </div>
        </>
      }
      mobileNav={<TagsTabBar />}
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
