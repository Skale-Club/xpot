import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MapPinned, 
  Mic, 
  RefreshCw, 
  DollarSign, 
  ArrowRight, 
  ArrowLeft,
  ShieldCheck, 
  Zap, 
  Phone, 
  Mail, 
  Lock,
  Loader2,
  ChevronRight,
  Sparkles,
  UserCheck,
  Building2
} from "lucide-react";
import { initSupabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { getXpotHomePath, getXpotLoginPath } from "@/lib/xpot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

async function getXpotSession(retryOn401 = true): Promise<{
  ok: boolean;
  status: number;
  data: any;
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
    data: response.ok ? payload : null,
    message: payload?.message,
  };
}

export function XpotLandingPage() {
  const [, setLocation] = useLocation();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [isSupabaseAuth, setIsSupabaseAuth] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeFormTab, setActiveFormTab] = useState<"signin" | "signup">("signin");
  const [authStep, setAuthStep] = useState<1 | 2>(1);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Inline Google "G" logo — no external host, no hotlink risk.
  const GoogleLogo = (
    <svg
      className="h-5 w-5 shrink-0"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailRegex.test(email.trim());

  const resetAuthFlow = useCallback(() => {
    setAuthStep(1);
    setPassword("");
    setError("");
  }, []);

  const handleDialogChange = (open: boolean) => {
    setIsLoginOpen(open);
    if (!open) {
      resetAuthFlow();
    }
  };

  const handleTabChange = (tab: "signin" | "signup") => {
    setActiveFormTab(tab);
    resetAuthFlow();
  };

  const handleContinueToPassword = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isEmailValid) {
      setError("Please enter a valid email address.");
      return;
    }
    setAuthStep(2);
  };

  const handleBackToEmail = () => {
    setAuthStep(1);
    setPassword("");
    setError("");
  };

  useEffect(() => {
    if (authStep === 2) {
      const timer = setTimeout(() => passwordInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [authStep]);

  const { data: me } = useQuery<any>({
    queryKey: ["/api/xpot/me"],
    retry: false,
  });

  const openXpotWorkspace = useCallback(async () => {
    const result = await getXpotSession();
    if (!result.ok) {
      setError(result.message || "Access denied or failed to retrieve session.");
      return false;
    }
    queryClient.setQueryData(["/api/xpot/me"], result.data);
    setLocation(getXpotHomePath());
    setIsLoginOpen(false);
    return true;
  }, [setLocation]);

  useEffect(() => {
    // If /login bounced us back here with an auth error stashed in
    // sessionStorage (cancelled Google flow, expired session, etc.) — surface
    // it and open the dialog so the user can retry without hunting for a button.
    try {
      const stashed = sessionStorage.getItem("xpot_auth_error");
      if (stashed) {
        sessionStorage.removeItem("xpot_auth_error");
        setError(stashed);
        setIsLoginOpen(true);
      }
    } catch {
      // sessionStorage can throw in private mode — ignore.
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function checkAuthSettings() {
      try {
        const response = await fetch("/api/supabase-config");
        const config = await response.json();
        if (mounted) {
          setIsSupabaseAuth(Boolean(config.url && config.anonKey));
          setIsInitializing(false);
        }
      } catch {
        if (mounted) setIsInitializing(false);
      }
    }
    void checkAuthSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (!isSupabaseAuth) {
        throw new Error("Supabase Auth is not configured.");
      }

      const supabase = await initSupabase();
      
      if (activeFormTab === "signin") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;

        const accessToken = data.session?.access_token;
        if (!accessToken) throw new Error("No access token returned.");

        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ accessToken }),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => ({ message: "Server error" }));
          throw new Error(result.message || "Failed to authenticate with server");
        }

        await openXpotWorkspace();
      } else {
        // Sign up flow
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: "Rep",
              last_name: "",
            }
          }
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          const accessToken = data.session.access_token;
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ accessToken }),
          });
          if (response.ok) {
            await openXpotWorkspace();
          } else {
            setError("Account created, please sign in manually.");
            setActiveFormTab("signin");
          }
        } else {
          setError("Please check your email to confirm registration, then sign in.");
          setActiveFormTab("signin");
        }
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleSubmitting(true);

    try {
      if (!isSupabaseAuth) {
        throw new Error("Supabase Auth is not configured.");
      }
      const supabase = await initSupabase();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${getXpotLoginPath()}` },
      });
      if (oauthError) throw oauthError;
    } catch (loginError: any) {
      setError(loginError.message || "OAuth login error");
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white selection:bg-blue-500/30" style={{ background: "linear-gradient(160deg, #05070f 0%, #080c18 50%, #040810 100%)" }}>
      {/* Background Grid Pattern */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{ 
          backgroundImage: `
            radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0),
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
          `, 
          backgroundSize: "32px 32px, 64px 64px, 64px 64px" 
        }}
      />
      
      {/* Decorative Glow Elements */}
      <div className="absolute left-1/4 top-0 -z-10 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[130px]" />
      <div className="absolute right-1/4 top-1/3 -z-10 h-[600px] w-[600px] rounded-full bg-indigo-500/5 blur-[150px]" />

      {/* Header Container */}
      <header className="mx-auto max-w-7xl px-6 lg:px-8 py-6 flex items-center justify-between border-b border-white/5 bg-[#05070f]/40 backdrop-blur-md sticky top-0 z-40">
        <button onClick={() => setLocation(me ? "/dashboard" : "/")} className="flex items-center gap-2.5">
          <img src="/api/branding/favicon" alt="Xpot" className="h-8 w-8 rounded-xl object-cover" />
          <span className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">Xpot</span>
        </button>

        {me ? (
          <Button 
            onClick={() => setLocation("/dashboard")} 
            variant="ghost" 
            size="sm" 
            className="rounded-xl border border-blue-500/30 bg-blue-500/10 text-sm font-semibold text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-all flex items-center gap-1.5 px-4 py-2"
          >
            Dashboard
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Dialog open={isLoginOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all px-4 py-2">
                Sign In
              </Button>
            </DialogTrigger>
            
            {/* Dynamic & Premium Dialog Content */}
            <DialogContent className="w-[92%] max-w-md border-white/10 bg-[#070b16]/95 text-white backdrop-blur-2xl rounded-2xl p-6 sm:p-8 shadow-[0_0_40px_rgba(0,0,0,0.8)] overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500" />
              
              <DialogHeader className="text-center sm:text-center pb-4">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
                  <img src="/api/branding/favicon" alt="Xpot" className="h-full w-full object-cover" />
                </div>
                <DialogTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-white text-center">
                  Welcome to Xpot
                </DialogTitle>
                <DialogDescription className="text-white/60 text-base mt-2 text-center">
                  Access your intelligent field sales workspace
                </DialogDescription>
              </DialogHeader>

              {isInitializing ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
                  <p className="text-base text-white/40">Initializing secure session...</p>
                </div>
              ) : !isSupabaseAuth ? (
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-base text-white/60 text-center">
                  Supabase authentication credentials are not configured on the server.
                </div>
              ) : (
                <>
                  {/* Tab selector — only on step 1 */}
                  {authStep === 1 && (
                    <div className="grid grid-cols-2 p-1 bg-white/5 border border-white/5 rounded-xl mb-4">
                      <button
                        type="button"
                        onClick={() => handleTabChange("signin")}
                        className={`py-2 text-sm font-semibold rounded-lg transition-all ${
                          activeFormTab === "signin"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-white/55 hover:text-white/80"
                        }`}
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTabChange("signup")}
                        className={`py-2 text-sm font-semibold rounded-lg transition-all ${
                          activeFormTab === "signup"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-white/55 hover:text-white/80"
                        }`}
                      >
                        Register
                      </button>
                    </div>
                  )}

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${activeFormTab}-${authStep}`}
                      initial={{ opacity: 0, x: authStep === 1 ? -20 : 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: authStep === 1 ? 20 : -20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      {error && (
                        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-base text-red-400 text-center">
                          {error}
                        </div>
                      )}

                      {authStep === 1 ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleGoogleLogin}
                            disabled={googleSubmitting}
                            className="h-12 w-full rounded-xl border-white/10 bg-white/5 text-base font-semibold text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-2.5"
                          >
                            {googleSubmitting ? (
                              <Loader2 className="h-5 w-5 animate-spin text-white" />
                            ) : (
                              GoogleLogo
                            )}
                            Continue with Google
                          </Button>

                          <div className="flex items-center gap-3 py-1">
                            <div className="h-px flex-1 bg-white/5" />
                            <div className="text-xs uppercase tracking-wider text-white/40 font-medium">or continue with email</div>
                            <div className="h-px flex-1 bg-white/5" />
                          </div>

                          <form onSubmit={handleContinueToPassword} className="space-y-3.5">
                            <div className="space-y-2">
                              <Label htmlFor="login-email" className="text-base font-medium text-white/80">Email address</Label>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                                <Input
                                  id="login-email"
                                  type="email"
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value)}
                                  placeholder="rep@example.com"
                                  className="h-12 rounded-xl border-white/10 bg-white/5 pl-10 text-base text-white placeholder:text-white/30 focus:border-blue-500/50 focus:bg-white/10 transition-all"
                                  autoFocus
                                  required
                                />
                              </div>
                            </div>

                            <Button
                              type="submit"
                              disabled={!isEmailValid}
                              className="h-12 w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-base font-semibold text-white transition-all shadow-[0_4px_15px_rgba(37,99,235,0.3)] mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              Continue
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </form>
                        </>
                      ) : (
                        <form onSubmit={handleEmailAuth} className="space-y-3.5">
                          <button
                            type="button"
                            onClick={handleBackToEmail}
                            className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors group"
                          >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                            <span className="truncate max-w-[220px]">{email}</span>
                          </button>

                          <div className="space-y-1.5">
                            <Label htmlFor="login-password" className="text-sm font-medium text-white/80">
                              {activeFormTab === "signin" ? "Enter your password" : "Create a password"}
                            </Label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                              <Input
                                ref={passwordInputRef}
                                id="login-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="h-11 rounded-xl border-white/10 bg-white/5 pl-10 text-sm text-white placeholder:text-white/30 focus:border-blue-500/50 focus:bg-white/10 transition-all"
                                required
                              />
                            </div>
                          </div>

                          <Button type="submit" disabled={submitting} className="h-12 w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-all shadow-[0_4px_15px_rgba(37,99,235,0.3)] mt-2">
                            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : null}
                            {activeFormTab === "signin" ? "Sign In to Workspace" : "Create Account"}
                          </Button>
                        </form>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </>
              )}
            </DialogContent>
          </Dialog>
        )}
      </header>

      {/* Main Container - Fully Responsive & Wide Layout */}
      <main className="mx-auto max-w-7xl px-6 lg:px-8 py-12 sm:py-16 lg:py-24 space-y-24">
        
        {/* Responsive Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Hero Left Column (Full width on mobile, 7/12 on Desktop) */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-blue-400 backdrop-blur-md"
            >
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-400 animate-pulse" />
              Intelligent & Mobile-First Companion
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] text-white"
            >
              Field Sales <br />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm">
                Reinvented with AI
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-white/60 text-base sm:text-lg lg:text-xl leading-relaxed max-w-2xl mx-auto lg:mx-0"
            >
              Streamline field sales operations. Enable reps to perform GPS-validated check-ins, record post-visit voice notes automatically analyzed by AI, and keep your pipeline fully synced in real time.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="pt-2 flex flex-col sm:flex-row justify-center lg:justify-start gap-3.5"
            >
              {me ? (
                <Button 
                  onClick={() => setLocation("/dashboard")}
                  className="h-12 px-7 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center gap-2 group"
                >
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              ) : (
                <Button 
                  onClick={() => setIsLoginOpen(true)}
                  className="h-12 px-7 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center gap-2 group"
                >
                  Get Started for Free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => {
                  const el = document.getElementById("features");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
                className="h-12 px-7 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-sm font-semibold text-white transition-all"
              >
                Explore Features
              </Button>
            </motion.div>
          </div>

          {/* Hero Right Column (App Mockup, wide layout on desktop) */}
          <div className="lg:col-span-5 relative w-full max-w-md lg:max-w-none mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-transparent p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-500 hover:scale-[1.01]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-500/10 opacity-30" />
              <div className="relative rounded-xl border border-white/5 bg-[#080d19] p-4 sm:p-5 space-y-4">
                
                {/* Mockup Header */}
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-6.5 w-6.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <MapPinned className="h-3.5 w-3.5 text-blue-500" />
                    </div>
                    <span className="text-xs font-bold text-white/50 tracking-wider uppercase">Valkyrie Client</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[11px] text-green-400 font-semibold tracking-wide">Live GPS</span>
                  </div>
                </div>

                {/* Mock stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <div className="text-xs text-white/40 font-medium">Field Visits Today</div>
                    <div className="text-2xl font-bold mt-1 text-white">12</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <div className="text-xs text-white/40 font-medium">Sync Success Rate</div>
                    <div className="text-2xl font-bold mt-1 text-blue-400">98%</div>
                  </div>
                </div>

                {/* Fake visit row */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-bold text-white">Check-in Success</div>
                    <span className="text-[10px] bg-green-500/20 border border-green-500/30 text-green-400 px-1.5 py-0.5 rounded-full font-semibold">Verified Location</span>
                  </div>
                  <p className="text-xs text-white/70 leading-normal">
                    Target: <span className="font-semibold text-white">Cafe Bistro Local</span> — Within Geofence radius (42 meters from center)
                  </p>
                  
                  {/* Voice transcript preview */}
                  <div className="rounded-lg bg-black/40 p-2.5 flex items-start gap-2.5 border border-white/5">
                    <Mic className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs italic text-white/70 leading-relaxed">
                      "Meeting was very successful. Walked them through the new product lineup. They had minor pricing objections but requested a follow-up call on Monday..."
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Responsive Features Grid */}
        <div id="features" className="space-y-12 scroll-mt-24">
          <div className="text-center space-y-3 max-w-xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Built for Field Sales Efficiency</h2>
            <p className="text-base text-white/50">
              Ditch the clunky back-office workflows. Everything is automated instantly, directly from the road.
            </p>
          </div>
          
          {/* Responsive 3-Column Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Feature 1 */}
            <div className="flex flex-col gap-4 items-start rounded-2xl border border-white/5 bg-white/5 p-6 hover:border-white/10 hover:bg-white/[0.07] transition-all group">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Mic className="h-5 w-5 text-blue-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">🎙️ Voice Notes via AI</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  Record short voice memos directly inside the app after a visit. The AI transcribes the text, outputs summary notes, outlines objections, and tags competitor mentions.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col gap-4 items-start rounded-2xl border border-white/5 bg-white/5 p-6 hover:border-white/10 hover:bg-white/[0.07] transition-all group">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <MapPinned className="h-5 w-5 text-blue-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">📍 GPS validation & Geofence</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  Prevent false activity logs. Representatives must be physically present inside the designated geofence radius (e.g. 150 meters) of the client's coordinate to check in.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col gap-4 items-start rounded-2xl border border-white/5 bg-white/5 p-6 hover:border-white/10 hover:bg-white/[0.07] transition-all group">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <RefreshCw className="h-5 w-5 text-blue-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">🔄 Bidirectional Pipelines</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  Synchronize pipeline updates, newly generated contacts, follow-up tasks, and visit notes to your CRM automatically in a non-blocking background queue.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action Banner - Wide & Beautiful on Desktop */}
        <div className="relative rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/20 via-indigo-950/20 to-blue-950/20 p-8 sm:p-12 text-center space-y-6 backdrop-blur-md overflow-hidden max-w-5xl mx-auto shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 h-64 w-64 rounded-full bg-blue-500/10 blur-[80px]" />
          
          <Zap className="h-8 w-8 text-blue-400 mx-auto" />
          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">Boost Your Team's Field Efficiency</h3>
          <p className="text-sm sm:text-base lg:text-lg text-white/60 leading-relaxed max-w-xl mx-auto">
            Eliminate complex workflows, manual reports, and tedious follow-up typing. Give your sales representatives the lightweight companion they deserve.
          </p>
          
          <div className="pt-2 max-w-xs mx-auto">
            {me ? (
              <Button 
                onClick={() => setLocation("/dashboard")}
                className="w-full h-12 rounded-xl bg-white text-black font-semibold hover:bg-white/95 text-sm transition-all flex items-center justify-center gap-2"
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button 
                onClick={() => setIsLoginOpen(true)}
                className="w-full h-12 rounded-xl bg-white text-black font-semibold hover:bg-white/95 text-sm transition-all"
              >
                Access the App
              </Button>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-12 text-center text-sm text-white/30 space-y-3">
        <p className="font-semibold text-white/40">Xpot | Field Sales Companion</p>
        <p>© 2026 Xpot. All rights reserved.</p>
        <p className="flex justify-center gap-4 text-xs">
          <a href="#" className="hover:text-white/60 transition-colors">Privacy Policy</a>
          <span>•</span>
          <a href="#" className="hover:text-white/60 transition-colors">Terms of Service</a>
        </p>
      </footer>
    </div>
  );
}
