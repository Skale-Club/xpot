import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { initSupabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { getXpotHomePath } from "@/lib/xpot";
import { Loader2 } from "@/components/ui/loader";
import type { XpotMeResponse } from "./xpot/types";

// /login is a thin OAuth callback handler. The actual sign-in UI lives in the
// landing page dialog (XpotLandingPage). This page:
//   1. Surfaces OAuth errors (?error= from Supabase when user cancels Google),
//      bounces the user back to the landing.
//   2. Detects the Supabase session from the URL (?code= in PKCE flow),
//      exchanges it for an Express session via /api/auth/login, then redirects
//      to /dashboard.
//   3. If the user already has an Express session, just redirects to /dashboard.
//   4. If nothing matches, bounces back to / (landing) where the dialog awaits.

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
  };
}

function cleanUrl() {
  if (window.location.hash || window.location.search) {
    window.history.replaceState(null, "", window.location.pathname);
  }
}

export default function Login() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMsg, setErrorMsg] = useState<string>("");

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
      setLocation("/");
    },
    [setLocation],
  );

  const goDashboard = useCallback(async () => {
    const result = await getXpotSession();
    if (!result.ok) {
      const reason =
        result.message ||
        (result.status === 403
          ? "Your Xpot access is disabled."
          : "Sign-in failed. Please try again.");
      setErrorMsg(reason);
      setStatus("error");
      setTimeout(() => goLanding(reason), 1500);
      return;
    }
    queryClient.setQueryData(["/api/xpot/me"], result.data);
    cleanUrl();
    setLocation(getXpotHomePath());
  }, [goLanding, setLocation]);

  useEffect(() => {
    let mounted = true;

    async function run() {
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
          if (mounted) goLanding("Authentication is not configured.");
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
          goLanding(result.message || "Sign-in failed. Please try again.");
          return;
        }

        await goDashboard();
      } catch (err: any) {
        if (mounted) goLanding(err?.message || "Sign-in failed. Please try again.");
      }
    }

    void run();
    return () => {
      mounted = false;
    };
  }, [goDashboard, goLanding]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 text-white"
      style={{ background: "linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%)" }}
    >
      {status === "working" ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm text-white/40">Finishing sign-in…</p>
        </>
      ) : (
        <p className="max-w-sm rounded-md bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
