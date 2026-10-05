import { useState, useCallback, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MotionConfig, motion } from "framer-motion";
import {
  ArrowRight,
  Boxes,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  Command,
  DollarSign,
  MapPinned,
  Mic,
  Nfc,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { consumePostLoginRedirect, getXpotHomePath, rememberPostLoginRedirect } from "@/lib/xpot";
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

type LandingT = ReturnType<typeof useT<(typeof landingMessages)["en"]>>;

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

/** Fades a section in once it scrolls into view (skipped with reduced motion). */
function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 text-center">
      <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
      <p className="text-base text-white/55">{sub}</p>
    </div>
  );
}

// ─── Product mockups (drawn with the app's own look, no screenshots) ─────────

function PhoneMock({ t }: { t: LandingT }) {
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div className="pointer-events-none absolute -inset-8 rounded-[48px] bg-blue-500/10 blur-3xl" />
      <div className="relative rounded-[40px] border border-white/10 bg-[#0b1020] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-white/10" />
        <div className="space-y-3 rounded-[30px] bg-[#070b16] p-4">
          {/* Active visit */}
          <div className="space-y-3 rounded-2xl border border-indigo-400/25 p-4" style={{ background: "linear-gradient(160deg, rgba(59,130,246,0.15), rgba(99,102,241,0.08))" }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300/80">{t("mockVisit")}</span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t("mockAtDoor")}
              </span>
            </div>
            <div className="text-center text-4xl font-extrabold tabular-nums tracking-tight text-white">12:48</div>
            <div className="flex items-center gap-3 rounded-xl bg-black/25 p-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
                <Building2 className="h-4 w-4 text-indigo-300" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">Bean &amp; Barrel Café</div>
                <div className="truncate text-[11px] text-white/40">1810 N Franklin St · Tampa</div>
              </div>
            </div>
          </div>

          {/* Voice note */}
          <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-white/50">
              <Mic className="h-3.5 w-3.5 text-blue-300" />
              {t("mockVoice")}
            </div>
            <p className="text-xs italic leading-relaxed text-white/70">{t("mockQuote")}</p>
          </div>

          {/* Proposed actions */}
          <div className="space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              {t("mockAiFound")}
            </div>
            {[
              { icon: DollarSign, label: t("mockActionSale"), value: "$174.00" },
              { icon: Clock3, label: t("mockActionFollowUp"), value: "" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2.5 rounded-xl bg-black/25 px-3 py-2">
                <Icon className="h-3.5 w-3.5 shrink-0 text-white/50" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/85">{label}</span>
                {value && <span className="text-xs font-semibold tabular-nums text-emerald-300">{value}</span>}
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300" aria-label={t("mockConfirm")}>
                  <Check className="h-3.5 w-3.5" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const DESK_ROWS = [
  { name: "Bean & Barrel Café", city: "Tampa, FL", sold: "$282.00", active: true },
  { name: "Lakeside Grind Coffee", city: "Orlando, FL", sold: "$463.00" },
  { name: "Fade Masters Barbershop", city: "Orlando, FL", sold: "$144.00" },
  { name: "Thornton Park Dental", city: "Orlando, FL", sold: "—" },
  { name: "Ybor Cuts & Shaves", city: "Tampa, FL", sold: "$96.00" },
];

function DesktopMock({ t }: { t: LandingT }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#070b16] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
      {/* Window bar */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-white/35">
          <Command className="h-3 w-3" /> K
        </span>
      </div>
      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-12 shrink-0 space-y-1 border-r border-white/[0.06] p-2 sm:block">
          {[MapPinned, Building2, DollarSign, Nfc].map((Icon, i) => (
            <div key={i} className={`flex items-center justify-center rounded-lg py-1.5 ${i === 1 ? "bg-blue-500/15" : ""}`}>
              <Icon className={`h-3.5 w-3.5 ${i === 1 ? "text-blue-300" : "text-white/30"}`} />
            </div>
          ))}
        </div>
        {/* Table */}
        <div className="min-w-0 flex-1 p-3">
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            <span>{t("mockDeskLeads")}</span>
            <span>{t("mockDeskSold")}</span>
          </div>
          <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07]">
            {DESK_ROWS.map((row) => (
              <div key={row.name} className={`flex items-center gap-2.5 px-3 py-2 ${row.active ? "bg-blue-500/[0.12]" : ""}`}>
                <span className="h-6 w-6 shrink-0 rounded-md border border-indigo-500/20 bg-indigo-500/10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-white/85">{row.name}</div>
                  <div className="truncate text-[10px] text-white/35">{row.city}</div>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-emerald-300/85">{row.sold}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Detail pane */}
        <div className="hidden w-44 shrink-0 space-y-2.5 border-l border-white/[0.06] p-3 md:block">
          <div className="text-[11px] font-bold text-white">Bean &amp; Barrel Café</div>
          <div className="h-1.5 w-24 rounded-full bg-white/15" />
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] p-2">
              <div className="text-[11px] font-bold text-emerald-300">$282</div>
              <div className="mt-1 h-1 w-8 rounded-full bg-white/15" />
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
              <div className="text-[11px] font-bold text-white">18</div>
              <div className="mt-1 h-1 w-8 rounded-full bg-white/15" />
            </div>
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="h-1.5 w-full rounded-full bg-white/10" />
            <div className="h-1.5 w-4/5 rounded-full bg-white/10" />
            <div className="h-1.5 w-3/5 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    // An AI app sent the user here to sign in before approving it: hand them
    // back to the consent screen (served by the API, so a full load).
    const pending = consumePostLoginRedirect();
    if (pending) {
      window.location.assign(pending);
      return true;
    }
    setLocation(getXpotHomePath());
    setIsLoginOpen(false);
    return true;
  }, [setLocation]);

  useEffect(() => {
    // ?next= comes from /oauth/authorize when there is no session: keep it
    // across the sign-in and open the dialog straight away.
    if (rememberPostLoginRedirect()) {
      window.history.replaceState(null, "", window.location.pathname);
      setIsLoginOpen(true);
    }
  }, []);

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

  const goToApp = () => setLocation(getXpotHomePath());
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const primaryCta = me ? (
    <Button
      onClick={goToApp}
      className="group flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 text-sm font-semibold text-white shadow-[0_0_24px_rgba(37,99,235,0.35)] transition-all hover:bg-blue-500"
    >
      {t("goToDashboard")}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Button>
  ) : (
    <Button
      onClick={() => setIsLoginOpen(true)}
      className="group flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 text-sm font-semibold text-white shadow-[0_0_24px_rgba(37,99,235,0.35)] transition-all hover:bg-blue-500"
      data-testid="landing-get-started"
    >
      {t("getStarted")}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Button>
  );

  const tools = [
    { icon: MapPinned, title: t("visitsTitle"), items: [t("visits1"), t("visits2"), t("visits3"), t("visits4")], tone: "text-blue-300 bg-blue-500/10 border-blue-500/20" },
    { icon: Boxes, title: t("salesTitle"), items: [t("sales1"), t("sales2"), t("sales3"), t("sales4")], tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" },
    { icon: Nfc, title: t("tagsTitle"), items: [t("tags1"), t("tags2"), t("tags3"), t("tags4")], tone: "text-indigo-300 bg-indigo-500/10 border-indigo-500/20" },
  ];

  const steps = [
    { icon: MapPinned, title: t("step1Title"), body: t("step1Body") },
    { icon: Mic, title: t("step2Title"), body: t("step2Body") },
    { icon: Sparkles, title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-x-hidden text-white selection:bg-blue-500/30" style={{ background: "linear-gradient(160deg, #05070f 0%, #080c18 50%, #040810 100%)" }}>
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "32px 32px" }}
        />
        <div className="pointer-events-none absolute left-1/4 top-0 -z-0 h-[480px] w-[480px] rounded-full bg-blue-500/10 blur-[130px]" />

        {/* Header: the bar spans the window, its content the page width. */}
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#05070f]/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
            <button onClick={() => (me ? goToApp() : window.scrollTo({ top: 0, behavior: "smooth" }))} className="flex items-center gap-2.5" aria-label="Xpot">
              <img src="/api/branding/favicon" alt="" className="h-8 w-8 rounded-xl object-cover" />
              {/* The wordmark gives way on narrow phones, where the language picker and button need the room. */}
              <span className="hidden text-xl font-bold tracking-tight text-white min-[420px]:inline">Xpot</span>
            </button>

            <nav className="hidden items-center gap-6 text-sm text-white/55 md:flex" aria-label="Sections">
              <button type="button" onClick={() => scrollTo("how")} className="transition-colors hover:text-white">{t("navHow")}</button>
              <button type="button" onClick={() => scrollTo("tools")} className="transition-colors hover:text-white">{t("navTools")}</button>
              <button type="button" onClick={() => scrollTo("desktop")} className="transition-colors hover:text-white">{t("navDesktop")}</button>
            </nav>

            <div className="flex items-center gap-2">
              <LanguagePicker compact />
              {me ? (
                <Button
                  onClick={goToApp}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition-all hover:bg-blue-500/20 hover:text-blue-200"
                >
                  {t("dashboard")}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Dialog open={isLoginOpen} onOpenChange={handleDialogChange}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white">
                      {t("signIn")}
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="w-[92%] max-w-md overflow-hidden rounded-2xl border-white/10 bg-[#070b16]/95 p-6 text-white shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:p-8">
                    <div className="absolute left-0 top-0 h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500" />

                    <DialogHeader className="pb-4 text-center sm:text-center">
                      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
                        <img src="/api/branding/favicon" alt="" className="h-full w-full object-cover" />
                      </div>
                      <DialogTitle className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
                        {t("welcomeTitle")}
                      </DialogTitle>
                      <DialogDescription className="mt-2 text-center text-base text-white/60">
                        {t("welcomeSub")}
                      </DialogDescription>
                    </DialogHeader>

                    {error && (
                      <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-300">{error}</div>
                    )}
                    <PhoneSignIn onSignedIn={openXpotWorkspace} />
                    <p className="mt-4 text-center text-xs leading-relaxed text-white/45">
                      {t("agreeBefore")}{" "}
                      <Link href="/terms" className="text-white/70 underline-offset-2 hover:underline">{t("termsOfService")}</Link>{" "}
                      {t("agreeAnd")}{" "}
                      <Link href="/privacy" className="text-white/70 underline-offset-2 hover:underline">{t("privacyPolicy")}</Link>
                      {t("agreeAfter")}
                    </p>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </header>

        <main className="relative mx-auto max-w-6xl space-y-24 px-5 py-14 sm:py-20 lg:space-y-32 lg:px-8 lg:py-24">
          {/* Hero. The text is static so it paints at once; only the phone animates. */}
          <section className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-10">
            <div className="space-y-6 text-center lg:col-span-7 lg:text-left">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 px-3.5 py-1.5 text-xs font-semibold text-blue-300 sm:text-sm">
                <MapPinned className="h-3.5 w-3.5" />
                {t("heroBadge")}
              </div>

              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                {t("heroTitleLine1")}
                <br />
                <span className="bg-gradient-to-r from-blue-300 via-indigo-300 to-blue-400 bg-clip-text text-transparent">{t("heroTitleLine2")}</span>
              </h1>

              <p className="mx-auto max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg lg:mx-0">{t("heroSub")}</p>

              <div className="flex flex-col justify-center gap-3.5 pt-2 sm:flex-row lg:justify-start">
                {primaryCta}
                <Button
                  variant="outline"
                  onClick={() => scrollTo("how")}
                  className="h-12 rounded-xl border-white/10 bg-white/5 px-7 text-sm font-semibold text-white transition-all hover:bg-white/10"
                >
                  {t("exploreFeatures")}
                </Button>
              </div>
              {!me && <p className="text-xs text-white/45">{t("accessNote")}</p>}
            </div>

            <motion.div
              className="lg:col-span-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <PhoneMock t={t} />
            </motion.div>
          </section>

          {/* How it works */}
          <section id="how" className="scroll-mt-24 space-y-12">
            <Reveal>
              <SectionHeading title={t("howTitle")} sub={t("howSub")} />
            </Reveal>
            <ol className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {steps.map(({ icon: Icon, title, body }, i) => (
                <Reveal key={title} delay={i * 0.08}>
                  <li className="relative h-full list-none rounded-2xl border border-white/[0.07] bg-white/[0.035] p-6">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-sm font-bold text-blue-300">{i + 1}</span>
                      <Icon className="h-5 w-5 text-white/35" />
                    </div>
                    <h3 className="text-base font-bold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">{body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </section>

          {/* Tools */}
          <section id="tools" className="scroll-mt-24 space-y-12">
            <Reveal>
              <SectionHeading title={t("toolsTitle")} sub={t("toolsSub")} />
            </Reveal>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {tools.map(({ icon: Icon, title, items, tone }, i) => (
                <Reveal key={title} delay={i * 0.08} className="h-full">
                  <div className="h-full rounded-2xl border border-white/[0.07] bg-white/[0.035] p-6">
                    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl border ${tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <ul className="mt-4 space-y-2.5">
                      {items.map((item) => (
                        <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-white/65">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* Desktop */}
          <section id="desktop" className="grid scroll-mt-24 grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-14">
            <Reveal className="space-y-5 text-center lg:text-left">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("deskTitle")}</h2>
              <p className="text-base leading-relaxed text-white/60">{t("deskBody")}</p>
              <ul className="mx-auto max-w-md space-y-2.5 text-left lg:mx-0">
                {[t("deskPoint1"), t("deskPoint2"), t("deskPoint3")].map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm text-white/70">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1}>
              <DesktopMock t={t} />
            </Reveal>
          </section>

          {/* CRM sync */}
          <Reveal>
            <section className="flex flex-col items-center gap-5 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-7 text-center sm:flex-row sm:text-left">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                <RefreshCw className="h-5 w-5 text-blue-300" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{t("syncTitle")}</h2>
                <p className="mt-1 text-sm leading-relaxed text-white/60">{t("syncBody")}</p>
              </div>
            </section>
          </Reveal>

          {/* Call to action */}
          <Reveal>
            <section className="relative mx-auto max-w-4xl space-y-6 overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/30 via-indigo-950/30 to-blue-950/30 p-8 text-center sm:p-12">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">{t("ctaTitle")}</h2>
              <p className="mx-auto max-w-xl text-sm leading-relaxed text-white/65 sm:text-base lg:text-lg">{t("ctaBody")}</p>
              <div className="mx-auto max-w-xs pt-2">
                {me ? (
                  <Button onClick={goToApp} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-black transition-all hover:bg-white/90">
                    {t("goToDashboard")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={() => setIsLoginOpen(true)} className="h-12 w-full rounded-xl bg-white text-sm font-semibold text-black transition-all hover:bg-white/90">
                    {t("accessApp")}
                  </Button>
                )}
              </div>
            </section>
          </Reveal>
        </main>

        <footer className="relative border-t border-white/[0.06] py-10 text-center text-sm text-white/50">
          <p className="font-semibold text-white/60">{t("footerTagline")}</p>
          <p className="mt-3 flex justify-center gap-4">
            <Link href="/privacy" className="transition-colors hover:text-white">{t("privacyPolicy")}</Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="transition-colors hover:text-white">{t("termsOfService")}</Link>
          </p>
          <p className="mt-2">{t("footerRights", { year: new Date().getFullYear() })}</p>
        </footer>
      </div>
    </MotionConfig>
  );
}
