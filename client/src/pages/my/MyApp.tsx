import { useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Route, Switch, useLocation } from "wouter";
import { ArrowLeft, LogOut } from "lucide-react";
import { CUSTOMER_PANEL_PATH } from "@shared/customerPanel";
import { AppLoader } from "@/components/ui/spinner";
import { AppBackground } from "@/components/xpot/AppBackground";
import { XpotLogo } from "@/components/xpot/XpotLogo";
import { useT } from "@/i18n";
import { myPlatesMessages } from "@/i18n/messages/myPlates";
import { isSessionQuery, MY_KEYS, MyApiError, myApi } from "./api";
import { PlateDetail } from "./PlateDetail";
import { Plates } from "./Plates";
import { SignIn } from "./SignIn";

// The customer panel (docs/PROFILES_EXECUTION_PLAN.md, F7): a small app of its own at /my for the business that uses
// the plates. It has no team shell, no navigation into the team's screens and no call to /api/xpot. While the server
// has the panel off it shows nothing at all.

function Frame({ children }: { children: ReactNode }) {
  return (
    <AppBackground>
      <main className="relative mx-auto w-full max-w-md px-4 pb-16 pt-[calc(env(safe-area-inset-top)+20px)]">
        {children}
      </main>
    </AppBackground>
  );
}

/** Signed in: the list, or one plate. A 401 anywhere sends the person back to the entry screen. */
function SignedIn({ onSignedOut }: { onSignedOut: () => void }) {
  const t = useT(myPlatesMessages);
  const [location] = useLocation();
  const onList = location === CUSTOMER_PANEL_PATH || location === `${CUSTOMER_PANEL_PATH}/`;

  const signOut = async () => {
    await myApi.signOut().catch(() => undefined);
    onSignedOut();
  };

  return (
    <Frame>
      <header className="mb-4 flex items-center gap-2">
        {!onList && (
          <Link href={CUSTOMER_PANEL_PATH} aria-label={t("back")} className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 active:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          {onList ? <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-white">{t("platesTitle")}</h1> : <XpotLogo className="h-6 w-auto" decorative />}
        </div>
        <button type="button" onClick={() => void signOut()} className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-white/55 hover:text-white" data-testid="my-sign-out">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("signOut")}
        </button>
      </header>
      <Switch>
        <Route path={`${CUSTOMER_PANEL_PATH}/plate/:code`}>{(params) => <PlateDetail code={decodeURIComponent(params.code)} />}</Route>
        <Route><Plates /></Route>
      </Switch>
    </Frame>
  );
}

export default function MyApp() {
  const t = useT(myPlatesMessages);
  const qc = useQueryClient();
  const enabled = useQuery({ queryKey: MY_KEYS.enabled, queryFn: myApi.enabled, staleTime: Infinity });
  const on = enabled.data?.enabled === true;
  // Whether there is a customer session: the list answers 401 when there is not.
  const session = useQuery({ queryKey: MY_KEYS.pieces, queryFn: myApi.pieces, enabled: on, staleTime: 30_000 });

  useEffect(() => {
    // Not for search engines, whatever the server's head says.
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  if (enabled.isLoading || (on && session.isLoading)) return <AppLoader />;
  // Off (or unreachable): there is nothing to show and nothing to say about why.
  if (!on) return null;

  const signedOut = session.error instanceof MyApiError && session.error.status === 401;
  if (signedOut || (!session.data && !session.error)) {
    return (
      <Frame>
        <div className="mb-8 flex justify-center"><XpotLogo className="h-8 w-auto" /></div>
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-white">{t("signInTitle")}</h1>
        <p className="mb-6 mt-2 text-sm text-white/60">{t("signInSub")}</p>
        <SignIn onSignedIn={() => qc.resetQueries({ predicate: isSessionQuery })} />
      </Frame>
    );
  }
  return <SignedIn onSignedOut={() => void qc.resetQueries({ predicate: isSessionQuery })} />;
}
