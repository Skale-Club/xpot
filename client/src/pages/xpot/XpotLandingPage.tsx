import { useState, useCallback, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MotionConfig, motion } from "framer-motion";
import {
  ArrowRight,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  DollarSign,
  MapPinned,
  Mic,
  Navigation,
  Nfc,
  Route,
  Search,
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
import { interpolate, translate, useT } from "@/i18n";
import { landingMessages } from "@/i18n/messages/landing";
import { defaultLandingContent } from "@/lib/landingContent";
import type { LandingContentResponse, LandingPageContent } from "@shared/landingContent";
import { publicPagePath } from "@shared/seo";
import { usePublicSeo } from "@/lib/seo";

type LandingT = ReturnType<typeof useT<typeof landingMessages.en>>;

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

function FieldSalesHero({ t }: { t: LandingT }) {
  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute -inset-8 rounded-[48px] bg-[#5272F2]/10 blur-3xl" />
      <div className="relative aspect-[4/3] overflow-hidden rounded-[30px] border border-white/10 bg-[#0b1020] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <img
          src="/xpot-hero-field-sales-v2.webp"
          alt={t("heroImageAlt")}
          width={1672}
          height={941}
          loading="eager"
          decoding="async"
          className="h-full w-full object-cover object-[64%_center]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070f]/85 via-transparent to-[#05070f]/10" />

        <div className="absolute inset-x-4 bottom-4 flex flex-col gap-2.5 sm:inset-x-5 sm:bottom-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-[250px] rounded-2xl border border-white/15 bg-[#070b16]/85 p-3.5 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#A9BCFF]">
              <Route className="h-3.5 w-3.5" />
              {t("heroRouteCardTitle")}
            </div>
            <p className="mt-1.5 text-sm font-semibold text-white">{t("heroRouteCardBody")}</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border border-[#0BB8AF]/25 bg-[#063B3A]/80 px-3 py-2 text-xs font-semibold text-[#79E1D8] shadow-xl backdrop-blur-md sm:self-auto">
            <Navigation className="h-3.5 w-3.5" />
            {t("heroRouteCardBadge")}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Product mockups (drawn with the app's own look, no screenshots) ─────────

function PhoneMock({ content }: { content: LandingPageContent["mockup"] }) {
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div className="pointer-events-none absolute -inset-8 rounded-[48px] bg-[#5272F2]/10 blur-3xl" />
      <div className="relative rounded-[40px] border border-white/10 bg-[#0b1020] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-white/10" />
        <div className="space-y-3 rounded-[30px] bg-[#070b16] p-4">
          {/* Active visit */}
          <div className="space-y-3 rounded-2xl border border-[#5272F2]/25 p-4" style={{ background: "linear-gradient(160deg, rgba(82,114,242,0.15), rgba(11,184,175,0.06))" }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#93A9FF]">{content.visit}</span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#61D8CE]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0BB8AF]" />
                {content.atDoor}
              </span>
            </div>
            <div className="text-center text-4xl font-extrabold tabular-nums tracking-tight text-white">{content.timer}</div>
            <div className="flex items-center gap-3 rounded-xl bg-black/25 p-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#5272F2]/20 bg-[#5272F2]/10">
                <Building2 className="h-4 w-4 text-[#93A9FF]" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{content.business}</div>
                <div className="truncate text-[11px] text-white/40">{content.address}</div>
              </div>
            </div>
          </div>

          {/* Voice note */}
          <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-white/50">
              <Mic className="h-3.5 w-3.5 text-[#93A9FF]" />
              {content.voice}
            </div>
            <p className="text-xs italic leading-relaxed text-white/70">{content.quote}</p>
          </div>

          {/* Proposed actions */}
          <div className="space-y-2 rounded-2xl border border-[#0BB8AF]/20 bg-[#0BB8AF]/[0.05] p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#61D8CE]">
              <Sparkles className="h-3.5 w-3.5" />
              {content.aiFound}
            </div>
            {[
              { icon: DollarSign, label: content.sale, value: content.saleValue },
              { icon: Clock3, label: content.followUp, value: "" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2.5 rounded-xl bg-black/25 px-3 py-2">
                <Icon className="h-3.5 w-3.5 shrink-0 text-white/50" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/85">{label}</span>
                {value && <span className="text-xs font-semibold tabular-nums text-[#61D8CE]">{value}</span>}
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#0BB8AF]/20 text-[#61D8CE]" aria-label={content.confirm}>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export function XpotLandingPage() {
  const [, setLocation] = useLocation();
  const t = useT(landingMessages);
  const landingQuery = useQuery<LandingContentResponse>({ queryKey: ["/api/landing", t.lang] });
  const content = landingQuery.data?.content ?? defaultLandingContent(t.lang);
  usePublicSeo("home");
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
      className="xpot-brand-cta group flex h-12 items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold text-white transition-all"
    >
      {content.account.authenticatedCta}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Button>
  ) : (
    <Button
      onClick={() => setIsLoginOpen(true)}
      className="xpot-brand-cta group flex h-12 items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold text-white transition-all"
      data-testid="landing-get-started"
    >
      {content.account.primaryCta}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Button>
  );

  const tools = [
    { icon: Route, title: t("routesTitle"), items: [t("routes1"), t("routes2"), t("routes3"), t("routes4")], tone: "text-[#8FA8FF] bg-[#5272F2]/10 border-[#5272F2]/20" },
    { icon: MapPinned, title: t("visitsTitle"), items: [t("visits1"), t("visits2"), t("visits3"), t("visits4")], tone: "text-[#61D8CE] bg-[#0BB8AF]/10 border-[#0BB8AF]/20" },
    { icon: Boxes, title: t("salesTitle"), items: [t("sales1"), t("sales2"), t("sales3"), t("sales4")], tone: "text-[#8FA8FF] bg-[#5272F2]/10 border-[#5272F2]/20" },
    { icon: Nfc, title: t("tagsTitle"), items: [t("tags1"), t("tags2"), t("tags3"), t("tags4")], tone: "text-[#61D8CE] bg-[#0BB8AF]/10 border-[#0BB8AF]/20" },
  ];

  const steps = [
    { icon: Search, title: t("step1Title"), body: t("step1Body") },
    { icon: Route, title: t("step2Title"), body: t("step2Body") },
    { icon: Boxes, title: t("step3Title"), body: t("step3Body") },
    { icon: Nfc, title: t("step4Title"), body: t("step4Body") },
  ];

  const routeHighlights = [
    { icon: Search, image: "/landing/highlights/prospecting-route.webp", title: t("highlight1Title"), body: t("highlight1Body") },
    { icon: MapPinned, image: "/landing/highlights/visit-note.webp", title: t("highlight2Title"), body: t("highlight2Body") },
    { icon: Nfc, image: "/landing/highlights/nfc-activation.webp", title: t("highlight3Title"), body: t("highlight3Body") },
  ];

  const fieldFlow = [
    t("fieldFlow1"),
    t("fieldFlow2"),
    t("fieldFlow3"),
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-x-hidden text-white selection:bg-[#5272F2]/30" style={{ background: "linear-gradient(160deg, #05070f 0%, #080c18 50%, #040810 100%)" }}>
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "32px 32px" }}
        />
        <div className="pointer-events-none absolute left-1/4 top-0 -z-0 h-[480px] w-[480px] rounded-full bg-[#5272F2]/10 blur-[130px]" />

        {/* Header: the bar spans the window, its content the page width. */}
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#05070f]/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
            <button onClick={() => (me ? goToApp() : window.scrollTo({ top: 0, behavior: "smooth" }))} className="flex items-center gap-2.5" aria-label="Xpot">
              <img src="/api/branding/favicon" alt="" className="h-8 w-8 rounded-xl object-cover" />
              {/* The wordmark gives way on narrow phones, where the language picker and button need the room. */}
              <span className="hidden text-xl font-bold tracking-tight text-white min-[420px]:inline">Xpot</span>
            </button>

            <nav className="hidden items-center gap-6 text-sm text-white/55 md:flex" aria-label="Sections">
              <button type="button" onClick={() => scrollTo("audience")} className="transition-colors hover:text-white">{content.navigation.audience}</button>
              <button type="button" onClick={() => scrollTo("how")} className="transition-colors hover:text-white">{content.navigation.how}</button>
              <button type="button" onClick={() => scrollTo("tools")} className="transition-colors hover:text-white">{content.navigation.tools}</button>
              <button type="button" onClick={() => scrollTo("faq")} className="transition-colors hover:text-white">{content.navigation.faq}</button>
            </nav>

            <div className="flex items-center gap-2">
              <LanguagePicker compact />
              {me ? (
                <Button
                  onClick={goToApp}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1.5 rounded-xl border border-[#5272F2]/30 bg-[#5272F2]/10 px-4 py-2 text-sm font-semibold text-[#9BB0FF] transition-all hover:bg-[#5272F2]/20 hover:text-[#BEC9FF]"
                >
                  {content.account.dashboard}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Dialog open={isLoginOpen} onOpenChange={handleDialogChange}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white">
                      {content.account.signIn}
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="w-[92%] max-w-md rounded-2xl border-white/10 bg-[#070b16]/95 p-6 text-white shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:p-8">
                    <div className="absolute left-0 top-0 h-[3px] w-full rounded-t-2xl bg-[linear-gradient(90deg,#4A78F3,#5272F2_58%,#0BB8AF)]" />

                    <DialogHeader className="pb-4 text-center sm:text-center">
                      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,rgba(82,114,242,0.12),rgba(11,184,175,0.1))]">
                        <img src="/api/branding/favicon" alt="" className="h-full w-full object-cover" />
                      </div>
                      <DialogTitle className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
                        {content.account.welcomeTitle}
                      </DialogTitle>
                      <DialogDescription className="mt-2 text-center text-base text-white/60">
                        {content.account.welcomeSub}
                      </DialogDescription>
                    </DialogHeader>

                    {error && (
                      <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-300">{error}</div>
                    )}
                    <PhoneSignIn onSignedIn={openXpotWorkspace} />
                    <p className="mt-4 text-center text-xs leading-relaxed text-white/45">
                      {content.account.agreementBefore}{" "}
                      <Link href={publicPagePath("terms", t.lang)} className="text-white/70 underline-offset-2 hover:underline">{content.footer.termsLabel}</Link>{" "}
                      {content.account.agreementAnd}{" "}
                      <Link href={publicPagePath("privacy", t.lang)} className="text-white/70 underline-offset-2 hover:underline">{content.footer.privacyLabel}</Link>
                      {content.account.agreementAfter}
                    </p>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </header>

        <main className="relative mx-auto max-w-6xl space-y-24 px-5 py-14 sm:py-20 lg:space-y-32 lg:px-8 lg:py-24">
          {/* Keep the original open composition; the photo remains a focused proof point. */}
          <section className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-10">
            <div className="space-y-6 text-center lg:col-span-6 lg:text-left">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#5272F2]/25 bg-[#5272F2]/[0.07] px-3.5 py-1.5 text-xs font-semibold text-[#8FB3FF] sm:text-sm">
                <MapPinned className="h-3.5 w-3.5" />
                {content.hero.badge}
              </div>

              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                {content.hero.titleLine1}
                <br />
                <span className="xpot-brand-gradient-text bg-clip-text text-transparent">{content.hero.titleLine2}</span>
              </h1>

              <p className="mx-auto max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg lg:mx-0">{content.hero.body}</p>

              <div className="flex flex-col justify-center gap-3.5 pt-2 sm:flex-row lg:justify-start">
                {primaryCta}
                <Button
                  variant="outline"
                  onClick={() => scrollTo("how")}
                  className="h-12 rounded-xl border-white/10 bg-white/5 px-7 text-sm font-semibold text-white transition-all hover:bg-white/10"
                >
                  {content.hero.secondaryCta}
                </Button>
              </div>
              {!me && <p className="text-xs text-white/45">{content.hero.accessNote}</p>}
            </div>

            <motion.div
              className="lg:col-span-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <FieldSalesHero t={t} />
            </motion.div>
          </section>

          {/* Outcome-first proof points, adapted from the industry landing structure. */}
          <section aria-label={t("highlightsLabel")} className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
            {routeHighlights.map(({ icon: Icon, image, title, body }) => (
              <div key={title} className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.035]">
                <div className="relative aspect-[16/10] overflow-hidden border-b border-white/[0.07] bg-[#080d19]">
                  <img
                    src={image}
                    alt=""
                    width={1200}
                    height={900}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#080d19]/35 via-transparent to-transparent" />
                </div>
                <div className="p-6 sm:p-7">
                  <Icon className="h-5 w-5 text-[#8FA8FF]" />
                  <h2 className="mt-4 text-base font-bold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">{body}</p>
                </div>
              </div>
            ))}
          </section>

          {/* How it works */}
          <section id="how" className="scroll-mt-24 space-y-12">
            <Reveal>
              <SectionHeading title={content.how.title} sub={content.how.subtitle} />
            </Reveal>
            <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(({ icon: Icon, title, body }, i) => (
                <Reveal key={title} delay={i * 0.08}>
                  <li className="relative h-full list-none rounded-2xl border border-white/[0.07] bg-white/[0.035] p-6">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#5272F2]/30 bg-[#5272F2]/10 text-sm font-bold text-[#9BB0FF]">{i + 1}</span>
                      <Icon className="h-5 w-5 text-white/35" />
                    </div>
                    <h3 className="text-base font-bold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">{body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </section>

          {/* Product proof: the photo establishes the job; this shows how Xpot supports it. */}
          <section className="grid grid-cols-1 items-center gap-12 rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-6 sm:p-10 md:grid-cols-2 md:gap-10 lg:gap-16 lg:p-12">
            <Reveal className="order-2 md:order-1">
              <PhoneMock content={content.mockup} />
            </Reveal>
            <Reveal className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8FA8FF]">
                <Navigation className="h-4 w-4" />
                {t("fieldEyebrow")}
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("fieldTitle")}</h2>
              <p className="mt-4 text-base leading-relaxed text-white/60">{t("fieldBody")}</p>
              <ul className="mt-7 space-y-4">
                {fieldFlow.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/75">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5272F2]/15 text-[#9BB0FF]">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </section>

          {/* Tools */}
          <section id="tools" className="scroll-mt-24 space-y-12">
            <Reveal>
              <SectionHeading title={content.tools.title} sub={content.tools.subtitle} />
            </Reveal>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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

          {/* FAQ */}
          <section id="faq" className="scroll-mt-24 space-y-12">
            <Reveal><SectionHeading title={content.faq.title} sub={content.faq.subtitle} /></Reveal>
            <div className="mx-auto max-w-3xl divide-y divide-white/[0.07] border-y border-white/[0.07]">
              {content.faq.items.map((item, index) => (
                <Reveal key={item.id} delay={Math.min(index * 0.04, 0.2)}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-semibold text-white/90 marker:content-none sm:text-lg">
                      <span>{item.question}</span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/45 transition-colors group-open:border-[#5272F2]/35 group-open:text-[#9BB0FF]">
                        <ChevronDown className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" />
                      </span>
                    </summary>
                    <p className="max-w-2xl pb-6 pr-12 text-sm leading-7 text-white/55 sm:text-base">{item.answer}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </section>

          {/* Call to action */}
          <Reveal>
            <section className="relative mx-auto max-w-4xl space-y-6 overflow-hidden rounded-2xl border border-[#5272F2]/20 bg-[linear-gradient(100deg,rgba(82,114,242,0.12),rgba(11,184,175,0.08),rgba(82,114,242,0.1))] p-8 text-center sm:p-12">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">{content.cta.title}</h2>
              <p className="mx-auto max-w-xl text-sm leading-relaxed text-white/65 sm:text-base lg:text-lg">{content.cta.body}</p>
              <div className="mx-auto max-w-xs pt-2">
                {me ? (
                  <Button onClick={goToApp} className="xpot-brand-cta flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all">
                    {content.account.authenticatedCta}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={() => setIsLoginOpen(true)} className="xpot-brand-cta h-12 w-full rounded-xl text-sm font-semibold text-white transition-all">
                    {content.cta.button}
                  </Button>
                )}
              </div>
            </section>
          </Reveal>
        </main>

        <footer className="relative border-t border-white/[0.06] py-10 text-center text-sm text-white/50">
          <p className="font-semibold text-white/60">{content.footer.tagline}</p>
          <p className="mt-3 flex justify-center gap-4">
            <Link href={publicPagePath("privacy", t.lang)} className="transition-colors hover:text-white">{content.footer.privacyLabel}</Link>
            <span aria-hidden>·</span>
            <Link href={publicPagePath("terms", t.lang)} className="transition-colors hover:text-white">{content.footer.termsLabel}</Link>
          </p>
          <p className="mt-2">{interpolate(content.footer.rights, { year: new Date().getFullYear() })}</p>
        </footer>
      </div>
    </MotionConfig>
  );
}
