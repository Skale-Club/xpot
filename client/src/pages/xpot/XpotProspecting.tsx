import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BellRing, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Loader2, Map as MapIcon, MapPin, MapPinCheck, Navigation, Radar, RefreshCw, Route as RouteIcon, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { prospectingMessages } from "@/i18n/messages/prospecting";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { subscribeToRoutePush } from "@/lib/pushNotifications";
import { useViewerAccess } from "@/lib/adminMode";
import { Link, useLocation, useSearchParams } from "wouter";
import { RoutePreviewMap } from "./components/RoutePreviewMap";
import { appleRouteUrl, appleStopUrl, googleRouteUrl, googleStopUrl, isAppleMobileDevice } from "./prospectingMaps";
import { GLASS } from "@/components/xpot/surface";
import { GradientTopLine } from "@/components/xpot/GradientTopLine";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GoogleLogo } from "@/components/ui/google-logo";
import { usePlaceSearch } from "./usePlaceSearch";
import {
  exclusionCounts,
  MAX_PROSPECTING_SECTORS,
  parseSectorSearches,
  prospectingProgress,
  routeDisplayName,
  selectableCandidateIds,
} from "./prospectingUi";

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
  runs: Array<{ id: number; status: string; location: string; niche: string; progress: number; wave: number; resultCount?: number }>;
  candidates: Array<{
    id: number;
    status: string;
    name: string;
    address: string | null;
    score: number;
    scoreReasons: string[];
    exclusionReason: string | null;
    lat: string | null;
    lng: string | null;
  }>;
  summary: { eligible: number; excluded: number };
  engine: { configured: boolean };
};

type ProspectingRoute = {
  id: number;
  jobId: number | null;
  name: string;
  routeDate: string;
  status: "draft" | "published" | "in_progress" | "completed" | "cancelled";
  startLat: string;
  startLng: string;
  endAddress: string | null;
  endLat: string | null;
  endLng: string | null;
  plannedEndAt: string | null;
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  optimizationMeta: { encodedPolyline?: string; returnHome?: boolean };
  createdAt: string;
};

type RouteStop = {
  id: number;
  leadId: number | null;
  visitId: number | null;
  position: number;
  status: "planned" | "en_route" | "checked_in" | "completed" | "skipped" | "rescheduled";
  name: string;
  address: string | null;
  lat: string;
  lng: string;
  score: number;
  travelDurationSeconds: number;
  estimatedArrivalAt: string | null;
  scoreReasons?: string[];
};

type RouteDetails = { route: ProspectingRoute; stops: RouteStop[] };
type CitySuggestion = { placeId: string; label: string; mainText: string; secondaryText: string };

type PlanningStep = 0 | 1 | 2 | 3;

const ROUTE_DRAFT_KEY = "xpot:route-planning-draft";
const MAX_PROSPECTING_CITIES = 5;
const SUGGESTIONS_GAP = 8;
const SUGGESTIONS_VIEWPORT_GAP = 8;
const SUGGESTIONS_MAX_HEIGHT = 280;

function FloatingSuggestions({
  anchorRef,
  children,
  id,
  open,
}: {
  anchorRef: RefObject<HTMLElement>;
  children: ReactNode;
  id: string;
  open: boolean;
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - SUGGESTIONS_GAP - SUGGESTIONS_VIEWPORT_GAP;
    const spaceAbove = rect.top - SUGGESTIONS_GAP - SUGGESTIONS_VIEWPORT_GAP;
    const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(SUGGESTIONS_MAX_HEIGHT, Math.max(112, placeAbove ? spaceAbove : spaceBelow));
    const width = Math.min(rect.width, viewportWidth - SUGGESTIONS_VIEWPORT_GAP * 2);
    const left = Math.max(
      SUGGESTIONS_VIEWPORT_GAP,
      Math.min(rect.left, viewportWidth - width - SUGGESTIONS_VIEWPORT_GAP),
    );

    setStyle(placeAbove
      ? { bottom: viewportHeight - rect.top + SUGGESTIONS_GAP, left, maxHeight, width }
      : { left, maxHeight, top: rect.bottom + SUGGESTIONS_GAP, width });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }

    updatePosition();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open, updatePosition]);

  if (!open || !style || typeof document === "undefined") return null;

  return createPortal(
    <div
      id={id}
      role="listbox"
      data-prospecting-suggestions
      style={style}
      className="pointer-events-auto fixed z-[100] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#111827] shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
    >
      {children}
    </div>,
    document.body,
  );
}

function loadRouteDraft(): { city: string; cities: string[]; sectors: string; shiftHours: number } {
  const fallback = { city: "", cities: [], sectors: "", shiftHours: 8 };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(ROUTE_DRAFT_KEY) ?? "null");
    const savedCities = Array.isArray(saved?.cities)
      ? saved.cities.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0).slice(0, MAX_PROSPECTING_CITIES)
      : [];
    const legacyCity = typeof saved?.city === "string" ? saved.city.trim().replace(/,\s*USA$/i, "") : "";
    const migratedCities = savedCities.length
      ? savedCities
      : /,\s*[A-Z]{2}$/i.test(legacyCity) ? [legacyCity] : [];
    return {
      city: migratedCities.length ? "" : legacyCity,
      cities: migratedCities,
      sectors: typeof saved?.sectors === "string" ? saved.sectors : "",
      shiftHours: [2, 4, 6, 8, 10, 12].includes(saved?.shiftHours) ? saved.shiftHours : 8,
    };
  } catch {
    return fallback;
  }
}

function citySuggestionLabel(suggestion: CitySuggestion) {
  const state = suggestion.secondaryText.split(",")[0]?.trim();
  return state ? `${suggestion.mainText}, ${state}` : suggestion.label.replace(/,\s*USA$/i, "");
}

function compactIdempotencyPart(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function driveMinutes(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}

function monthGrid(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leadingDays = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  return [
    ...Array.from({ length: leadingDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, monthIndex, index + 1)),
  ];
}

function statusLabel(status: ProspectingJob["status"], t: ReturnType<typeof useT<typeof prospectingMessages.en>>) {
  if (status === "queued") return t("statusQueued");
  if (status === "running") return t("statusRunning");
  if (status === "completed") return t("statusCompleted");
  return t("statusFailed");
}

function routeStatusLabel(status: ProspectingRoute["status"], t: ReturnType<typeof useT<typeof prospectingMessages.en>>, isPast = false) {
  if (status === "draft") return isPast ? t("routeNotStarted") : t("routeDraft");
  if (status === "in_progress") return t("routeInProgress");
  if (status === "completed") return t("routeCompleted");
  if (status === "cancelled") return t("routeCancelled");
  return t("published");
}

function runStatusLabel(status: string, t: ReturnType<typeof useT<typeof prospectingMessages.en>>) {
  if (status === "completed") return t("statusCompleted");
  if (status === "failed" || status === "cancelled") return t("statusFailed");
  if (status === "queued") return t("statusQueued");
  return t("statusRunning");
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
  const [, navigate] = useLocation();
  const [routeParams, setRouteParams] = useSearchParams();
  const [initialDraft] = useState(loadRouteDraft);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const sectorInputRef = useRef<HTMLInputElement>(null);
  const sectorAnchorRef = useRef<HTMLDivElement>(null);
  const [city, setCity] = useState(initialDraft.city);
  const [cities, setCities] = useState(initialDraft.cities);
  const [sectors, setSectors] = useState(initialDraft.sectors);
  const [sectorDraft, setSectorDraft] = useState("");
  const [shiftHours, setShiftHours] = useState(initialDraft.shiftHours);
  const [planningStep, setPlanningStep] = useState<PlanningStep>(0);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [sectorSuggestionsOpen, setSectorSuggestionsOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [candidateSelection, setCandidateSelection] = useState<{ jobId: number | null; ids: Set<number>; touched: boolean }>({
    jobId: null,
    ids: new Set(),
    touched: false,
  });
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const parsedSectors = useMemo(() => parseSectorSearches(sectors), [sectors]);
  const parsedSearches = parsedSectors.searches;
  const deferredCity = useDeferredValue(city.trim());
  const citySuggestionsQuery = useQuery<{ suggestions: CitySuggestion[] }>({
    queryKey: ["/api/xpot/place-autocomplete", deferredCity],
    enabled: builderOpen && planningStep === 0 && cities.length < MAX_PROSPECTING_CITIES && deferredCity.length >= 2,
    queryFn: async () => {
      const response = await fetch(`/api/xpot/place-autocomplete?q=${encodeURIComponent(deferredCity)}`, { credentials: "include" });
      if (!response.ok) throw new Error((await response.text()) || response.statusText);
      return response.json();
    },
  });
  const sectorFragment = sectorDraft.trim();
  const primaryCity = cities[0] ?? "";
  const sectorPlacesQuery = usePlaceSearch(
    sectorFragment && primaryCity ? `${sectorFragment} in ${primaryCity}` : sectorFragment,
    builderOpen && planningStep === 1 && sectorFragment.length >= 2,
    {},
  );
  const googleSectorSuggestions = useMemo(
    () => Array.from(new Set((sectorPlacesQuery.data?.results ?? []).map((place) => place.primaryType?.trim()).filter((value): value is string => Boolean(value)))).slice(0, 5),
    [sectorPlacesQuery.data?.results],
  );

  useEffect(() => {
    try {
      window.sessionStorage.setItem(ROUTE_DRAFT_KEY, JSON.stringify({ city, cities, sectors, shiftHours }));
    } catch {
      // Route planning still works when storage is unavailable.
    }
  }, [cities, city, sectors, shiftHours]);

  const jobsQuery = useQuery<ProspectingJob[]>({
    queryKey: ["/api/xpot/prospecting/jobs"],
    refetchInterval: (query) => (query.state.data?.some((job) => ["queued", "running"].includes(job.status)) ? 15_000 : false),
  });
  const routesQuery = useQuery<ProspectingRoute[]>({ queryKey: ["/api/xpot/prospecting/routes"] });
  const today = localDateKey();
  const todayJobs = useMemo(() => (jobsQuery.data ?? []).filter((job) => localDateKey(new Date(job.createdAt)) === today), [jobsQuery.data, today]);
  const todayRoutes = useMemo(() => (routesQuery.data ?? []).filter((route) => route.routeDate === today), [routesQuery.data, today]);
  const requestedJobId = useMemo(() => {
    const jobId = Number(routeParams.get("jobId"));
    return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
  }, [routeParams]);
  const recentUnroutedJobId = useMemo(() => {
    const routedJobIds = new Set((routesQuery.data ?? []).map((route) => route.jobId).filter((id): id is number => id !== null));
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    return (jobsQuery.data ?? []).find((job) => !routedJobIds.has(job.id) && new Date(job.createdAt).getTime() >= cutoff)?.id ?? null;
  }, [jobsQuery.data, routesQuery.data]);
  const activeJobId = requestedJobId ?? selectedJobId ?? (todayRoutes.length === 0 ? todayJobs[0]?.id ?? recentUnroutedJobId : null) ?? null;
  const activeRouteId = useMemo(() => {
    const routeId = Number(routeParams.get("routeId"));
    return Number.isSafeInteger(routeId) && routeId > 0 ? routeId : null;
  }, [routeParams]);

  const openRoute = (routeId: number) => {
    setSelectedJobId(null);
    const next = new URLSearchParams(routeParams);
    next.delete("jobId");
    next.set("routeId", String(routeId));
    setRouteParams(next);
  };

  const openJob = (jobId: number) => {
    setSelectedJobId(jobId);
    const next = new URLSearchParams(routeParams);
    next.delete("routeId");
    next.set("jobId", String(jobId));
    setRouteParams(next);
  };

  const closeRoute = () => {
    const next = new URLSearchParams(routeParams);
    next.delete("routeId");
    setRouteParams(next);
  };

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
      if (!cities.length || !searches.length || parsedSectors.overflow > 0) throw new Error(t("errorTitle"));
      const response = await apiRequest("POST", "/api/xpot/prospecting/jobs", {
        location: cities[0],
        locations: cities,
        searches,
        shiftDurationMinutes: shiftHours * 60,
        idempotencyKey: `today:${today}:${shiftHours}h:${compactIdempotencyPart(cities.join("|"))}:${compactIdempotencyPart(searches.map((search) => search.niche).join("|"))}`,
      });
      return response.json() as Promise<ProspectingJobDetails>;
    },
    onSuccess: async (data) => {
      try { window.sessionStorage.removeItem(ROUTE_DRAFT_KEY); } catch {}
      setPlanningStep(0);
      setBuilderOpen(false);
      openJob(data.job.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/jobs"] });
      toast({ title: t("searchStarted"), description: t("searchStartedBody") });
    },
    onError: (error: Error) => toast({ title: t("errorTitle"), description: error.message, variant: "destructive" }),
  });

  const { isSuperAdmin } = useViewerAccess();
  const createRoute = useMutation({
    // rebuild replaces today's route; the server only honours it for the platform owner.
    mutationFn: async (options: { rebuild?: boolean } | void) => {
      if (!detailsQuery.data) throw new Error(t("emptyCandidates"));
      const candidateIds = Array.from(candidateSelection.ids);
      if (!candidateIds.length) throw new Error(t("routeSelectionRequired"));
      let start: { lat: number; lng: number };
      try { start = await currentPosition(); }
      catch { throw new Error(t("locationError")); }
      const response = await apiRequest("POST", "/api/xpot/prospecting/routes", {
        routeDate: today,
        plannedStartAt: new Date().toISOString(),
        start,
        jobId: detailsQuery.data.job.id,
        candidateIds,
        shiftDurationMinutes: detailsQuery.data.job.shiftDurationMinutes,
        defaultVisitMinutes: detailsQuery.data.job.defaultVisitMinutes,
        rebuild: options ? options.rebuild ?? false : false,
      });
      return response.json() as Promise<RouteDetails>;
    },
    onSuccess: async (data, options) => {
      if (options && options.rebuild) toast({ title: t("routeRebuilt") });
      openRoute(data.route.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes"] });
      queryClient.setQueryData(["/api/xpot/prospecting/routes", data.route.id], data);
    },
    onError: (error: Error) => toast({ title: t("errorTitle"), description: error.message, variant: "destructive" }),
  });

  useEffect(() => {
    const currentDetails = detailsQuery.data;
    if (!currentDetails) return;
    const availableIds = selectableCandidateIds(currentDetails.candidates);
    setCandidateSelection((current) => {
      if (current.jobId !== currentDetails.job.id) {
        return { jobId: currentDetails.job.id, ids: new Set(availableIds), touched: false };
      }
      if (current.touched) {
        const available = new Set(availableIds);
        return { ...current, ids: new Set(Array.from(current.ids).filter((id) => available.has(id))) };
      }
      return { ...current, ids: new Set(availableIds) };
    });
    setShowAllCandidates(false);
  }, [detailsQuery.data?.job.id, detailsQuery.data?.candidates.length]);

  const enableReadyNotification = async () => {
    if (!("Notification" in window)) {
      toast({ title: t("notificationsUnavailable") });
      return;
    }
    const permission = Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permission !== "granted") return;
    try {
      await subscribeToRoutePush();
      setNotificationsEnabled(true);
      toast({ title: t("notificationsEnabled") });
    } catch (error) {
      console.error("[prospecting] push subscription failed:", error);
      toast({ title: t("errorTitle"), variant: "destructive" });
    }
  };

  const retryJob = useMutation({
    mutationFn: async (jobId: number) => {
      const response = await apiRequest("POST", `/api/xpot/prospecting/jobs/${jobId}/retry`);
      return response.json() as Promise<ProspectingJobDetails>;
    },
    onSuccess: async (data) => {
      openJob(data.job.id);
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

  const prepareCheckIn = useMutation({
    mutationFn: async ({ routeId, stopId }: { routeId: number; stopId: number }) => {
      const response = await apiRequest("POST", `/api/xpot/prospecting/routes/${routeId}/stops/${stopId}/prepare-check-in`, {});
      return response.json() as Promise<{ leadId: number; visitId: number }>;
    },
    onSuccess: async ({ leadId, visitId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes", activeRouteId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] }),
      ]);
      navigate(`/route/check-in?leadId=${leadId}&visitId=${visitId}`);
    },
    onError: (error: Error) => toast({ title: t("checkInUnavailable"), description: error.message, variant: "destructive" }),
  });

  const details = detailsQuery.data;
  const hasFailedRuns = details?.runs.some((run) => run.status === "failed") ?? false;
  const routeDetails = routeQuery.data;
  const routeIsToday = routeDetails?.route.routeDate === today;
  const routeContextLabel = routeIsToday ? t("routeReady") : t("pastRoute");
  const selectedRouteName = routeDetails ? routeDisplayName(routeDetails.route, t.locale) : "";
  const { currentStopId, nextStopId } = useMemo(() => {
    const stops = routeDetails?.stops ?? [];
    const inProgressIndex = stops.findIndex((stop) => ["checked_in", "en_route"].includes(stop.status));
    const currentIndex = inProgressIndex >= 0
      ? inProgressIndex
      : stops.findIndex((stop) => stop.status === "planned");
    const next = currentIndex >= 0
      ? stops.slice(currentIndex + 1).find((stop) => ["planned", "en_route"].includes(stop.status))
      : undefined;
    return {
      currentStopId: currentIndex >= 0 ? stops[currentIndex].id : null,
      nextStopId: next?.id ?? null,
    };
  }, [routeDetails]);
  const eligibleCandidates = details?.candidates.filter((candidate) => candidate.status !== "discarded" && candidate.status !== "visited") ?? [];
  const canReviewCandidates = details?.job.status === "completed";
  const visibleCandidates = showAllCandidates ? eligibleCandidates : eligibleCandidates.slice(0, 6);
  const excludedCounts = useMemo(() => exclusionCounts(details?.candidates ?? []), [details?.candidates]);
  const otherExcludedCount = Object.entries(excludedCounts).reduce(
    (sum, [reason, count]) => ["existing_customer", "previously_visited"].includes(reason) ? sum : sum + count,
    0,
  );
  const progress = details ? prospectingProgress({
    jobStatus: details.job.status,
    runs: details.runs,
    eligibleCount: details.summary.eligible,
    hasRoute: todayRoutes.length > 0,
  }) : null;
  const progressCopy = progress ? {
    queued: [t("progressQueuedTitle"), t("progressQueuedBody")],
    searching: [t("progressSearchingTitle"), t("progressSearchingBody")],
    filtering: [t("progressFilteringTitle"), t("progressFilteringBody")],
    review: [t("progressReviewTitle"), t("progressReviewBody")],
    route: [t("progressRouteTitle"), t("progressRouteBody")],
    failed: [t("progressFailedTitle"), t("progressFailedBody")],
  }[progress.stage] : null;
  const progressSteps = [t("progressSearch"), t("progressClean"), t("progressReview"), t("progressRoute")];
  const activeProgressStep = progress?.stage === "route" ? 3
    : progress?.stage === "review" ? 2
      : progress?.stage === "filtering" ? 1
        : 0;
  const activeRun = details?.runs.find((run) => run.status === "running");
  const nextRun = details?.runs.find((run) => run.status === "queued");
  const currentActivity = !details || !progress ? null
    : activeRun ? t("activitySearching", {
      sector: activeRun.niche.replaceAll("_", " "),
      location: details.job.expansionState?.currentArea || activeRun.location,
    })
      : nextRun ? t("activityPreparing", {
        sector: nextRun.niche.replaceAll("_", " "),
        location: details.job.expansionState?.currentArea || nextRun.location,
      })
        : progress.stage === "filtering" ? t("activityFiltering", { eligible: details.summary.eligible })
          : progress.stage === "review" || progress.stage === "route" ? t("activityReady", { count: details.summary.eligible })
            : progress.stage === "failed" ? t("activityFailed")
              : t("activityQueued");

  const toggleCandidate = (id: number) => {
    setCandidateSelection((current) => {
      const ids = new Set(current.ids);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { jobId: details?.job.id ?? current.jobId, ids, touched: true };
    });
  };
  const setAllCandidates = (selected: boolean) => {
    setCandidateSelection({
      jobId: details?.job.id ?? null,
      ids: new Set(selected ? selectableCandidateIds(details?.candidates ?? []) : []),
      touched: true,
    });
  };
  const reasonLabel = (reason: string) => ({
    "route-ready coordinates": t("reasonCoordinates"),
    "phone available": t("reasonPhone"),
    "email available": t("reasonEmail"),
    "website available": t("reasonWebsite"),
    "rating 4.0+": t("reasonRating"),
    "established review volume": t("reasonReviews"),
  }[reason] ?? reason);
  // Android and desktop navigate with Google Maps; an iPhone or iPad also gets Apple Maps.
  const appleDevice = useMemo(() => typeof navigator !== "undefined" && isAppleMobileDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0), []);
  const routeStart = routeDetails ? { lat: routeDetails.route.startLat, lng: routeDetails.route.startLng } : null;
  const directionsUrl = routeDetails && routeStart ? googleRouteUrl(routeStart, routeDetails.stops) : null;
  const appleDirectionsUrl = appleDevice && routeDetails && routeStart ? appleRouteUrl(routeStart, routeDetails.stops) : null;
  const mapStops = useMemo(() => routeDetails?.stops.map((stop) => ({
    lat: Number(stop.lat),
    lng: Number(stop.lng),
    label: stop.name,
  })) ?? [], [routeDetails?.stops]);
  const planningTitles = [t("cityStepTitle"), t("sectorsStepTitle"), t("durationStepTitle"), t("reviewStepTitle")];
  const planningBodies = [t("cityStepBody"), t("sectorsStepBody"), t("durationStepBody"), t("reviewStepBody")];
  const canAdvancePlanning = planningStep === 0
    ? cities.length > 0
    : planningStep === 1
      ? parsedSearches.length > 0 && parsedSectors.overflow === 0
      : true;
  const loadingExistingPlan = jobsQuery.isLoading
    || routesQuery.isLoading
    || (activeJobId !== null && detailsQuery.isLoading)
    || (activeRouteId !== null && routeQuery.isLoading);
  const routeDateKeys = useMemo(() => new Set((routesQuery.data ?? []).map((route) => route.routeDate)), [routesQuery.data]);
  const calendarDays = useMemo(() => monthGrid(calendarMonth), [calendarMonth]);
  const weekdayLabels = useMemo(() => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(t.locale, { weekday: "narrow" }).format(new Date(2024, 0, 7 + index))), [t.locale]);
  const visibleRecentRoutes = useMemo(() => {
    const routes = routesQuery.data ?? [];
    return (selectedCalendarDate ? routes.filter((route) => route.routeDate === selectedCalendarDate) : routes).slice(0, 5);
  }, [routesQuery.data, selectedCalendarDate]);
  const recentRoutesTitle = selectedCalendarDate
    ? t("routesForDate", { date: new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString(t.locale, { month: "short", day: "numeric" }) })
    : t("recentRoutes");

  const submitPlanningStep = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAdvancePlanning) return;
    if (planningStep < 3) {
      setPlanningStep((planningStep + 1) as PlanningStep);
      return;
    }
    createJob.mutate();
  };

  const addCity = (suggestion: CitySuggestion) => {
    const label = citySuggestionLabel(suggestion);
    if (cities.length >= MAX_PROSPECTING_CITIES || cities.some((value) => value.toLocaleLowerCase() === label.toLocaleLowerCase())) return;
    setCities((current) => [...current, label]);
    setCity("");
    setCitySuggestionsOpen(false);
    window.requestAnimationFrame(() => cityInputRef.current?.focus());
  };

  const removeCity = (label: string) => {
    setCities((current) => current.filter((value) => value !== label));
  };

  const addSector = (value = sectorDraft) => {
    if (!value.trim() || parsedSearches.length >= MAX_PROSPECTING_SECTORS) return;
    const next = parseSectorSearches([sectors, value].filter(Boolean).join(", ")).searches;
    setSectors(next.map((search) => search.query).join(", "));
    setSectorDraft("");
    setSectorSuggestionsOpen(false);
    window.requestAnimationFrame(() => sectorInputRef.current?.focus());
  };

  const removeSector = (niche: string) => {
    setSectors(parsedSearches.filter((search) => search.niche !== niche).map((search) => search.query).join(", "));
  };

  const pickSectorSuggestion = (suggestion: string) => {
    addSector(suggestion);
  };

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      {!loadingExistingPlan && !details && !routeDetails ? (
        <>
          {/* No top padding: the layout already spaces every page from the header. */}
          <section className="flex w-full pb-1">
            <button type="button" onClick={() => setBuilderOpen(true)} className="flex min-h-[92px] w-full items-center gap-4 rounded-[22px] bg-gradient-to-br from-blue-500 to-indigo-500 p-4 text-left text-white shadow-[0_12px_34px_rgba(59,130,246,0.28)] transition-transform active:scale-[0.985] lg:min-h-20 lg:px-6">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15"><RouteIcon className="h-7 w-7" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold tracking-tight">{t("openBuilder")}</span>
                <span className="mt-1 block text-sm leading-5 text-white/75">{t("openBuilderHint")}</span>
              </span>
              <ChevronRight className="h-6 w-6 shrink-0 text-white/90" />
            </button>
          </section>

          <section className="grid gap-7 border-t border-white/[0.08] pt-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white/85">
                  <CalendarDays className="h-4 w-4 text-indigo-300" />
                  <h2 className="text-sm font-bold">{t("calendarTitle")}</h2>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={t("previousMonth")} onClick={() => { setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1)); setSelectedCalendarDate(null); }} className="flex h-9 w-9 items-center justify-center rounded-full text-white/45 transition hover:bg-white/[0.06] hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
                  <p className="min-w-28 text-center text-xs font-semibold capitalize text-white/65">{calendarMonth.toLocaleDateString(t.locale, { month: "long", year: "numeric" })}</p>
                  <button type="button" aria-label={t("nextMonth")} onClick={() => { setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1)); setSelectedCalendarDate(null); }} className="flex h-9 w-9 items-center justify-center rounded-full text-white/45 transition hover:bg-white/[0.06] hover:text-white"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
                {weekdayLabels.map((label, index) => <span key={`${label}-${index}`} className="pb-2 text-[10px] font-bold uppercase text-white/30">{label}</span>)}
                {calendarDays.map((date, index) => {
                  if (!date) return <span key={`empty-${index}`} aria-hidden="true" className="h-10" />;
                  const dateKey = localDateKey(date);
                  const hasRoute = routeDateKeys.has(dateKey);
                  const selected = selectedCalendarDate === dateKey;
                  const isToday = dateKey === today;
                  return (
                    <button key={dateKey} type="button" aria-pressed={selected} onClick={() => setSelectedCalendarDate((current) => current === dateKey ? null : dateKey)} className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold transition ${selected ? "bg-indigo-500 text-white" : isToday ? "border border-indigo-300/50 text-indigo-100" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}>
                      {date.getDate()}
                      {hasRoute ? <span className={`absolute bottom-1 h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-sky-300"}`} aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex min-h-9 items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white/85">
                  <RouteIcon className="h-4 w-4 text-indigo-300" />
                  <h2 className="text-sm font-bold">{recentRoutesTitle}</h2>
                </div>
                {selectedCalendarDate ? <button type="button" onClick={() => setSelectedCalendarDate(null)} className="text-xs font-semibold text-indigo-300 transition hover:text-indigo-200">{t("recentRoutes")}</button> : null}
              </div>
              {visibleRecentRoutes.length ? (
                <div className="mt-3 divide-y divide-white/[0.08] border-y border-white/[0.08]">
                  {visibleRecentRoutes.map((route) => {
                    const durationHours = Math.max(0.1, Math.round(route.totalDurationSeconds / 360) / 10);
                    const distanceMiles = Math.max(0, route.totalDistanceMeters / 1609.344).toLocaleString(t.locale, { maximumFractionDigits: 1 });
                    return (
                      <button key={route.id} type="button" onClick={() => openRoute(route.id)} className="flex min-h-[76px] w-full items-center gap-3 py-3 text-left transition hover:bg-white/[0.025]">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300"><RouteIcon className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2"><strong className="truncate capitalize text-sm text-white/90">{routeDisplayName(route, t.locale)}</strong><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${route.status === "completed" ? "bg-emerald-400" : route.status === "cancelled" ? "bg-red-400" : "bg-sky-400"}`} /></span>
                          <span className="mt-1 block truncate text-xs text-white/45">{routeStatusLabel(route.status, t, route.routeDate < today)} · {t("routeDuration", { hours: durationHours })} · {t("routeDistance", { distance: distanceMiles })}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                      </button>
                    );
                  })}
                </div>
              ) : <p className="mt-3 border-y border-white/[0.08] py-8 text-center text-sm text-white/40">{t("noRecentRoutes")}</p>}
            </div>
          </section>

          <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
            <DialogContent
              onInteractOutside={(event) => {
                if ((event.target as HTMLElement | null)?.closest?.("[data-prospecting-suggestions]")) event.preventDefault();
              }}
              className="max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-[24px] border border-white/10 bg-[#090f1d] p-0 text-white shadow-[0_28px_90px_rgba(0,0,0,0.72)] sm:rounded-[28px]"
            >
              <GradientTopLine glow />
              <DialogTitle className="sr-only">{planningTitles[planningStep]}</DialogTitle>
              <DialogDescription className="sr-only">{planningBodies[planningStep]}</DialogDescription>
              <div className="min-h-[500px] p-5 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300"><Radar className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-bold text-white">{t("title")}</p>
                <p className="text-xs font-medium text-white/45">{t("setupProgress", { current: planningStep + 1, total: 4 })}</p>
              </div>
            </div>
            <span className="text-sm font-bold tabular-nums text-indigo-200">{planningStep + 1}/4</span>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2" aria-hidden="true">
            {[0, 1, 2, 3].map((step) => <span key={step} className={`h-1 rounded-full transition-colors ${step <= planningStep ? "bg-gradient-to-r from-indigo-400 to-sky-400" : "bg-white/10"}`} />)}
          </div>

          <form className="flex min-h-[390px] flex-col" onSubmit={submitPlanningStep}>
            <div className="flex-1 py-9 sm:py-12">
              <h1 className="max-w-xl text-2xl font-bold tracking-tight text-white sm:text-3xl">{planningTitles[planningStep]}</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/55 sm:text-base">{planningBodies[planningStep]}</p>

              {planningStep === 0 ? (
                <div className="mt-8">
                  <label className="sr-only" htmlFor="prospecting-city">{t("cityLabel")}</label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-300" />
                    <input
                      autoFocus
                      id="prospecting-city"
                      ref={cityInputRef}
                      value={city}
                      onChange={(event) => { setCity(event.target.value); setCitySuggestionsOpen(true); }}
                      onFocus={() => setCitySuggestionsOpen(true)}
                      onBlur={() => window.setTimeout(() => setCitySuggestionsOpen(false), 150)}
                      placeholder={t("cityPlaceholder")}
                      autoComplete="off"
                      disabled={cities.length >= MAX_PROSPECTING_CITIES}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="prospecting-city-suggestions"
                      aria-expanded={citySuggestionsOpen && cities.length < MAX_PROSPECTING_CITIES && deferredCity.length >= 2}
                      aria-describedby="prospecting-cities-help"
                      className="h-14 w-full rounded-2xl border border-white/15 bg-black/20 pl-12 pr-4 text-base text-white outline-none transition placeholder:text-white/30 focus:border-indigo-300/70 focus:bg-black/30 disabled:cursor-not-allowed"
                    />
                    <FloatingSuggestions
                      anchorRef={cityInputRef}
                      id="prospecting-city-suggestions"
                      open={citySuggestionsOpen && cities.length < MAX_PROSPECTING_CITIES && deferredCity.length >= 2}
                    >
                        {citySuggestionsQuery.isFetching ? <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" />{t("googleSuggestions")}</div> : null}
                        {citySuggestionsQuery.isError ? <div className="px-4 py-3 text-sm leading-5 text-amber-100/70">{t("googleUnavailable")}</div> : null}
                        {citySuggestionsQuery.data?.suggestions.map((suggestion) => (
                          <button
                            key={suggestion.placeId}
                            role="option"
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              addCity(suggestion);
                            }}
                            onClick={(event) => {
                              if (event.detail === 0) addCity(suggestion);
                            }}
                            className="flex w-full items-center gap-3 border-t border-white/[0.06] px-4 py-3 text-left transition first:border-t-0 hover:bg-white/[0.06]"
                          >
                            <MapPin className="h-4 w-4 shrink-0 text-indigo-300" />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white/90">{suggestion.mainText}</span><span className="block truncate text-xs text-white/40">{suggestion.secondaryText}</span></span>
                            <GoogleLogo className="h-4 w-4 shrink-0" />
                          </button>
                        ))}
                    </FloatingSuggestions>
                  </div>
                  {cities.length ? (
                    <div className="mt-3 flex flex-wrap gap-2" role="list" aria-label={t("areaSummary")}>
                      {cities.map((selectedCity) => (
                        <span key={selectedCity} role="listitem" className="inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-2xl border border-sky-300/20 bg-sky-500/15 py-1.5 pl-4 pr-2 text-base font-semibold text-sky-100">
                          <span className="truncate">{selectedCity}</span>
                          <button
                            type="button"
                            onClick={() => removeCity(selectedCity)}
                            aria-label={t("removeCity", { city: selectedCity })}
                            title={t("removeCity", { city: selectedCity })}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sky-100/65 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                          >
                            <X className="h-[18px] w-[18px]" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div id="prospecting-cities-help" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
                    <span>{t("cityHint")}</span>
                    <span className="font-semibold tabular-nums">{t("citiesCount", { count: cities.length, max: MAX_PROSPECTING_CITIES })}</span>
                  </div>
                </div>
              ) : null}

              {planningStep === 1 ? (
                <div className="mt-8">
                  <label className="sr-only" htmlFor="prospecting-sectors">{t("sectorsLabel")}</label>
                  <div ref={sectorAnchorRef} className="xpot-sector-combobox relative flex min-h-14 items-center rounded-2xl border border-white/15 bg-black/20 transition focus-within:border-indigo-300/70 focus-within:bg-black/30 focus-within:shadow-[0_0_0_3px_rgba(129,140,248,0.16)]">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-300" />
                    <input
                      autoFocus
                      id="prospecting-sectors"
                      ref={sectorInputRef}
                      value={sectorDraft}
                      onChange={(event) => { setSectorDraft(event.target.value); setSectorSuggestionsOpen(true); }}
                      onFocus={() => setSectorSuggestionsOpen(true)}
                      onBlur={() => window.setTimeout(() => setSectorSuggestionsOpen(false), 150)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && sectorDraft.trim()) {
                          event.preventDefault();
                          addSector();
                        } else if (event.key === "Backspace" && !sectorDraft && parsedSearches.length) {
                          removeSector(parsedSearches[parsedSearches.length - 1].niche);
                        }
                      }}
                      placeholder={t("sectorsPlaceholder")}
                      autoComplete="off"
                      disabled={parsedSearches.length >= MAX_PROSPECTING_SECTORS}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="prospecting-sector-suggestions"
                      aria-expanded={sectorSuggestionsOpen && sectorFragment.length >= 2 && (sectorPlacesQuery.isFetching || sectorPlacesQuery.isError || googleSectorSuggestions.length > 0)}
                      aria-describedby="prospecting-sectors-help"
                      className="h-14 min-w-0 flex-1 bg-transparent pl-12 pr-4 text-base text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed"
                    />
                    <FloatingSuggestions
                      anchorRef={sectorAnchorRef}
                      id="prospecting-sector-suggestions"
                      open={sectorSuggestionsOpen && sectorFragment.length >= 2 && (sectorPlacesQuery.isFetching || sectorPlacesQuery.isError || googleSectorSuggestions.length > 0)}
                    >
                        {sectorPlacesQuery.isFetching ? <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" />{t("googleSuggestions")}</div> : null}
                        {sectorPlacesQuery.isError ? <div className="px-4 py-3 text-sm leading-5 text-amber-100/70">{t("googleUnavailable")}</div> : null}
                        {googleSectorSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            role="option"
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              pickSectorSuggestion(suggestion);
                            }}
                            onClick={(event) => {
                              if (event.detail === 0) pickSectorSuggestion(suggestion);
                            }}
                            className="flex w-full items-center gap-3 border-t border-white/[0.06] px-4 py-3 text-left transition first:border-t-0 hover:bg-white/[0.06]"
                          >
                            <Search className="h-4 w-4 shrink-0 text-indigo-300" />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{suggestion}</span>
                            <GoogleLogo className="h-4 w-4 shrink-0" />
                          </button>
                        ))}
                    </FloatingSuggestions>
                  </div>
                  {parsedSearches.length ? (
                    <div className="mt-3 flex flex-wrap gap-2" role="list" aria-label={t("sectorsSummary")}>
                      {parsedSearches.map((sector) => (
                        <span key={sector.niche} role="listitem" className="inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-2xl border border-indigo-300/20 bg-indigo-500/15 py-1.5 pl-4 pr-2 text-base font-semibold text-indigo-100">
                          <span className="truncate">{sector.query}</span>
                          <button
                            type="button"
                            onClick={() => removeSector(sector.niche)}
                            aria-label={t("removeSector", { sector: sector.query })}
                            title={t("removeSector", { sector: sector.query })}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-indigo-100/65 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70"
                          >
                            <X className="h-[18px] w-[18px]" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div id="prospecting-sectors-help" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
                    <span>{t("sectorsHint")}</span>
                    <span className="font-semibold tabular-nums">{t("sectorsCount", { count: parsedSectors.total, max: MAX_PROSPECTING_SECTORS })}</span>
                  </div>
                </div>
              ) : null}

              {planningStep === 2 ? (
                <fieldset className="mt-8">
                  <legend className="sr-only">{t("shiftLabel")}</legend>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[2, 4, 6, 8, 10, 12].map((hours) => (
                      <button key={hours} type="button" aria-pressed={shiftHours === hours} onClick={() => setShiftHours(hours)} className={`min-h-16 touch-manipulation rounded-2xl border px-3 py-3 text-base font-bold transition ${shiftHours === hours ? "border-indigo-300/70 bg-indigo-500/25 text-white shadow-[0_0_24px_rgba(99,102,241,0.12)]" : "border-white/12 bg-black/10 text-white/55 hover:bg-white/[0.06] hover:text-white/80"}`}>
                        {t("shiftHours", { hours })}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {planningStep === 3 ? (
                <dl className="mt-7 divide-y divide-white/10 border-y border-white/10">
                  {[
                    { label: t("areaSummary"), value: cities.join(" • "), step: 0 as PlanningStep },
                    { label: t("sectorsSummary"), value: parsedSearches.map((search) => search.query).join(", "), step: 1 as PlanningStep },
                    { label: t("durationSummary"), value: t("shiftHours", { hours: shiftHours }), step: 2 as PlanningStep },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <dt className="text-xs font-semibold uppercase tracking-wider text-white/35">{item.label}</dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-white/85">{item.value}</dd>
                      </div>
                      <button type="button" onClick={() => setPlanningStep(item.step)} className="text-xs font-bold text-indigo-300 transition hover:text-indigo-200">{t("edit")}</button>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>

            <div className="flex items-center gap-3 border-t border-white/10 pt-5">
              {planningStep > 0 ? (
                <button type="button" onClick={() => setPlanningStep((planningStep - 1) as PlanningStep)} className="flex h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white/55 transition hover:bg-white/[0.05] hover:text-white/80"><ArrowLeft className="h-4 w-4" />{t("back")}</button>
              ) : <span />}
              <Button type="submit" disabled={!canAdvancePlanning || createJob.isPending} className="ml-auto h-12 min-w-36 touch-manipulation rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-5 font-bold text-white">
                {createJob.isPending ? <><Loader2 className="animate-spin" />{t("creating")}</> : planningStep === 3 ? <><RouteIcon />{t("buildToday")}</> : <>{t("continue")}<ChevronRight className="h-4 w-4" /></>}
              </Button>
            </div>
          </form>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      {loadingExistingPlan && !details && !routeDetails ? (
        <section className="flex min-h-[420px] items-center justify-center rounded-[20px]" style={GLASS}><Loader2 className="h-7 w-7 animate-spin text-indigo-300" /></section>
      ) : null}

      {!routeDetails && details ? (
        <section className="mx-auto min-w-0 max-w-3xl rounded-[20px] p-3 sm:rounded-[22px] sm:p-6" style={GLASS}>
          {detailsQuery.isLoading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-300" /></div> : details ? (
            <div className="space-y-4 sm:space-y-5">
              <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
                <div className="min-w-0"><div className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-300">{statusLabel(details.job.status, t)}</div><h2 className="mt-1 truncate text-xl font-bold text-white [text-wrap:balance]">{details.job.location}</h2></div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <span className="rounded-xl bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold tabular-nums text-emerald-200">{t("found", { count: details.summary.eligible })}</span>
                  <span className="rounded-xl bg-white/[0.07] px-3 py-2 text-center text-xs tabular-nums text-white/65">{t("excluded", { count: details.summary.excluded })}</span>
                </div>
              </div>

              {progress && progressCopy ? (
                <div className="rounded-2xl bg-indigo-400/[0.07] p-3 shadow-[inset_0_0_0_1px_rgba(165,180,252,0.18)] sm:p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-400/15 text-indigo-200"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
                      <p className="text-sm font-bold text-white [text-wrap:pretty]">{progressCopy[0]}</p>
                      <p className="mt-0.5 hidden text-xs leading-5 text-white/60 sm:block">{progressCopy[1]}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-indigo-100">{progress.percent}%</span>
                  </div>
                  <div className="relative mt-4">
                    <div className="absolute inset-x-0 top-3.5 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={progressCopy[0]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                      <div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-[width] duration-300" style={{ width: `${progress.percent}%` }}>
                        {["queued", "running"].includes(details.job.status) ? <span className="xpot-progress-shimmer absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-white/75 to-transparent" aria-hidden="true" /> : null}
                      </div>
                    </div>
                    <ol className="relative z-10 grid grid-cols-4 gap-1 sm:gap-2">
                    {progressSteps.map((step, index) => (
                      <li key={step} aria-label={step} aria-current={activeProgressStep === index ? "step" : undefined} className={`text-center text-xs font-semibold ${index <= activeProgressStep ? "text-indigo-100" : "text-white/45"}`}>
                        <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border shadow-[0_0_0_4px_rgba(20,27,49,0.95)] sm:mb-1 ${index < activeProgressStep ? "border-emerald-300/50 bg-[#173c3d] text-emerald-200" : index === activeProgressStep ? "border-indigo-300/70 bg-[#29345f] text-indigo-100" : "border-white/15 bg-[#171d30] text-white/45"}`}>
                          {index < activeProgressStep ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                        </span>
                        <span className="mt-1 block truncate text-[10px] leading-4 sm:text-xs">{step}</span>
                      </li>
                    ))}
                    </ol>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div key={currentActivity} className="flex min-h-10 w-full min-w-0 animate-in items-center gap-2.5 rounded-xl bg-black/15 px-3 py-2 text-xs fade-in slide-in-from-bottom-1 duration-200" role="status" aria-live="polite" aria-atomic="true">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${["queued", "running"].includes(details.job.status) ? "animate-pulse bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.7)]" : details.job.status === "completed" ? "bg-emerald-300" : "bg-amber-300"}`} aria-hidden="true" />
                      <span className="shrink-0 font-bold uppercase tracking-[0.12em] text-indigo-200">{t("activityLabel")}</span>
                      <span className="min-w-0 break-words leading-5 text-pretty text-white/65">{currentActivity}</span>
                    </div>
                    {["queued", "running"].includes(details.job.status) ? (
                      <div className="flex justify-end">
                        <Button type="button" variant="outline" disabled={notificationsEnabled} onClick={() => void enableReadyNotification()} className="min-h-10 w-full rounded-xl border-white/12 bg-black/10 text-xs text-white active:scale-[0.96] sm:w-auto">
                          <BellRing className="h-4 w-4" />{notificationsEnabled ? t("notificationsEnabled") : t("notifyWhenReady")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!details.engine.configured ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">{t("engineUnavailable")}</div> : null}
              {details.job.errorMessage ? <div className="rounded-xl border border-red-400/20 bg-red-400/[0.08] p-3 text-sm text-red-100" role="alert">{details.job.errorMessage}</div> : null}
              {details.job.expansionState?.currentArea ? <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.07] p-3 text-xs text-sky-200"><div>{t("currentArea", { area: details.job.expansionState.currentArea })}</div><div className="mt-1 text-sky-200/60">{t("expanding")}</div></div> : null}

              {details.runs.length > 1 && ["queued", "running"].includes(details.job.status) ? (
                <details className="group rounded-xl bg-black/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-white/70">
                    <span>{t("searchDetails", { completed: details.runs.filter((run) => run.status === "completed").length, total: details.runs.length })}</span>
                    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="grid gap-2 border-t border-white/[0.06] p-2 sm:grid-cols-2">
                    {details.runs.slice(0, 6).map((run) => (
                      <div key={run.id} className="flex min-h-10 items-center gap-3 rounded-lg bg-white/[0.035] px-3 py-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${run.status === "completed" ? "bg-emerald-400" : run.status === "failed" ? "bg-red-400" : "bg-sky-400"}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/70">{t("runProgress", { sector: run.niche.replaceAll("_", " "), status: runStatusLabel(run.status, t) })}</span>
                        <span className="text-xs tabular-nums text-white/55">{Math.max(0, Math.min(100, run.progress))}%</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {details.summary.excluded > 0 ? (
                <details className="group rounded-xl border border-white/10 bg-black/10 p-3">
                  <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-white/75">
                    {t("exclusionBreakdown", { count: details.summary.excluded })}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="mt-3 grid gap-2 text-xs text-white/65 sm:grid-cols-3">
                    <span>{t("exclusionExistingCustomer")}: <strong className="text-white">{excludedCounts.existing_customer ?? 0}</strong></span>
                    <span>{t("exclusionPreviouslyVisited")}: <strong className="text-white">{excludedCounts.previously_visited ?? 0}</strong></span>
                    <span>{t("exclusionOther")}: <strong className="text-white">{otherExcludedCount}</strong></span>
                  </div>
                </details>
              ) : null}

              {canReviewCandidates && eligibleCandidates.length > 0 ? (
                <div className="border-t border-white/[0.07] pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-white [text-wrap:balance]">{t("candidateReview")}</h3>
                      <p className="mt-1 hidden max-w-xl text-xs leading-5 text-white/60 sm:block">{t("candidateReviewBody")}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-400/10 px-3 py-1.5 text-xs font-semibold tabular-nums text-indigo-100">{t("selectedCandidates", { selected: candidateSelection.ids.size, total: eligibleCandidates.length })}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <button type="button" disabled={todayRoutes.length > 0} onClick={() => setAllCandidates(true)} className="min-h-10 rounded-xl bg-white/[0.055] px-3 text-xs font-semibold text-white/75 transition-colors duration-200 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.96]">{t("selectAll")}</button>
                    <button type="button" disabled={todayRoutes.length > 0} onClick={() => setAllCandidates(false)} className="min-h-10 rounded-xl bg-white/[0.055] px-3 text-xs font-semibold text-white/75 transition-colors duration-200 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.96]">{t("selectNone")}</button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {visibleCandidates.map((candidate) => {
                      const selected = candidateSelection.ids.has(candidate.id);
                      return (
                        <label key={candidate.id} className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-colors duration-200 active:scale-[0.99] ${selected ? "bg-indigo-400/[0.11] shadow-[inset_0_0_0_1px_rgba(165,180,252,0.45)]" : "bg-black/10 hover:bg-white/[0.05]"}`}>
                          <input type="checkbox" checked={selected} onChange={() => toggleCandidate(candidate.id)} disabled={todayRoutes.length > 0} className="mt-1 h-5 w-5 shrink-0 accent-indigo-500" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="line-clamp-2 text-sm font-semibold text-white/90 [text-wrap:pretty]">{candidate.name}</span>
                              <span className="shrink-0 rounded-lg bg-white/[0.08] px-2 py-1 text-xs font-bold tabular-nums text-white/75">{t("scoreLabel", { score: candidate.score })}</span>
                            </span>
                            <span className="mt-1 block truncate text-xs leading-5 text-white/55">{candidate.address || "—"}</span>
                            {candidate.scoreReasons.length ? <span className="mt-2 hidden flex-wrap gap-1.5 sm:flex">{candidate.scoreReasons.slice(0, 2).map((reason) => <span key={reason} className="rounded-md bg-emerald-400/[0.09] px-2 py-1 text-xs font-medium text-emerald-100">{reasonLabel(reason)}</span>)}</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {eligibleCandidates.length > 6 ? (
                    <button type="button" onClick={() => setShowAllCandidates((value) => !value)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-indigo-200 transition hover:bg-indigo-400/[0.08]">
                      {showAllCandidates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{showAllCandidates ? t("showFewerCandidates") : t("showAllCandidates")}
                    </button>
                  ) : null}
                </div>
              ) : canReviewCandidates ? <p className="text-sm text-white/60">{t("emptyCandidates")}</p> : null}

              {hasFailedRuns ? (
                <Button onClick={() => retryJob.mutate(details.job.id)} disabled={retryJob.isPending || !details.engine.configured} className="h-12 w-full touch-manipulation rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 sm:h-10">
                  {retryJob.isPending ? <><Loader2 className="animate-spin" />{t("retrying")}</> : t("tryAgain")}
                </Button>
              ) : !canReviewCandidates ? null : todayRoutes.length > 0 ? (
                <Button asChild className="h-12 w-full touch-manipulation rounded-xl bg-indigo-500 text-white sm:h-10">
                  <a href="#today-route"><Navigation />{t("viewRoute")}</a>
                </Button>
              ) : (
                <div>
                  <Button onClick={() => createRoute.mutate()} disabled={createRoute.isPending || candidateSelection.ids.size === 0 || ["queued", "running"].includes(details.job.status)} className="h-12 w-full touch-manipulation rounded-xl bg-indigo-500 text-white sm:h-11">
                  {createRoute.isPending ? <><Loader2 className="animate-spin" />{t("preparingRoute")}</> : <><Navigation />{t("prepareRoute")}</>}
                  </Button>
                  <p className="mt-2 text-center text-xs leading-5 text-white/60">{candidateSelection.ids.size === 0 ? t("routeSelectionRequired") : t("routeReviewHint")}</p>
                </div>
              )}
            </div>
          ) : <div className="flex min-h-48 items-center justify-center text-sm text-white/60">{t("noPlans")}</div>}
        </section>
      ) : null}

      {routeDetails ? (
        <section id="today-route" className="scroll-mt-4 overflow-hidden rounded-[20px] sm:rounded-[24px]" style={GLASS}>
          <div className="border-b border-white/[0.08] px-4 py-2 sm:px-5">
            <button type="button" onClick={closeRoute} className="flex min-h-10 items-center gap-2 text-xs font-semibold text-white/55 transition hover:text-white"><ArrowLeft className="h-4 w-4" />{t("backToRoutes")}</button>
          </div>
          <div className="grid lg:h-[calc(100vh-11rem)] lg:min-h-[620px] lg:max-h-[820px] lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
            <div className="min-w-0 overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r">
              <RoutePreviewMap
                start={{ lat: Number(routeDetails.route.startLat), lng: Number(routeDetails.route.startLng) }}
                stops={mapStops}
                encodedPolyline={routeDetails.route.optimizationMeta.encodedPolyline}
                alt={routeContextLabel}
                showCurrentLocation={routeIsToday}
                className="lg:h-full"
              />
            </div>
            <div className="min-w-0 space-y-6 p-4 sm:p-5 lg:overflow-y-auto lg:p-6">
            <div>
              <div className="flex items-center gap-2 text-indigo-300"><RouteIcon className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wider">{routeContextLabel}</span></div>
              <h2 className="mt-2 text-xl font-bold capitalize text-white">{selectedRouteName}</h2>
              <p className="mt-1 text-sm text-white/65">{t("routeSummary", { count: routeDetails.stops.length, hours: `${Math.max(1, Math.round(routeDetails.route.totalDurationSeconds / 360) / 10)}h` })}</p>
              <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                {routeDetails.route.status === "draft" && routeIsToday ? <Button onClick={() => publishRoute.mutate(routeDetails.route.id)} disabled={publishRoute.isPending} className="h-11 w-full touch-manipulation rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white sm:w-auto">{publishRoute.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{publishRoute.isPending ? t("publishing") : t("publishRoute")}</Button> : <><span className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold ${routeDetails.route.status === "completed" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-white/65"}`}><CheckCircle2 className="h-4 w-4" />{routeStatusLabel(routeDetails.route.status, t, routeDetails.route.routeDate < today)}</span>{routeIsToday && !["cancelled", "draft"].includes(routeDetails.route.status) ? <Button asChild className="h-11 w-full touch-manipulation rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white sm:w-auto"><Link href="/visits?view=day">{t("openVisits")}</Link></Button> : null}</>}
                {directionsUrl ? <Button asChild variant="outline" className="h-11 w-full touch-manipulation rounded-xl border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 hover:bg-white/[0.08] hover:text-white sm:w-auto"><a href={directionsUrl} target="_blank" rel="noreferrer"><Navigation />{t("openMaps")}</a></Button> : null}
                {appleDirectionsUrl ? <Button asChild variant="outline" className="h-11 w-full touch-manipulation rounded-xl border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 hover:bg-white/[0.08] hover:text-white sm:w-auto"><a href={appleDirectionsUrl} target="_blank" rel="noreferrer"><Navigation />{t("openAppleMaps")}</a></Button> : null}
                {isSuperAdmin && details ? (
                  <Button
                    variant="outline"
                    onClick={() => createRoute.mutate({ rebuild: true })}
                    disabled={createRoute.isPending || ["queued", "running"].includes(details.job.status)}
                    className="h-11 w-full touch-manipulation rounded-xl border-amber-400/30 px-4 text-sm font-semibold text-amber-200 sm:w-auto"
                  >
                    {createRoute.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}{t("rebuildRoute")}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="border-t border-white/[0.08] pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white">{t("visitOrder")}</h3>
                <span className="text-xs text-white/60">{t("stopCount", { count: routeDetails.stops.length })}</span>
              </div>
              <ol className="space-y-2">
                {routeDetails.stops.map((stop) => {
                  const stopUrl = appleDevice ? appleStopUrl(stop) : googleStopUrl(stop);
                  const numberRailClass = stop.id === currentStopId
                    ? "border-blue-300/45 bg-blue-500 text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.12)]"
                    : stop.id === nextStopId
                      ? "border-violet-300/20 bg-violet-400/[0.14] text-violet-100/85 shadow-[inset_-1px_0_0_rgba(196,181,253,0.1)]"
                      : "border-white/10 bg-white/[0.035] text-white/45";
                  const checkInToneClass = stop.id === currentStopId
                    ? "bg-blue-500 text-white hover:bg-blue-400 focus-visible:ring-blue-300/60"
                    : stop.id === nextStopId
                      ? "border border-violet-300/25 bg-violet-400/[0.16] text-violet-100/85 hover:border-violet-200/35 hover:bg-violet-400/[0.24] hover:text-white focus-visible:ring-violet-300/45"
                      : "border border-white/10 bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/80 focus-visible:ring-white/30";
                  return (
                    <li key={stop.id} className="grid min-h-[84px] grid-cols-[3.5rem_minmax(0,1fr)] items-stretch overflow-hidden rounded-xl border border-white/10 bg-black/10 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] [contain-intrinsic-size:84px] [content-visibility:auto]">
                      <span className={`row-span-2 flex w-14 shrink-0 items-center justify-center self-stretch border-r px-2 text-sm font-bold tabular-nums transition-colors sm:row-span-1 ${numberRailClass}`}>{stop.position}</span>
                      <div className="min-w-0 px-4 py-3">
                        <div className="line-clamp-2 text-sm font-semibold text-white/90">{stop.name}</div>
                        <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-white/60">{stop.address || "No address"}</div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-white/65">
                          <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{t("driveMinutes", { minutes: driveMinutes(stop.travelDurationSeconds) })}</span>
                          {stop.estimatedArrivalAt ? <><span aria-hidden="true">·</span><span>{t("arrivalAt", { time: new Date(stop.estimatedArrivalAt).toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" }) })}</span></> : null}
                        </div>
                        <span className="mt-1.5 block text-xs font-semibold uppercase tracking-wide text-white/60">{stopStatusLabel(stop.status, t)}</span>
                      </div>
                      <div className="col-start-2 flex justify-end gap-2 px-3 pb-3 sm:col-start-auto sm:shrink-0 sm:items-center sm:py-3 sm:pl-0">
                        {["planned", "en_route"].includes(stop.status) ? (
                          <Button
                            type="button"
                            onClick={() => prepareCheckIn.mutate({ routeId: routeDetails.route.id, stopId: stop.id })}
                            disabled={prepareCheckIn.isPending}
                            aria-label={t("checkIn")}
                            title={t("checkIn")}
                            className={`h-11 w-11 shrink-0 touch-manipulation rounded-xl p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1020] active:translate-y-0 ${checkInToneClass}`}
                          >
                            {prepareCheckIn.isPending && prepareCheckIn.variables?.stopId === stop.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPinCheck className="h-5 w-5" strokeWidth={2} />}
                          </Button>
                        ) : null}
                        <a
                          href={stopUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={appleDevice ? t("navigateWithApple", { name: stop.name }) : t("navigateTo", { name: stop.name })}
                          title={appleDevice ? t("navigateWithApple", { name: stop.name }) : t("navigateTo", { name: stop.name })}
                          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-indigo-300/30 bg-indigo-500/10 text-indigo-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:-translate-y-0.5 hover:border-indigo-200/50 hover:bg-indigo-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1020] active:translate-y-0"
                        >
                          <MapIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
