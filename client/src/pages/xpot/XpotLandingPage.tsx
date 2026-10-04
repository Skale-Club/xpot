import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  MapPinned, 
  Mic, 
  RefreshCw, 
  DollarSign, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Phone, 
  Loader2,
  ChevronRight,
  Sparkles,
  UserCheck,
  Building2
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { getXpotHomePath } from "@/lib/xpot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LanguagePicker } from "@/components/LanguagePicker";
import { PhoneSignIn } from "@/components/PhoneSignIn";
import { translate, useT } from "@/i18n";
import { landingMessages } from "@/i18n/messages/landing";

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
  const t = useT(landingMessages);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [error, setError] = useState("");

  const handleDialogChange = (open: boolean) => {
    setIsLoginOpen(open);
    if (!open) setError("");
  };

  const { data: me } = useQuery<any>({
    queryKey: ["/api/xpot/me"],
    retry: false,
  });

  const openXpotWorkspace = useCallback(async () => {
    const result = await getXpotSession();
    if (!result.ok) {
      setError(result.message || translate(landingMessages, "sessionDenied"));
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

        <div className="flex items-center gap-2">
          <LanguagePicker compact />
          {me ? (
            <Button 
              onClick={() => setLocation("/dashboard")} 
              variant="ghost" 
              size="sm" 
              className="rounded-xl border border-blue-500/30 bg-blue-500/10 text-sm font-semibold text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-all flex items-center gap-1.5 px-4 py-2"
            >
              {t("dashboard")}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Dialog open={isLoginOpen} onOpenChange={handleDialogChange}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all px-4 py-2">
                  {t("signIn")}
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
                    {t("welcomeTitle")}
                  </DialogTitle>
                  <DialogDescription className="text-white/60 text-base mt-2 text-center">
                    {t("welcomeSub")}
                  </DialogDescription>
                </DialogHeader>

                {error && (
                  <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-300">{error}</div>
                )}
                <PhoneSignIn onSignedIn={openXpotWorkspace} />
              </DialogContent>
            </Dialog>
          )}
        </div>
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
              {t("heroBadge")}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] text-white"
            >
              {t("heroTitleLine1")} <br />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm">
                {t("heroTitleLine2")}
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-white/60 text-base sm:text-lg lg:text-xl leading-relaxed max-w-2xl mx-auto lg:mx-0"
            >
              {t("heroSub")}
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
                  {t("goToDashboard")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              ) : (
                <Button 
                  onClick={() => setIsLoginOpen(true)}
                  className="h-12 px-7 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center gap-2 group"
                >
                  {t("getStarted")}
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
                {t("exploreFeatures")}
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
                    <span className="text-xs font-bold text-white/50 tracking-wider uppercase">{t("mockClient")}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[11px] text-green-400 font-semibold tracking-wide">{t("mockLiveGps")}</span>
                  </div>
                </div>

                {/* Mock stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <div className="text-xs text-white/40 font-medium">{t("mockVisitsToday")}</div>
                    <div className="text-2xl font-bold mt-1 text-white">12</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <div className="text-xs text-white/40 font-medium">{t("mockSyncRate")}</div>
                    <div className="text-2xl font-bold mt-1 text-blue-400">98%</div>
                  </div>
                </div>

                {/* Fake visit row */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-bold text-white">{t("mockCheckInSuccess")}</div>
                    <span className="text-[10px] bg-green-500/20 border border-green-500/30 text-green-400 px-1.5 py-0.5 rounded-full font-semibold">{t("mockVerified")}</span>
                  </div>
                  <p className="text-xs text-white/70 leading-normal">
                    {t("mockTarget")} <span className="font-semibold text-white">Cafe Bistro Local</span> {t("mockGeofence")}
                  </p>
                  
                  {/* Voice transcript preview */}
                  <div className="rounded-lg bg-black/40 p-2.5 flex items-start gap-2.5 border border-white/5">
                    <Mic className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs italic text-white/70 leading-relaxed">
                      {t("mockQuote")}
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
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{t("featuresTitle")}</h2>
            <p className="text-base text-white/50">
              {t("featuresSub")}
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
                <h3 className="text-base font-bold text-white">{t("feature1Title")}</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  {t("feature1Body")}
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col gap-4 items-start rounded-2xl border border-white/5 bg-white/5 p-6 hover:border-white/10 hover:bg-white/[0.07] transition-all group">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <MapPinned className="h-5 w-5 text-blue-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">{t("feature2Title")}</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  {t("feature2Body")}
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col gap-4 items-start rounded-2xl border border-white/5 bg-white/5 p-6 hover:border-white/10 hover:bg-white/[0.07] transition-all group">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <RefreshCw className="h-5 w-5 text-blue-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">{t("feature3Title")}</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  {t("feature3Body")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action Banner - Wide & Beautiful on Desktop */}
        <div className="relative rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/20 via-indigo-950/20 to-blue-950/20 p-8 sm:p-12 text-center space-y-6 backdrop-blur-md overflow-hidden max-w-5xl mx-auto shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 h-64 w-64 rounded-full bg-blue-500/10 blur-[80px]" />
          
          <Zap className="h-8 w-8 text-blue-400 mx-auto" />
          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">{t("ctaTitle")}</h3>
          <p className="text-sm sm:text-base lg:text-lg text-white/60 leading-relaxed max-w-xl mx-auto">
            {t("ctaBody")}
          </p>
          
          <div className="pt-2 max-w-xs mx-auto">
            {me ? (
              <Button 
                onClick={() => setLocation("/dashboard")}
                className="w-full h-12 rounded-xl bg-white text-black font-semibold hover:bg-white/95 text-sm transition-all flex items-center justify-center gap-2"
              >
                {t("goToDashboard")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button 
                onClick={() => setIsLoginOpen(true)}
                className="w-full h-12 rounded-xl bg-white text-black font-semibold hover:bg-white/95 text-sm transition-all"
              >
                {t("accessApp")}
              </Button>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-12 text-center text-sm text-white/30 space-y-3">
        <p className="font-semibold text-white/40">{t("footerTagline")}</p>
        <p>{t("footerRights")}</p>
        <p className="flex justify-center gap-4 text-xs">
          <a href="#" className="hover:text-white/60 transition-colors">{t("privacyPolicy")}</a>
          <span>•</span>
          <a href="#" className="hover:text-white/60 transition-colors">{t("termsOfService")}</a>
        </p>
      </footer>
    </div>
  );
}
