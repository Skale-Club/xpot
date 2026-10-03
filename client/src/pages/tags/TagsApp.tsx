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
import { APP_BASE } from "./lib";

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

  useEffect(() => {
    document.title = "Xpot · Tags";
  }, []);
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

  return (
    <div className="min-h-screen text-white" style={{ background: "linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%)" }}>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-28" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
        <div className="mb-5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {modules.length > 1 ? <ModuleSwitch current="tags" /> : <span className="text-lg font-extrabold tracking-tight text-white">Xpot</span>}
          </div>
          <LanguagePicker compact />
        </div>

        <main className="flex-1">
          <Switch>
            <Route path={`${APP_BASE}/t/:code`}>{(params) => <TagScreen key={params.code} code={decodeURIComponent(params.code)} />}</Route>
            <Route path={`${APP_BASE}/pieces`} component={PiecesScreen} />
            <Route path={`${APP_BASE}/direct`} component={DirectScreen} />
            <Route path={APP_BASE} component={HomeScreen} />
            <Route>
              <Redirect to={APP_BASE} />
            </Route>
          </Switch>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pt-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
          <div
            className="mx-auto flex max-w-md items-center gap-1 rounded-2xl border border-white/10 px-2 py-1.5"
            style={{ background: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(20px)" }}
          >
            {NAV.map(({ href, key, icon: Icon }) => {
              const isActive = current === href;
              return (
                <button
                  key={href}
                  type="button"
                  onClick={() => navigate(href)}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  data-testid={`tags-nav-${key}`}
                  className={`relative flex min-w-0 flex-1 touch-manipulation flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-all ${
                    isActive ? "text-white" : "text-white/35 hover:text-white/60"
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute inset-0 rounded-xl"
                      style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.25) 0%, rgba(99,102,241,0.25) 100%)" }}
                    />
                  )}
                  <Icon className={`relative h-[18px] w-[18px] ${isActive ? "drop-shadow-[0_0_6px_rgba(99,102,241,0.8)]" : ""}`} />
                  <span className="relative truncate">{t(key)}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
