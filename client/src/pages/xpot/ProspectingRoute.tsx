import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Map,
  MapPin,
  Mic2,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Sparkles,
  Star,
} from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fileSrc } from "@/lib/files";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { prospectingMessages } from "@/i18n/messages/prospecting";
import { VoiceRecorder } from "./components/VoiceRecorder";
import { XpotCheckIn } from "./XpotCheckIn";
import { useVisits } from "./hooks/useVisits";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { useXpotShared } from "./hooks/useXpotShared";
import type { DailyRouteBundle, EnrichedSalesVisit, SalesDailyRouteStop } from "./types";
import { manualCheckInLeadId } from "@shared/daily-route";
import { subscribeToRoutePush } from "@/lib/pushNotifications";

const CARD = {
  background: "linear-gradient(145deg, rgba(17,25,44,0.96), rgba(10,16,30,0.94))",
  border: "1px solid rgba(148,163,184,0.12)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
};

const INPUT = "h-14 w-full rounded-2xl border border-white/10 bg-white/[0.055] px-4 text-base font-semibold text-white outline-none transition focus:border-blue-400/50 focus:bg-white/[0.075] placeholder:text-white/25";
const SEGMENTS = ["Barbershops", "Restaurants", "Auto repair", "Dentists", "Beauty salons", "Gyms"];
const DURATIONS = [120, 240, 360, 480];

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function newIdempotencyKey() {
  return crypto.randomUUID();
}

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hour, minute + minutes);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function routeQueryUrl() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  return `/api/xpot/daily-route/today?timezone=${encodeURIComponent(timezone)}`;
}

type Draft = { industry: string; city: string; startTime: string; durationMinutes: number };

function loadDraft(): Draft {
  try {
    const saved = localStorage.getItem(`xpot.daily-route.${localDate()}`);
    if (saved) return JSON.parse(saved) as Draft;
  } catch {}
  return { industry: "", city: "", startTime: "09:00", durationMinutes: 240 };
}

function DailyRouteWizard({ onCreated }: { onCreated: () => void }) {
  const t = useT(prospectingMessages);
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(loadDraft);

  useEffect(() => {
    try { localStorage.setItem(`xpot.daily-route.${localDate()}`, JSON.stringify(draft)); } catch {}
  }, [draft]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
      const response = await apiRequest("POST", "/api/xpot/daily-route", {
        ...draft,
        routeDate: localDate(),
        timezone,
        idempotencyKey: newIdempotencyKey(),
      });
      return response.json();
    },
    onSuccess: async () => {
      try { localStorage.removeItem(`xpot.daily-route.${localDate()}`); } catch {}
      if ("Notification" in window) {
        const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
        if (permission === "granted") void subscribeToRoutePush().catch((error) => console.error("[push subscription] failed:", error));
      }
      await onCreated();
    },
    onError: async (error: Error & { status?: number }) => {
      if (error.status === 409) {
        await onCreated();
        return;
      }
      toast({ title: t("routeFailed"), description: error.message, variant: "destructive" });
    },
  });

  const canContinue = step === 0 ? draft.industry.trim().length >= 2
    : step === 1 ? draft.city.trim().length >= 2
      : true;

  return (
    <div className="mx-auto max-w-2xl pt-2 lg:pt-8">
      <div className="mb-5 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-300/70">{t("stepOf", { step: step + 1 })}</span>
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1, 2, 3].map((index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === step ? "w-8 bg-blue-400" : index < step ? "w-4 bg-emerald-400/70" : "w-4 bg-white/10"}`} />)}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[30px] p-5 sm:p-8" style={CARD}>
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="relative min-h-[330px]">
            {step === 0 ? (
              <div>
                <WizardIcon icon={Building2} />
                <h1 className="mt-6 text-2xl font-black tracking-tight text-white sm:text-3xl">{t("segmentQuestion")}</h1>
                <p className="mt-2 text-sm leading-relaxed text-white/45">{t("segmentHint")}</p>
                <input autoFocus value={draft.industry} onChange={(event) => setDraft((value) => ({ ...value, industry: event.target.value }))} placeholder={t("segmentPlaceholder")} className={`${INPUT} mt-7`} />
                <div className="mt-4 flex flex-wrap gap-2">
                  {SEGMENTS.map((segment) => <button key={segment} type="button" onClick={() => setDraft((value) => ({ ...value, industry: segment }))} className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${draft.industry === segment ? "border-blue-400/50 bg-blue-500/15 text-blue-200" : "border-white/8 bg-white/[0.035] text-white/50 hover:text-white"}`}>{segment}</button>)}
                </div>
              </div>
            ) : step === 1 ? (
              <div>
                <WizardIcon icon={MapPin} />
                <h1 className="mt-6 text-2xl font-black tracking-tight text-white sm:text-3xl">{t("locationQuestion")}</h1>
                <p className="mt-2 text-sm leading-relaxed text-white/45">{t("locationHint")}</p>
                <div className="relative mt-7">
                  <MapPin className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-300/60" />
                  <input autoFocus value={draft.city} onChange={(event) => setDraft((value) => ({ ...value, city: event.target.value }))} placeholder={t("cityPlaceholder")} className={`${INPUT} pl-12`} />
                </div>
              </div>
            ) : step === 2 ? (
              <div>
                <WizardIcon icon={CalendarClock} />
                <h1 className="mt-6 text-2xl font-black tracking-tight text-white sm:text-3xl">{t("scheduleQuestion")}</h1>
                <p className="mt-2 text-sm leading-relaxed text-white/45">{t("scheduleHint")}</p>
                <div className="mt-7 grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-xs font-bold uppercase tracking-widest text-white/35">
                    <span>{t("startAt")}</span>
                    <input type="time" value={draft.startTime} onChange={(event) => setDraft((value) => ({ ...value, startTime: event.target.value }))} className={INPUT} />
                  </label>
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-white/35">{t("duration")}</span>
                    <div className="grid grid-cols-4 gap-2">
                      {DURATIONS.map((duration) => <button key={duration} type="button" onClick={() => setDraft((value) => ({ ...value, durationMinutes: duration }))} className={`h-14 rounded-2xl border text-sm font-bold ${draft.durationMinutes === duration ? "border-blue-400/50 bg-blue-500/15 text-blue-200" : "border-white/8 bg-white/[0.035] text-white/45"}`}>{t("hours", { count: duration / 60 })}</button>)}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.055] px-4 py-3 text-sm font-semibold text-emerald-200/80">
                  <Clock3 className="h-4 w-4" /> {t("finishAt", { time: addMinutes(draft.startTime, draft.durationMinutes) })}
                </div>
              </div>
            ) : (
              <div>
                <WizardIcon icon={Sparkles} />
                <h1 className="mt-6 text-2xl font-black tracking-tight text-white sm:text-3xl">{t("reviewTitle")}</h1>
                <p className="mt-2 text-sm leading-relaxed text-white/45">{t("reviewHint")}</p>
                <div className="mt-6 divide-y divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-black/15 px-4">
                  <ReviewRow label={t("segment")} value={draft.industry} />
                  <ReviewRow label={t("location")} value={draft.city} />
                  <ReviewRow label={t("workWindow")} value={`${draft.startTime} · ${draft.durationMinutes / 60}h · ${addMinutes(draft.startTime, draft.durationMinutes)}`} />
                </div>
                <p className="mt-4 rounded-2xl border border-amber-300/10 bg-amber-300/[0.05] px-4 py-3 text-xs leading-relaxed text-amber-100/65">{t("oneRouteNotice")}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="relative mt-6 flex gap-3">
          {step > 0 ? <button type="button" onClick={() => setStep((value) => value - 1)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 font-semibold text-white/55 hover:text-white"><ArrowLeft className="h-4 w-4" />{t("back")}</button> : null}
          <button type="button" disabled={!canContinue || createMutation.isPending} onClick={() => step < 3 ? setStep((value) => value + 1) : createMutation.mutate()} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 font-bold text-white shadow-[0_14px_35px_rgba(59,130,246,0.25)] transition hover:bg-blue-400 active:scale-[0.99] disabled:opacity-40">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 3 ? <RouteIcon className="h-4 w-4" /> : null}
            {step === 3 ? t("generate") : t("continue")}
            {step < 3 ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}

function WizardIcon({ icon: Icon }: { icon: typeof Building2 }) {
  return <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300 shadow-[0_0_35px_rgba(59,130,246,0.13)]"><Icon className="h-6 w-6" /></div>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-6 py-4"><span className="text-xs font-bold uppercase tracking-wider text-white/30">{label}</span><strong className="text-right text-sm text-white/85">{value}</strong></div>;
}

function RouteGenerating({ bundle, onRetry }: { bundle: DailyRouteBundle; onRetry: () => void }) {
  const t = useT(prospectingMessages);
  const stageKeys: Record<string, "stageQueued" | "stageDiscovering" | "stageQualifying" | "stageOptimizing" | "stageFinalizing"> = {
    queued: "stageQueued", discovering: "stageDiscovering", qualifying: "stageQualifying", optimizing: "stageOptimizing", finalizing: "stageFinalizing",
  };
  if (bundle.route.status === "failed") return (
    <div className="mx-auto max-w-xl rounded-[30px] p-7 text-center" style={CARD}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-400/10 text-red-300"><RefreshCw className="h-7 w-7" /></div>
      <h2 className="mt-5 text-2xl font-black text-white">{t("routeFailed")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/45">{bundle.route.errorMessage || t("routeFailedHint")}</p>
      <button type="button" onClick={onRetry} className="mt-6 min-h-12 rounded-2xl bg-blue-500 px-6 font-bold text-white"><RefreshCw className="mr-2 inline h-4 w-4" />{t("retry")}</button>
    </div>
  );
  const estimated = bundle.route.estimatedReadyAt ? new Date(bundle.route.estimatedReadyAt).toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div className="mx-auto max-w-xl rounded-[30px] p-7 text-center" style={CARD}>
      <div className="relative mx-auto h-24 w-24">
        <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/10" />
        <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-r-blue-300 border-t-blue-500" />
        <div className="absolute inset-5 flex items-center justify-center rounded-full bg-blue-500/10"><RouteIcon className="h-7 w-7 text-blue-300" /></div>
      </div>
      <h2 className="mt-5 text-2xl font-black text-white">{t("generatingTitle")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/45">{t("generatingHint")}</p>
      <div className="mt-6 rounded-2xl border border-white/[0.08] bg-black/15 px-4 py-4">
        <div className="flex items-center justify-center gap-2 font-semibold text-blue-200"><Loader2 className="h-4 w-4 animate-spin" />{t(stageKeys[bundle.route.generationStage] ?? "stageQueued")}</div>
        {estimated ? <div className="mt-1 text-xs text-white/30">{t("estimatedReady", { time: estimated })}</div> : null}
      </div>
    </div>
  );
}

function RouteMap({ stops, polyline }: { stops: SalesDailyRouteStop[]; polyline?: string | null }) {
  const positioned = stops.filter((stop) => stop.lat && stop.lng);
  const [first] = positioned;
  if (!first) return <div className="flex h-[230px] items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.18),transparent_35%),linear-gradient(145deg,#10192d,#09101e)] text-white/25"><Map className="h-10 w-10" /></div>;
  const params = new URLSearchParams({
    lat: first.lat!, lng: first.lng!, w: "640", h: "300",
    stops: positioned.map((stop) => `${stop.lat},${stop.lng}`).join(";"),
  });
  if (polyline) params.set("polyline", polyline);
  return <img src={`/api/xpot/map?${params.toString()}`} alt="Daily route map" className="h-[230px] w-full object-cover sm:h-[280px]" />;
}

function DailyRouteReady({ bundle, routeUrl, refresh }: { bundle: DailyRouteBundle; routeUrl: string; refresh: () => Promise<unknown> }) {
  const t = useT(prospectingMessages);
  const { toast } = useToast();
  const { me } = useXpotQueries();
  const { geoState, hasLocation, loadCurrentLocation, setLiveTracking, invalidateXpotData } = useXpotShared();
  const [, setLocation] = useLocation();
  const [checkingStop, setCheckingStop] = useState<number | null>(null);

  useEffect(() => { setLiveTracking(true); return () => setLiveTracking(false); }, [setLiveTracking]);
  const checkIn = useMutation({
    mutationFn: async (stop: SalesDailyRouteStop) => {
      setCheckingStop(stop.id);
      const position = hasLocation ? geoState : await loadCurrentLocation();
      if (position?.lat == null || position?.lng == null) throw new Error(t("locationNeeded"));
      const response = await apiRequest("POST", "/api/xpot/visits/check-in", {
        leadId: stop.leadId,
        locationId: stop.locationId ?? undefined,
        routeStopId: stop.id,
        lat: position.lat,
        lng: position.lng,
        gpsAccuracyMeters: position.accuracy,
      });
      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([invalidateXpotData(), refresh()]);
    },
    onError: (error: Error) => toast({ title: t("checkIn"), description: error.message, variant: "destructive" }),
    onSettled: () => setCheckingStop(null),
  });

  const skip = useMutation({
    mutationFn: async (stopId: number) => (await apiRequest("PATCH", `/api/xpot/daily-route/stops/${stopId}`, { status: "skipped", skipReason: "Skipped by rep" })).json(),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: [routeUrl] }); },
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const reason = window.prompt(t("regenerateReason"));
      if (!reason) return null;
      if (!window.confirm(t("regenerationCost"))) return null;
      const response = await apiRequest("POST", `/api/xpot/daily-route/${bundle.route.id}/regenerate`, { reason, idempotencyKey: newIdempotencyKey() });
      return response.json();
    },
    onSuccess: async (data) => { if (data) await queryClient.invalidateQueries({ queryKey: [routeUrl] }); },
    onError: (error: Error) => toast({ title: t("adminRegenerate"), description: error.message, variant: "destructive" }),
  });

  const activeStops = bundle.stops.filter((stop) => !["visited", "skipped", "unavailable", "removed"].includes(stop.status));
  const done = bundle.stops.length - activeStops.length;
  const next = activeStops[0];
  const sorted = [...bundle.stops].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px]" style={CARD}>
        <div className="relative">
          <RouteMap stops={sorted} polyline={bundle.route.routePolyline} />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0b1220] to-transparent" />
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300/80">{bundle.route.status === "completed" ? t("completedDay") : t("routeReady")}</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white">{bundle.route.city}</h1>
              <p className="mt-0.5 text-xs text-white/50">{t("routeReadyHint", { count: bundle.stops.length, city: bundle.route.city })}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#08101d]/80 px-3 py-2 text-right backdrop-blur-xl">
              <strong className="block text-sm text-white">{t("stopsDone", { done, total: bundle.stops.length })}</strong>
              <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${bundle.stops.length ? done / bundle.stops.length * 100 : 0}%` }} /></div>
            </div>
          </div>
        </div>
      </section>

      {bundle.route.status === "completed" ? <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4"><div className="flex items-center gap-2 font-bold text-emerald-200"><CheckCircle2 className="h-5 w-5" />{t("completedDay")}</div><p className="mt-1 text-sm text-emerald-100/50">{t("completedDayHint")}</p></div> : null}

      {next ? <div className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35"><Navigation className="h-3.5 w-3.5 text-blue-300" />{t("nextStop")}</div> : null}
      <div className="space-y-3">
        {sorted.map((stop) => <StopCard key={stop.id} stop={stop} routeStart={bundle.route.startTime} next={stop.id === next?.id} checking={checkingStop === stop.id} onCheckIn={() => stop.status === "summary_pending" && stop.visitId ? setLocation(`/leads/prospecting/summary/${stop.visitId}`) : checkIn.mutate(stop)} onSkip={() => skip.mutate(stop.id)} />)}
      </div>

      {me?.user.isAdmin ? <button type="button" disabled={regenerate.isPending} onClick={() => regenerate.mutate()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] text-sm font-semibold text-amber-100/65"><RefreshCw className={`h-4 w-4 ${regenerate.isPending ? "animate-spin" : ""}`} />{t("adminRegenerate")}</button> : null}
    </div>
  );
}

function StopCard({ stop, routeStart, next, checking, onCheckIn, onSkip }: { stop: SalesDailyRouteStop; routeStart: string; next: boolean; checking: boolean; onCheckIn: () => void; onSkip: () => void }) {
  const t = useT(prospectingMessages);
  const resolved = ["visited", "skipped", "unavailable", "removed"].includes(stop.status);
  const mapsUrl = stop.mapsUrl || (stop.lat && stop.lng ? `https://maps.google.com/?q=${stop.lat},${stop.lng}` : `https://maps.google.com/?q=${encodeURIComponent(stop.addressSnapshot || stop.nameSnapshot)}`);
  return (
    <article className={`group overflow-hidden rounded-3xl border transition ${next ? "border-blue-400/25 bg-blue-500/[0.06] shadow-[0_16px_45px_rgba(37,99,235,0.1)]" : "border-white/[0.08] bg-white/[0.025]"} ${resolved ? "opacity-60" : ""}`}>
      <button type="button" disabled={resolved} onClick={onCheckIn} className="flex w-full items-start gap-3 p-4 text-left disabled:cursor-default">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${stop.status === "visited" ? "bg-emerald-400/10 text-emerald-300" : stop.status === "skipped" ? "bg-white/5 text-white/35" : "bg-blue-500/10 text-blue-300"}`}>{stop.status === "visited" ? <Check className="h-5 w-5" /> : stop.sequence}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold leading-tight text-white">{stop.nameSnapshot}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/40">{stop.addressSnapshot}</p>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/20" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-white/40">
            <span>{t("arrival", { time: addMinutes(routeStart, stop.arrivalOffsetMinutes) })}</span>
            {stop.driveMinutes ? <span>{t("drive", { count: stop.driveMinutes })}</span> : null}
            {stop.ratingTenths != null ? <span className="flex items-center gap-1 text-amber-200/70"><Star className="h-3 w-3 fill-current" />{(stop.ratingTenths / 10).toFixed(1)}</span> : null}
            {stop.reviewCount != null ? <span>{t("reviews", { count: stop.reviewCount })}</span> : null}
            {stop.openNow != null ? <span className={stop.openNow ? "text-emerald-300/70" : "text-amber-300/70"}>{stop.openNow ? t("open") : t("closed")}</span> : null}
          </div>
          {resolved || stop.status === "summary_pending" ? <div className="mt-2 text-xs font-bold text-white/45">{stop.status === "visited" ? t("visited") : stop.status === "skipped" ? t("skipped") : stop.status === "summary_pending" ? t("summaryPending") : stop.status}</div> : null}
        </div>
      </button>
      {!resolved ? <div className="grid grid-cols-[1fr_1.25fr_auto] gap-2 border-t border-white/[0.07] p-3">
        <a href={mapsUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-bold text-white/65"><Navigation className="h-4 w-4" />{t("go")}</a>
        <button type="button" onClick={onCheckIn} disabled={checking} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-500 text-sm font-bold text-white disabled:opacity-50">{checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}{checking ? t("checkingIn") : stop.status === "summary_pending" ? t("summaryPending") : t("checkIn")}</button>
        {stop.status === "planned" ? <button type="button" onClick={onSkip} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-white/30 hover:bg-white/5 hover:text-white/60">{t("skip")}</button> : <span />}
      </div> : null}
    </article>
  );
}

function VisitSummary({ visitId }: { visitId: number }) {
  const t = useT(prospectingMessages);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { invalidateXpotData } = useXpotShared();
  const { data: visits, refetch } = useQuery<EnrichedSalesVisit[]>({ queryKey: ["/api/xpot/visits"] });
  const visit = visits?.find((item) => item.id === visitId);
  const draftKey = `xpot.visit-summary.${visitId}`;
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) return JSON.parse(saved) as { attendeeName: string; outcome: string; summary: string; nextStep: string; taskTitle: string; taskDueAt: string };
    } catch {}
    return { attendeeName: "", outcome: "", summary: "", nextStep: "", taskTitle: "", taskDueAt: "" };
  });

  useEffect(() => {
    if (!visit?.note) return;
    setForm((current) => ({
      attendeeName: current.attendeeName || visit.note?.attendeeName || "",
      outcome: current.outcome || visit.note?.outcome || "",
      summary: current.summary || visit.note?.summary || "",
      nextStep: current.nextStep || visit.note?.nextStep || "",
      taskTitle: current.taskTitle,
      taskDueAt: current.taskDueAt,
    }));
  }, [visit?.id, visit?.note]);
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(form)); } catch {} }, [draftKey, form]);

  const uploadAudio = async ({ audioBlob, durationSeconds }: { audioBlob: Blob; durationSeconds: number }) => {
    const audioData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });
    await apiRequest("POST", `/api/xpot/visits/${visitId}/audio`, { audioData, durationSeconds });
    await refetch();
  };

  const save = useMutation({
    mutationFn: async (stay: boolean) => {
      const response = await apiRequest("POST", `/api/xpot/visits/${visitId}/summary`, {
        attendeeName: form.attendeeName || null,
        outcome: form.outcome || null,
        summary: form.summary || null,
        nextStep: form.nextStep || null,
        followUpRequired: Boolean(form.taskTitle),
        quickTask: form.taskTitle ? {
          title: form.taskTitle,
          dueAt: form.taskDueAt ? new Date(form.taskDueAt).toISOString() : null,
          priority: "medium",
          type: "follow_up",
        } : null,
      });
      return { data: await response.json(), stay };
    },
    onSuccess: async ({ stay }) => {
      try { localStorage.removeItem(draftKey); } catch {}
      toast({ title: t("saved"), variant: "success" });
      await Promise.all([invalidateXpotData(), queryClient.invalidateQueries({ queryKey: [routeQueryUrl()] })]);
      if (!stay) setLocation("/leads/prospecting");
    },
    onError: (error: Error) => toast({ title: t("summaryTitle"), description: error.message, variant: "destructive" }),
  });

  if (visits && !visit) return <div className="rounded-3xl p-8 text-center text-white/50" style={CARD}>{t("visitNotFound")}</div>;
  if (!visit) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-300" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button type="button" onClick={() => setLocation("/leads/prospecting")} className="flex min-h-11 items-center gap-2 px-1 text-sm font-semibold text-white/45"><ArrowLeft className="h-4 w-4" />{t("back")}</button>
      <section className="overflow-hidden rounded-[30px]" style={CARD}>
        <div className="relative border-b border-white/[0.08] p-5 sm:p-7">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/70">{visit.lead?.name}</div>
          <h1 className="relative mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{t("summaryTitle")}</h1>
          <p className="relative mt-2 text-sm leading-relaxed text-white/45">{t("summaryHint")}</p>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          <div className="rounded-3xl border border-violet-400/20 bg-violet-500/[0.07] p-5 shadow-[0_0_45px_rgba(139,92,246,0.08)]">
            <div className="mb-4 flex items-center gap-2 text-sm font-extrabold text-violet-200"><span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-400/10"><Mic2 className="h-4 w-4" /></span>{t("audioPrimary")}</div>
            <VoiceRecorder onUpload={uploadAudio} existingAudio={fileSrc(visit.note?.audioUrl)} existingDuration={visit.note?.audioDurationSeconds} existingTranscription={visit.note?.audioTranscription} />
          </div>

          <Field label={t("whoHelped")}><input value={form.attendeeName} onChange={(event) => setForm((value) => ({ ...value, attendeeName: event.target.value }))} placeholder={t("whoPlaceholder")} className={INPUT} /></Field>
          <Field label={t("outcome")}><input value={form.outcome} onChange={(event) => setForm((value) => ({ ...value, outcome: event.target.value }))} placeholder={t("outcomePlaceholder")} className={INPUT} /></Field>
          <Field label={t("notes")}><textarea value={form.summary} onChange={(event) => setForm((value) => ({ ...value, summary: event.target.value }))} placeholder={t("notesPlaceholder")} rows={3} className={`${INPUT} h-auto min-h-24 py-3`} /></Field>
          <Field label={t("nextStep")}><input value={form.nextStep} onChange={(event) => setForm((value) => ({ ...value, nextStep: event.target.value }))} placeholder={t("nextStepPlaceholder")} className={INPUT} /></Field>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white/70"><CalendarClock className="h-4 w-4 text-blue-300" />{t("quickTask")}</div>
            <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
              <input value={form.taskTitle} onChange={(event) => setForm((value) => ({ ...value, taskTitle: event.target.value }))} placeholder={t("taskPlaceholder")} className={INPUT} />
              <label className="relative"><span className="sr-only">{t("taskDate")}</span><input type="datetime-local" value={form.taskDueAt} onChange={(event) => setForm((value) => ({ ...value, taskDueAt: event.target.value }))} className={INPUT} /></label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <button type="button" disabled={save.isPending} onClick={() => save.mutate(false)} className="flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 font-bold text-white shadow-[0_14px_35px_rgba(59,130,246,0.2)] disabled:opacity-50">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{save.isPending ? t("saving") : t("saveContinue")}</button>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate(true)} className="min-h-13 rounded-2xl border border-white/10 px-5 text-sm font-semibold text-white/50">{t("saveStay")}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-widest text-white/35">{label}</span>{children}</label>;
}

export function ProspectingRoute() {
  const [pathname] = useLocation();
  const summaryMatch = pathname.match(/^\/leads\/prospecting\/summary\/(\d+)/);
  const summaryVisitId = summaryMatch ? Number(summaryMatch[1]) : null;
  const manualLeadId = manualCheckInLeadId(`${window.location.pathname}${window.location.search}`);
  const { activeVisit } = useVisits();
  const url = routeQueryUrl();
  const routeQuery = useQuery<DailyRouteBundle | null>({
    queryKey: [url],
    refetchInterval: (query) => {
      const route = (query.state.data as DailyRouteBundle | null | undefined)?.route;
      return route && ["queued", "generating"].includes(route.status) ? 2500 : false;
    },
    staleTime: 0,
  });
  const retry = useMutation({
    mutationFn: async () => {
      if (!routeQuery.data) return;
      await apiRequest("POST", `/api/xpot/daily-route/${routeQuery.data.route.id}/retry`);
    },
    onSuccess: async () => { await routeQuery.refetch(); },
  });

  if (summaryVisitId) return <VisitSummary visitId={summaryVisitId} />;
  if (activeVisit) return <XpotCheckIn />;
  if (manualLeadId) return <XpotCheckIn />;
  if (routeQuery.isLoading) return <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-300" /></div>;
  if (!routeQuery.data) return <DailyRouteWizard onCreated={() => routeQuery.refetch()} />;
  if (["queued", "generating", "failed"].includes(routeQuery.data.route.status)) return <RouteGenerating bundle={routeQuery.data} onRetry={() => retry.mutate()} />;
  return <DailyRouteReady bundle={routeQuery.data} routeUrl={url} refresh={() => routeQuery.refetch()} />;
}
