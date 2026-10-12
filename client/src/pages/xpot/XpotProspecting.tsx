import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Clock3, Loader2, MapPin, Navigation, Radar, Route as RouteIcon, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { prospectingMessages } from "@/i18n/messages/prospecting";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { approximateCandidateCenter } from "#shared/prospecting.js";
import { RoutePreviewMap } from "./components/RoutePreviewMap";

type ProspectingJob = {
  id: number;
  status: "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";
  location: string;
  targetStops: number;
  shiftDurationMinutes: number;
  defaultVisitMinutes: number;
  expansionState: { currentArea?: string; wave?: number };
  errorMessage: string | null;
  createdAt: string;
};

type ProspectingJobDetails = {
  job: ProspectingJob;
  runs: Array<{ id: number; status: string; location: string; niche: string; progress: number; wave: number }>;
  candidates: Array<{ id: number; status: string; name: string; address: string | null; score: number; lat: string | null; lng: string | null }>;
  summary: { eligible: number; excluded: number };
  engine: { configured: boolean };
};

type ProspectingRoute = {
  id: number;
  name: string;
  routeDate: string;
  status: "draft" | "published" | "in_progress" | "completed" | "cancelled";
  startLat: string;
  startLng: string;
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  optimizationMeta: { encodedPolyline?: string };
  createdAt: string;
};

type RouteStop = {
  id: number;
  position: number;
  status: "planned" | "en_route" | "checked_in" | "completed" | "skipped" | "rescheduled";
  name: string;
  address: string | null;
  lat: string;
  lng: string;
  score: number;
  travelDurationSeconds: number;
  estimatedArrivalAt: string | null;
};

type RouteDetails = { route: ProspectingRoute; stops: RouteStop[] };

const cardStyle = { background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" };

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function sectorSearches(value: string) {
  const searches = value.split(/[,;\n]/).map((sector) => sector.trim()).filter(Boolean).map((query) => ({
    query,
    niche: query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40),
  })).filter((search) => search.niche.length >= 2);
  // A repeated sector is one search, and it must not take one of the five slots.
  return searches.filter((search, index) => searches.findIndex((other) => other.niche === search.niche) === index).slice(0, 5);
}

function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation unavailable"));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}

/** Google Maps URLs keep at most nine waypoints; more are silently dropped. */
const MAPS_URL_MAX_STOPS = 10;

function mapsDirectionsUrl(route: ProspectingRoute, stops: RouteStop[]) {
  // Hand Maps the next stops still to visit. Once the day has started the trip
  // begins wherever the rep is now, which Maps uses when origin is left out.
  const remaining = stops.filter((stop) => ["planned", "en_route", "checked_in"].includes(stop.status)).slice(0, MAPS_URL_MAX_STOPS);
  if (!remaining.length) return null;
  const params = new URLSearchParams({
    api: "1",
    destination: `${remaining.at(-1)!.lat},${remaining.at(-1)!.lng}`,
    travelmode: "driving",
  });
  if (remaining.length === stops.length) params.set("origin", `${route.startLat},${route.startLng}`);
  if (remaining.length > 1) params.set("waypoints", remaining.slice(0, -1).map((stop) => `${stop.lat},${stop.lng}`).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function stopDirectionsUrl(stop: RouteStop) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${stop.lat},${stop.lng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function driveMinutes(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}

function statusLabel(status: ProspectingJob["status"], t: ReturnType<typeof useT<typeof prospectingMessages.en>>) {
  if (status === "queued") return t("statusQueued");
  if (status === "running") return t("statusRunning");
  if (status === "completed") return t("statusCompleted");
  return t("statusFailed");
}

function routeStatusLabel(status: ProspectingRoute["status"], t: ReturnType<typeof useT<typeof prospectingMessages.en>>) {
  if (status === "in_progress") return t("routeInProgress");
  if (status === "completed") return t("routeCompleted");
  if (status === "cancelled") return t("routeCancelled");
  return t("published");
}

function stopStatusLabel(status: RouteStop["status"], t: ReturnType<typeof useT<typeof prospectingMessages.en>>) {
  if (status === "checked_in") return t("stopCheckedIn");
  if (status === "completed") return t("stopCompleted");
  if (status === "skipped") return t("stopSkipped");
  if (status === "en_route") return t("stopEnRoute");
  if (status === "rescheduled") return t("stopRescheduled");
  return t("stopPlanned");
}

export function XpotProspecting() {
  const t = useT(prospectingMessages);
  const { toast } = useToast();
  const [city, setCity] = useState("");
  const [sectors, setSectors] = useState("");
  const [shiftHours, setShiftHours] = useState(8);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const parsedSearches = useMemo(() => sectorSearches(sectors), [sectors]);

  const jobsQuery = useQuery<ProspectingJob[]>({
    queryKey: ["/api/xpot/prospecting/jobs"],
    refetchInterval: (query) => (query.state.data?.some((job) => ["queued", "running"].includes(job.status)) ? 15_000 : false),
  });
  const routesQuery = useQuery<ProspectingRoute[]>({ queryKey: ["/api/xpot/prospecting/routes"] });
  const today = localDateKey();
  const todayJobs = useMemo(() => (jobsQuery.data ?? []).filter((job) => localDateKey(new Date(job.createdAt)) === today), [jobsQuery.data, today]);
  const activeJobId = selectedJobId ?? todayJobs[0]?.id ?? null;
  const todayRoutes = useMemo(() => (routesQuery.data ?? []).filter((route) => route.routeDate === today), [routesQuery.data, today]);
  const activeRouteId = selectedRouteId ?? todayRoutes[0]?.id ?? null;

  const detailsQuery = useQuery<ProspectingJobDetails>({
    queryKey: ["/api/xpot/prospecting/jobs", activeJobId],
    enabled: activeJobId !== null,
    refetchInterval: (query) => (["queued", "running"].includes(query.state.data?.job.status ?? "") ? 10_000 : false),
  });
  const routeQuery = useQuery<RouteDetails>({
    queryKey: ["/api/xpot/prospecting/routes", activeRouteId],
    enabled: activeRouteId !== null,
    // Check-ins and checkouts happen on the Visits screen; keep the stop states current.
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (["published", "in_progress"].includes(query.state.data?.route.status ?? "") ? 60_000 : false),
  });

  const createJob = useMutation({
    mutationFn: async () => {
      const searches = parsedSearches;
      if (!city.trim() || !searches.length) throw new Error(t("errorTitle"));
      const response = await apiRequest("POST", "/api/xpot/prospecting/jobs", {
        location: city.trim(),
        searches,
        shiftDurationMinutes: shiftHours * 60,
        idempotencyKey: `today:${today}:${shiftHours}h:${city.trim().toLowerCase()}:${searches.map((search) => search.niche).join("+")}`,
      });
      return response.json() as Promise<ProspectingJobDetails>;
    },
    onSuccess: async (data) => {
      setSelectedJobId(data.job.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/jobs"] });
      toast({ title: t("searchStarted"), description: t("searchStartedBody") });
    },
    onError: (error: Error) => toast({ title: t("errorTitle"), description: error.message, variant: "destructive" }),
  });

  const createRoute = useMutation({
    mutationFn: async () => {
      if (!detailsQuery.data) throw new Error(t("emptyCandidates"));
      let start: { lat: number; lng: number };
      try { start = await currentPosition(); }
      catch {
        const fallback = approximateCandidateCenter(detailsQuery.data.candidates);
        if (!fallback) throw new Error(t("locationError"));
        start = fallback;
      }
      const response = await apiRequest("POST", "/api/xpot/prospecting/routes", {
        routeDate: today,
        plannedStartAt: new Date().toISOString(),
        start,
        jobId: detailsQuery.data.job.id,
        shiftDurationMinutes: detailsQuery.data.job.shiftDurationMinutes,
        defaultVisitMinutes: detailsQuery.data.job.defaultVisitMinutes,
      });
      return response.json() as Promise<RouteDetails>;
    },
    onSuccess: async (data) => {
      setSelectedRouteId(data.route.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes"] });
      queryClient.setQueryData(["/api/xpot/prospecting/routes", data.route.id], data);
    },
    onError: (error: Error) => toast({ title: t("errorTitle"), description: error.message, variant: "destructive" }),
  });

  const autoRouteJobRef = useRef<number | null>(null);
  useEffect(() => {
    const currentDetails = detailsQuery.data;
    // Wait for today's routes to load: before that "no route yet" is unknown.
    if (!routesQuery.isSuccess) return;
    if (!currentDetails || currentDetails.job.status !== "completed" || currentDetails.summary.eligible === 0 || todayRoutes.length > 0) return;
    if (autoRouteJobRef.current === currentDetails.job.id || createRoute.isPending) return;
    autoRouteJobRef.current = currentDetails.job.id;
    createRoute.mutate();
  }, [detailsQuery.data, routesQuery.isSuccess, todayRoutes.length, createRoute.isPending]);

  const retryJob = useMutation({
    mutationFn: async (jobId: number) => {
      const response = await apiRequest("POST", `/api/xpot/prospecting/jobs/${jobId}/retry`);
      return response.json() as Promise<ProspectingJobDetails>;
    },
    onSuccess: async (data) => {
      setSelectedJobId(data.job.id);
      queryClient.setQueryData(["/api/xpot/prospecting/jobs", data.job.id], data);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/jobs"] });
      toast({ title: t("retryStarted") });
    },
    onError: (error: Error) => toast({ title: t("errorTitle"), description: error.message, variant: "destructive" }),
  });

  const publishRoute = useMutation({
    mutationFn: async (routeId: number) => {
      const response = await apiRequest("PATCH", `/api/xpot/prospecting/routes/${routeId}/status`, { status: "published" });
      return response.json() as Promise<ProspectingRoute>;
    },
    onSuccess: async (route) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes", route.id] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
      ]);
      toast({ title: t("published") });
    },
    onError: (error: Error) => toast({ title: t("errorTitle"), description: error.message, variant: "destructive" }),
  });

  const details = detailsQuery.data;
  const hasFailedRuns = details?.runs.some((run) => run.status === "failed") ?? false;
  const routeDetails = routeQuery.data;
  const directionsUrl = routeDetails ? mapsDirectionsUrl(routeDetails.route, routeDetails.stops) : null;
  const mapStops = useMemo(() => routeDetails?.stops.map((stop) => ({
    lat: Number(stop.lat),
    lng: Number(stop.lng),
    label: stop.name,
  })) ?? [], [routeDetails?.stops]);
  const mapSrc = useMemo(() => routeDetails && routeDetails.stops.length
    ? `/api/xpot/map?${new URLSearchParams({
        lat: routeDetails.route.startLat,
        lng: routeDetails.route.startLng,
        w: "640",
        h: "360",
        stops: routeDetails.stops.map((stop) => `${stop.lat},${stop.lng}`).join("|"),
      }).toString()}`
    : null, [routeDetails]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
      <section className="overflow-hidden rounded-[20px] p-4 sm:rounded-[24px] sm:p-7" style={{ ...cardStyle, background: "linear-gradient(135deg, rgba(79,70,229,0.16), rgba(14,165,233,0.06))" }}>
        <div className="mb-4 flex items-start gap-3 sm:mb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300 sm:h-11 sm:w-11"><Radar className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-bold text-white sm:text-xl">{t("title")}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-white/50 sm:leading-6">{t("subtitle")}</p>
          </div>
        </div>
        <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); createJob.mutate(); }}>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-white/65">{t("cityLabel")}</span>
            <div className="relative"><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={city} onChange={(event) => setCity(event.target.value)} placeholder={t("cityPlaceholder")} autoComplete="address-level2" className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-3 text-base text-white outline-none transition placeholder:text-white/25 focus:border-indigo-400/60 sm:h-11 sm:text-sm" /></div>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-white/65">{t("sectorsLabel")}</span>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={sectors} onChange={(event) => setSectors(event.target.value)} placeholder={t("sectorsPlaceholder")} className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-3 text-base text-white outline-none transition placeholder:text-white/25 focus:border-indigo-400/60 sm:h-11 sm:text-sm" /></div>
            <span className="mt-1.5 block text-[11px] text-white/30">{t("sectorsHint")}</span>
          </label>
          <Button type="submit" disabled={createJob.isPending || !city.trim() || parsedSearches.length === 0} className="order-4 h-12 w-full touch-manipulation rounded-xl bg-indigo-500 px-5 text-white md:order-none md:h-11 md:w-auto">
            {createJob.isPending ? <><Loader2 className="animate-spin" />{t("creating")}</> : <><RouteIcon />{t("buildToday")}</>}
          </Button>
          <fieldset className="order-3 md:order-none md:col-span-3">
            <legend className="mb-2 text-xs font-semibold text-white/65">{t("shiftLabel")}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[2, 4, 6, 8, 10, 12].map((hours) => (
                <button
                  key={hours}
                  type="button"
                  aria-pressed={shiftHours === hours}
                  onClick={() => setShiftHours(hours)}
                  className={`min-h-11 touch-manipulation rounded-xl border px-2 py-2 text-sm font-semibold transition ${shiftHours === hours ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-100" : "border-white/10 bg-black/10 text-white/45 hover:bg-white/[0.05]"}`}
                >
                  {t("shiftHours", { hours })}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-white/30">{t("shiftHint")}</p>
          </fieldset>
        </form>
      </section>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.35fr]">
        <section className="rounded-[20px] p-4 sm:rounded-[22px] sm:p-5" style={cardStyle}>
          <h2 className="mb-4 text-sm font-bold text-white">{t("recentPlans")}</h2>
          {todayJobs.length === 0 ? <p className="py-8 text-center text-sm text-white/35">{t("noPlans")}</p> : (
            <div className="space-y-2">
              {todayJobs.map((job) => (
                <button key={job.id} type="button" onClick={() => setSelectedJobId(job.id)} className={`flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-2xl border p-3 text-left transition ${activeJobId === job.id ? "border-indigo-400/40 bg-indigo-500/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"}`}>
                  <div className={`h-2.5 w-2.5 rounded-full ${job.status === "completed" ? "bg-emerald-400" : job.status === "failed" ? "bg-red-400" : "animate-pulse bg-sky-400"}`} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white/85">{job.location}</div><div className="text-[11px] text-white/35">{statusLabel(job.status, t)}</div></div>
                  <ChevronRight className="h-4 w-4 text-white/25" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-[20px] p-4 sm:rounded-[22px] sm:p-5" style={cardStyle} aria-live="polite">
          {detailsQuery.isLoading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-300" /></div> : details ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="text-xs font-semibold uppercase tracking-wider text-indigo-300">{statusLabel(details.job.status, t)}</div><h2 className="mt-1 text-lg font-bold text-white">{details.job.location}</h2></div>
                <div className="flex gap-2"><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">{t("found", { count: details.summary.eligible })}</span><span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-white/45">{t("excluded", { count: details.summary.excluded })}</span></div>
              </div>
              {!details.engine.configured ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">{t("engineUnavailable")}</div> : null}
              {details.job.errorMessage ? <div className="rounded-xl border border-red-400/20 bg-red-400/[0.08] p-3 text-xs text-red-200">{details.job.errorMessage}</div> : null}
              {details.job.expansionState?.currentArea ? <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.07] p-3 text-xs text-sky-200"><div>{t("currentArea", { area: details.job.expansionState.currentArea })}</div><div className="mt-1 text-sky-200/60">{t("expanding")}</div></div> : null}
              <div className="flex w-full min-w-0 snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
                {details.candidates.filter((candidate) => candidate.status !== "discarded").slice(0, 6).map((candidate) => <div key={candidate.id} className="max-w-64 basis-[78%] shrink-0 snap-start rounded-xl border border-white/[0.06] bg-black/10 p-3 sm:max-w-none sm:basis-auto"><div className="truncate text-xs font-semibold text-white/75">{candidate.name}</div><div className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/30">{candidate.address || "—"}</div></div>)}
              </div>
              {details.summary.eligible === 0 ? <p className="text-sm text-white/35">{t("emptyCandidates")}</p> : null}
              {hasFailedRuns ? (
                <Button onClick={() => retryJob.mutate(details.job.id)} disabled={retryJob.isPending || !details.engine.configured} className="h-12 w-full touch-manipulation rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 sm:h-10">
                  {retryJob.isPending ? <><Loader2 className="animate-spin" />{t("retrying")}</> : t("tryAgain")}
                </Button>
              ) : todayRoutes.length > 0 ? (
                <Button asChild className="h-12 w-full touch-manipulation rounded-xl bg-indigo-500 text-white sm:h-10">
                  <a href="#today-route"><Navigation />{t("viewRoute")}</a>
                </Button>
              ) : (
                <Button onClick={() => createRoute.mutate()} disabled={createRoute.isPending || details.summary.eligible === 0 || ["queued", "running"].includes(details.job.status)} className="h-12 w-full touch-manipulation rounded-xl bg-indigo-500 text-white sm:h-10">
                  {createRoute.isPending ? <><Loader2 className="animate-spin" />{t("preparingRoute")}</> : <><Navigation />{t("prepareRoute")}</>}
                </Button>
              )}
            </div>
          ) : <div className="flex min-h-48 items-center justify-center text-sm text-white/30">{t("noPlans")}</div>}
        </section>
      </div>

      {routeDetails ? (
        <section id="today-route" className="scroll-mt-4 overflow-hidden rounded-[20px] sm:rounded-[24px]" style={cardStyle}>
          <RoutePreviewMap
            start={{ lat: Number(routeDetails.route.startLat), lng: Number(routeDetails.route.startLng) }}
            stops={mapStops}
            encodedPolyline={routeDetails.route.optimizationMeta.encodedPolyline}
            fallbackSrc={mapSrc}
            alt={t("routeReady")}
          />
          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_0.9fr] lg:p-6">
            <div>
              <div className="flex items-center gap-2 text-indigo-300"><RouteIcon className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wider">{t("routeReady")}</span></div>
              <h2 className="mt-2 text-xl font-bold text-white">{routeDetails.route.name}</h2>
              <p className="mt-1 text-sm text-white/40">{t("routeSummary", { count: routeDetails.stops.length, hours: `${Math.max(1, Math.round(routeDetails.route.totalDurationSeconds / 360) / 10)}h` })}</p>
              <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                {routeDetails.route.status === "draft" ? <Button onClick={() => publishRoute.mutate(routeDetails.route.id)} disabled={publishRoute.isPending} className="h-12 w-full touch-manipulation rounded-xl bg-emerald-500 text-white sm:h-10 sm:w-auto">{publishRoute.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{publishRoute.isPending ? t("publishing") : t("publishRoute")}</Button> : <><span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300"><CheckCircle2 className="h-4 w-4" />{routeStatusLabel(routeDetails.route.status, t)}</span>{routeDetails.route.status !== "cancelled" ? <Button asChild className="h-12 w-full touch-manipulation rounded-xl bg-indigo-500 text-white sm:h-10 sm:w-auto"><Link href="/visits?view=day">{t("openVisits")}</Link></Button> : null}</>}
                {directionsUrl ? <Button asChild variant="outline" className="h-12 w-full touch-manipulation rounded-xl border-white/10 text-white sm:h-10 sm:w-auto"><a href={directionsUrl} target="_blank" rel="noreferrer"><Navigation />{t("openMaps")}</a></Button> : null}
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white">{t("visitOrder")}</h3>
                <span className="text-xs text-white/35">{t("stopCount", { count: routeDetails.stops.length })}</span>
              </div>
              <ol className="space-y-2">
                {routeDetails.stops.map((stop) => (
                  <li key={stop.id} className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-3 [contain-intrinsic-size:72px] [content-visibility:auto]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-200">{stop.position}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white/80">{stop.name}</div>
                      <div className="truncate text-[11px] text-white/35">{stop.address || "—"}</div>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-white/40">
                        <Clock3 className="h-3 w-3 shrink-0" />
                        <span>{t("driveMinutes", { minutes: driveMinutes(stop.travelDurationSeconds) })}</span>
                        {stop.estimatedArrivalAt ? <><span aria-hidden="true">·</span><span className="truncate">{t("arrivalAt", { time: new Date(stop.estimatedArrivalAt).toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" }) })}</span></> : null}
                      </div>
                      <span className="mt-1 block text-[9px] font-semibold uppercase tracking-wide text-white/30">{stopStatusLabel(stop.status, t)}</span>
                    </div>
                    <a
                      href={stopDirectionsUrl(stop)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t("navigateTo", { name: stop.name })}
                      className="flex min-h-11 min-w-11 touch-manipulation flex-col items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-2 text-[10px] font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
                    >
                      <Navigation className="h-4 w-4" />
                      <span className="mt-0.5">{t("go")}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
