import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Mail, MapPinned, Lock } from "lucide-react";
import { initSupabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { getXpotHomePath, getXpotLoginPath } from "@/lib/xpot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "@/components/ui/loader";
import type { XpotMeResponse } from "./xpot/types";

async function getCurrentUser() {
  const response = await fetch("/api/auth/user", { credentials: "include" });
  if (!response.ok) return null;
  return response.json();
}

async function getXpotSession() {
  const response = await fetch("/api/xpot/me", { credentials: "include" });
  const payload = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    data: response.ok ? (payload as XpotMeResponse) : null,
    message: payload?.message as string | undefined,
  };
}

function getXpotSessionErrorMessage(status: number, message?: string) {
  if (message) return message;
  if (status === 403) return "Your Xpot access is disabled.";
  if (status >= 500) return "Xpot is temporarily unavailable. Please try again in a moment.";
  return "Sign-in failed. Please try again.";
}

export default function Login() {
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [isSupabaseAuth, setIsSupabaseAuth] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const googleLogoUrl = "https://commons.wikimedia.org/wiki/Special:FilePath/Google_Favicon_2025.svg";

  const openXpotWorkspace = useCallback(async () => {
    const result = await getXpotSession();
    if (!result.ok) {
      setError(getXpotSessionErrorMessage(result.status, result.message));
      return false;
    }
    queryClient.setQueryData(["/api/xpot/me"], result.data);
    setLocation(getXpotHomePath());
    return true;
  }, [setLocation]);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const response = await fetch("/api/supabase-config");
        const config = await response.json();
        const hasSupabase = Boolean(config.url && config.anonKey);

        const user = await getCurrentUser();
        if (mounted && user) {
          await openXpotWorkspace();
          return;
        }

        if (mounted) {
          setIsSupabaseAuth(hasSupabase);
          setIsInitializing(false);
        }

        // After Google OAuth redirect, Supabase sets a session from the URL hash —
        // exchange it for an Express session immediately.
        if (hasSupabase) {
          try {
            const supabase = await initSupabase();
            const { data } = await supabase.auth.getSession();
            const accessToken = data.session?.access_token;

            if (accessToken) {
              const loginResponse = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ accessToken }),
              });

              if (mounted && loginResponse.ok) {
                await openXpotWorkspace();
              } else if (mounted) {
                const result = await loginResponse.json().catch(() => ({}));
                setError(result.message || "Sign-in failed. Please try again.");
              }
            }
          } catch (err: any) {
            if (mounted) setError(err.message || "Sign-in failed. Please try again.");
          }
        }
      } catch {
        if (mounted) setIsInitializing(false);
      }
    }

    void initialize();
    return () => {
      mounted = false;
    };
  }, [openXpotWorkspace]);

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (!isSupabaseAuth) {
        setError("Supabase auth is not configured. Set SUPABASE_URL + SUPABASE_ANON_KEY.");
        return;
      }

      const supabase = await initSupabase();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("No access token returned");

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({ message: "Login failed" }));
        throw new Error(result.message || "Login failed");
      }

      await openXpotWorkspace();
    } catch (loginError: any) {
      setError(loginError.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleSubmitting(true);

    try {
      if (!isSupabaseAuth) {
        setError("Supabase auth is not configured.");
        return;
      }
      const supabase = await initSupabase();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${getXpotLoginPath()}` },
      });
      if (oauthError) throw oauthError;
    } catch (loginError: any) {
      setError(loginError.message || "Login failed");
      setGoogleSubmitting(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white" style={{ background: "linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%)" }}>
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen px-4 flex flex-col items-center justify-center text-white" style={{ background: "linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%)" }}>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />
      <div className="w-full max-w-md">
        <Card className="w-full rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="px-5 pb-4 pt-7 text-center md:px-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
              <MapPinned className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl leading-none tracking-tight text-card-foreground">
              Xpot
            </CardTitle>
            <CardDescription className="pt-2 text-base text-muted-foreground">
              Sign in to access your field sales workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-7 md:px-6">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>
            )}

            {isSupabaseAuth ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleLogin}
                  disabled={googleSubmitting}
                  className="h-12 w-full"
                >
                  {googleSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <img src={googleLogoUrl} alt="" aria-hidden="true" className="mr-2 h-4 w-4" />
                  )}
                  Continue with Google
                </Button>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">or continue with</div>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={handleEmailLogin} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="xpot-email" className="text-base font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="xpot-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="rep@example.com"
                        className="h-12 bg-background pl-10 text-base"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="xpot-password" className="text-base font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="xpot-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="*****"
                        className="h-12 bg-background pl-10 text-base"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={submitting} className="h-12 w-full">
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Sign In
                  </Button>
                </form>
              </>
            ) : (
              <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground text-center">
                Supabase Auth is not configured. Set <code>SUPABASE_URL</code> and{" "}
                <code>SUPABASE_ANON_KEY</code> on the server.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
