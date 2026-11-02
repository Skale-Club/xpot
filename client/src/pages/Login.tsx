import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { initSupabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { consumePostLoginRedirect, getXpotHomePath, rememberPostLoginRedirect, signInPath } from "@/lib/xpot";
import { Loader2 } from "@/components/ui/loader";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { SessionGate } from "@/components/xpot/SessionGate";
import { PAGE_GRADIENT } from "@/components/xpot/surface";
import { translate, useT } from "@/i18n";
import { landingMessages } from "@/i18n/messages/landing";
import type { XpotMeResponse } from "./xpot/types";

// /login is a thin OAuth callback handler. The actual sign-in UI lives in the
// landing page dialog (XpotLandingPage). This page:
//   1. Surfaces OAuth errors (?error= from Supabase when user cancels Google),
//      bounces the user back to the landing.
//   2. Detects the Supabase session from the URL (?code= in PKCE flow),
//      exchanges it for an Express session via /api/auth/login, then redirects
//      to /dashboard.
//   3. If the user already has an Express session, just redirects to /dashboard.
//   4. If nothing matches (someone who just typed /login), opens the landing
//      with the sign-in dialog already open; ?next= is kept for after it.

async function getCurrentUser() {
  const response = await fetch("/api/auth/user", { credentials: "include" });
  if (!response.ok) return null;
  return response.json();
}

async function getXpotSession(retryOn401 = true): Promise<{
  ok: boolean;
  status: number;
  data: XpotMeResponse | null;
  message: string | undefined;
  code: string | undefined;
}> {
  const response = await fetch("/api/xpot/me", { credentials: "include" });
  // Defense against a post-login session/cookie propagation race: retry once.
  if (response.status === 401 && retryOn401) {
    await new Promise((r) => setTimeout(r, 300));
    return getXpotSession(false);
  }
  const payload = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    data: response.ok ? (payload as XpotMeResponse) : null,
    message: payload?.message as string | undefined,
    code: payload?.code as string | undefined,
  };
}

function cleanUrl() {
  if (window.location.hash || window.location.search) {
    window.history.replaceState(null, "", window.location.pathname);
  }
}

export default function Login() {
  const [, setLocation] = useLocation();
  const t = useT(landingMessages);
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMsg, setErrorMsg] = useState<string>("");
  // A person who signed in but is not approved (or was turned off): the same screen every module shows.
  const [refusal, setRefusal] = useState<Error | null>(null);

  const goLanding = useCallback(
    (msg?: string) => {
      cleanUrl();
      if (msg) {
        // Pass the error via sessionStorage so the landing dialog can surface it.
        try {
          sessionStorage.setItem("xpot_auth_error", msg);
        } catch {
          // ignore
        }
      }
      // With an error the landing opens the dialog itself; without one, ask for it.
      setLocation(msg ? "/" : signInPath());
    },
    [setLocation],
  );

  const goDashboard = useCallback(async () => {
    const result = await getXpotSession();
    if (!result.ok) {
      if (result.status === 403 && (result.code === "pending" || result.code === "blocked")) {
        setRefusal(Object.assign(new Error(result.message ?? ""), { status: 403, code: result.code }));
        return;
      }
      const reason =
        result.message ||
        (result.status === 403
          ? translate(landingMessages, "accessDisabled")
          : translate(landingMessages, "signInFailed"));
      setErrorMsg(reason);
      setStatus("error");
      setTimeout(() => goLanding(reason), 1500);
      return;
    }
    queryClient.setQueryData(["/api/xpot/me"], result.data);
    cleanUrl();
    // An AI app's authorization waiting on this sign-in wins over the
    // dashboard. Full load: /oauth/authorize is served by the API.
    const pending = consumePostLoginRedirect();
    if (pending) {
      window.location.assign(pending);
      return;
    }
    setLocation(getXpotHomePath());
  }, [goLanding, setLocation]);

  useEffect(() => {
    let mounted = true;

    async function run() {
      // ?next= (the page the person was heading to) survives the sign-in, whichever way it goes.
      rememberPostLoginRedirect();
      // 1. OAuth provider error in URL — user cancelled, Google rejected, etc.
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("error_description") || params.get("error");
      if (oauthError) {
        const decoded = decodeURIComponent(oauthError.replace(/\+/g, " "));
        if (mounted) goLanding(decoded);
        return;
      }

      // 2. Already logged in via Express session — straight to dashboard.
      const existingUser = await getCurrentUser();
      if (!mounted) return;
      if (existingUser) {
        await goDashboard();
        return;
      }

      // 3. Try to exchange an OAuth session from the URL (PKCE: ?code=…).
      try {
        const configResponse = await fetch("/api/supabase-config");
        const config = await configResponse.json();
        const hasSupabase = Boolean(config.url && config.anonKey);
        if (!hasSupabase) {
          if (mounted) goLanding(translate(landingMessages, "authNotConfigured"));
          return;
        }

        const supabase = await initSupabase();
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (!accessToken) {
          // No callback in flight, no session — go back to landing.
          if (mounted) goLanding();
          return;
        }

        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ accessToken }),
        });

        if (!mounted) return;

        if (!loginResponse.ok) {
          const result = await loginResponse.json().catch(() => ({}));
          goLanding(result.message || translate(landingMessages, "signInFailed"));
          return;
        }

        await goDashboard();
      } catch (err: any) {
        if (mounted) goLanding(err?.message || translate(landingMessages, "signInFailed"));
      }
    }

    void run();
    return () => {
      mounted = false;
    };
  }, [goDashboard, goLanding]);

  if (refusal) return <SessionGate error={refusal} />;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 text-white"
      style={{ background: PAGE_GRADIENT }}
    >
      {status === "working" ? (
        <>
          <Loader2 className="h-8 w-8 text-blue-400" />
          <p className="text-sm text-white/40">{t("finishingSignIn")}</p>
        </>
      ) : (
        <InlineAlert tone="error" className="mx-4 max-w-sm">
          {errorMsg}
        </InlineAlert>
      )}
    </div>
  );
}
