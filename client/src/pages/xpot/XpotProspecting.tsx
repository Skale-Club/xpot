import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, ExternalLink, GripVertical, Home, Map as MapIcon, MapPin, MapPinCheck, Navigation, Nfc, Phone, Radar, RefreshCw, RotateCw, Route as RouteIcon, SearchX, Search, ShieldCheck, Sparkles, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/ui/loader";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { prospectingMessages } from "@/i18n/messages/prospecting";
import { prospectingUiMessages } from "@/i18n/messages/prospectingUi";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { subscribeToRoutePush } from "@/lib/pushNotifications";
import { useViewerAccess } from "@/lib/adminMode";
import { formatDistance, formatDuration, formatTime } from "@/lib/format";
import { Link, useLocation, useSearchParams } from "wouter";
import { RoutePreviewMap, type RouteLandmark } from "./components/RoutePreviewMap";
import { FloatingSuggestions, SuggestionOption, SuggestionStatus, SUGGESTIONS_ATTRIBUTE } from "./components/PlaceSuggestions";
import { appleRouteUrl, googleRouteUrl, isAppleMobile, stopNavigationUrl } from "./prospectingMaps";
import { ACCENT_SELECTED, GLASS, GLASS_CLASS, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { PILL_DOTS, Pill, RUN_STATUS_TONE, toneOf } from "@/components/xpot/StatusPill";
import { EmptyState } from "@/components/xpot/EmptyState";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { BackLink } from "@/components/xpot/PageHeader";
import { GradientTopLine } from "@/components/xpot/GradientTopLine";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GoogleLogo } from "@/components/ui/google-logo";
import { usePlaceSearch } from "./usePlaceSearch";
import { setSellTo } from "@/pages/tags/lib";
import {
  activeRunTiming,
  eligibleCandidates as eligibleOf,
  exclusionCounts,
  isStopOpen,
  searchPhase,
  MAX_PROSPECTING_SECTORS,
  moveIdByOffset,
  parseSectorSearches,
  prospectingProgress,
  reorderIdsAroundTarget,
  routeDisplayName,
  routeFill,
  routeStatusIcon,
  routeStatusLabel,
  routeStatusTone,
  samePlace,
  stopMarkerTone,
  stopStatusLabelKey,
  stopStatusTone,
  STOP_MARKER_TONES,
  MAP_POINT_TONES,
  routeOfJob,
  todayRouteOf,
  selectableCandidateIds,
  serverNowMs,
  wholeMinutes,
  type ProspectingTiming,
} from "./prospectingUi";
import { useNow } from "@/hooks/use-now";
import { MAX_DAILY_PROSPECTING_SESSIONS, PROSPECTING_DAY_END_HOUR, PROSPECTING_SHIFT_MINUTES, minutesUntilProspectingDayEnd } from "@shared/prospecting";

type ProspectingJob = {
  id: number;
  status: "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";
  routePlanningStatus: "pending" | "building" | "ready" | "failed";
  routeErrorMessage: string | null;
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
  runs: Array<{ id: number; status: string; location: string; niche: string; progress: number; wave: number; resultCount?: number; requestedMaxResults?: number; startedAt?: string | null }>;
  timing?: ProspectingTiming;
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
  /** "ad_hoc": a visit made off the plan while the route ran. */
  origin?: "planned" | "ad_hoc";
  name: string;
  address: string | null;
  lat: string;
  lng: string;
  score: number;
  travelDurationSeconds: number;
  estimatedArrivalAt: string | null;
  scoreReasons?: string[];
  googlePlaceId: string | null;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  website: string | null;
};

type RouteDetails = { route: ProspectingRoute; stops: RouteStop[] };
type CitySuggestion = { placeId: string; label: string; mainText: string; secondaryText: string };

type PlanningStep = 0 | 1 | 2 | 3;

const ROUTE_DRAFT_KEY = "xpot:route-planning-draft";
const MAX_PROSPECTING_CITIES = 5;
const SHIFT_HOUR_OPTIONS = PROSPECTING_SHIFT_MINUTES.map((minutes) => minutes / 60);

/** The removable city and sector chips of the planner: one tone for both. */
const TAG_CHIP = "inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-2xl border border-blue-300/20 bg-blue-500/15 py-1.5 pl-4 pr-2 text-base font-semibold text-blue-100";
const TAG_CHIP_REMOVE = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-blue-100/65 transition hover:bg-white/10 hover:text-white";

/** A swatch of the map legend, drawn from the marker colours. */
function LegendItem({ tone, glyph, label }: { tone: { background: string; border: string; text: string }; glyph?: string | null; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[8px] font-bold leading-none" style={{ background: tone.background, borderColor: tone.border, color: tone.text }} aria-hidden="true">{glyph ?? null}</span>
      <span>{label}</span>
    </li>
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
      shiftHours: SHIFT_HOUR_OPTIONS.includes(saved?.shiftHours) ? saved.shiftHours : 8,
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

function driveMinutes(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}

function statusLabel(status: ProspectingJob["status"], t: ReturnType<typeof useT<typeof prospectingMessages.en>>) {
  if (status === "queued") return t("statusQueued");
  if (status === "running") return t("statusRunning");
  if (status === "completed") return t("statusCompleted");
  return t("statusFailed");
}

function runStatusLabel(status: string, t: ReturnType<typeof useT<typeof prospectingMessages.en>>) {
  if (status === "completed") return t("statusCompleted");
  if (status === "failed" || status === "cancelled") return t("statusFailed");
  if (status === "queued") return t("statusQueued");
  return t("statusRunning");
}

export function XpotProspecting() {
  const t = useT(prospectingMessages);
  const tu = useT(prospectingUiMessages);
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
  // Routes are same-day and end by 10 PM, so later in the day the longer
  // shifts gray out. The clock only ticks while the planner is open.
  const plannerNow = useNow(60_000, builderOpen);
  const dayEndLabel = useMemo(() => {
    const end = new Date(plannerNow);
    end.setHours(PROSPECTING_DAY_END_HOUR, 0, 0, 0);
    return formatTime(end, t.locale);
  }, [plannerNow, t.locale]);
  const minutesLeftToday = minutesUntilProspectingDayEnd(new Date(plannerNow));
  const availableShiftHours = SHIFT_HOUR_OPTIONS.filter((hours) => hours * 60 <= minutesLeftToday);
  const latestShiftHours = availableShiftHours[availableShiftHours.length - 1];
  useEffect(() => {
    if (latestShiftHours !== undefined && shiftHours > latestShiftHours) setShiftHours(latestShiftHours);
  }, [latestShiftHours, shiftHours]);
  const shiftFitsToday = availableShiftHours.includes(shiftHours);
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [sectorSuggestionsOpen, setSectorSuggestionsOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<number | null>(null);
  const [stopPendingRemoval, setStopPendingRemoval] = useState<RouteStop | null>(null);
  const [draggedStopId, setDraggedStopId] = useState<number | null>(null);
  const [dragOverStopId, setDragOverStopId] = useState<number | null>(null);
  const [dragPlacement, setDragPlacement] = useState<"before" | "after" | null>(null);
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
    refetchInterval: (query) => (query.state.data?.some((job) => ["queued", "running"].includes(job.status)
      || ["pending", "building"].includes(job.routePlanningStatus)) ? 10_000 : false),
  });
  const routesQuery = useQuery<ProspectingRoute[]>({
    queryKey: ["/api/xpot/prospecting/routes"],
    refetchOnWindowFocus: true,
    refetchInterval: jobsQuery.data?.some((job) => job.status === "completed" && ["pending", "building"].includes(job.routePlanningStatus)) ? 10_000 : false,
  });
  const today = localDateKey();
  const todayJobs = useMemo(() => (jobsQuery.data ?? []).filter((job) => localDateKey(new Date(job.createdAt)) === today), [jobsQuery.data, today]);
  const todayRoutes = useMemo(() => (routesQuery.data ?? []).filter((route) => route.routeDate === today), [routesQuery.data, today]);
  const activeTodayRoute = todayRouteOf(todayRoutes, today);
  const pendingTodayJob = todayJobs.find((job) => ["draft", "queued", "running"].includes(job.status)
    || ["pending", "building"].includes(job.routePlanningStatus));
  const dailyRouteLimitReached = todayJobs.length >= MAX_DAILY_PROSPECTING_SESSIONS;
  const requestedJobId = useMemo(() => {
    const jobId = Number(routeParams.get("jobId"));
    return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
  }, [routeParams]);
  const recentUnroutedJobId = useMemo(() => {
    const routedJobIds = new Set((routesQuery.data ?? []).map((route) => route.jobId).filter((id): id is number => id !== null));
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    return (jobsQuery.data ?? []).find((job) => !routedJobIds.has(job.id)
      && job.routePlanningStatus !== "ready"
      && new Date(job.createdAt).getTime() >= cutoff)?.id ?? null;
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

  const generatedRoute = routeOfJob(routesQuery.data, activeJobId);
  useEffect(() => {
    if (!generatedRoute || activeRouteId === generatedRoute.id) return;
    setSelectedJobId(null);
    const next = new URLSearchParams(routeParams);
    next.delete("jobId");
    next.set("routeId", String(generatedRoute.id));
    setRouteParams(next);
  }, [activeRouteId, generatedRoute?.id]);

  const closeRoute = () => {
    const next = new URLSearchParams(routeParams);
    next.delete("routeId");
    setRouteParams(next);
  };

  const detailsQuery = useQuery<ProspectingJobDetails>({
    queryKey: ["/api/xpot/prospecting/jobs", activeJobId],
    enabled: activeJobId !== null,
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return job && (["queued", "running"].includes(job.status) || ["pending", "building"].includes(job.routePlanningStatus)) ? 8_000 : false;
    },
  });
  // Progress follows elapsed time between polls, so the bar moves while a search runs.
  const now = useNow(5_000, detailsQuery.data?.job.status === "running");
  const routeQuery = useQuery<RouteDetails>({
    queryKey: ["/api/xpot/prospecting/routes", activeRouteId],
    enabled: activeRouteId !== null,
    // Check-ins and checkouts happen on the Visits screen; keep the stop states current.
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (["published", "in_progress"].includes(query.state.data?.route.status ?? "") ? 60_000 : false),
  });
  const replacementRoute = activeRouteId !== null && routesQuery.isSuccess
    && !(routesQuery.data ?? []).some((route) => route.id === activeRouteId)
    ? todayRoutes[0]
    : null;
  useEffect(() => {
    if (!replacementRoute) return;
    openRoute(replacementRoute.id);
  }, [replacementRoute?.id]);

  const createJob = useMutation({
    mutationFn: async () => {
      const searches = parsedSearches;
      if (!cities.length || !searches.length || parsedSectors.overflow > 0) throw new Error(t("errorTitle"));
      const response = await apiRequest("POST", "/api/xpot/prospecting/jobs", {
        location: cities[0],
        locations: cities,
        routeDate: today,
        searches,
        shiftDurationMinutes: shiftHours * 60,
        idempotencyKey: `today:${today}:session-${todayJobs.length + 1}:${shiftHours}h:${compactIdempotencyPart(cities.join("|"))}:${compactIdempotencyPart(searches.map((search) => search.niche).join("|"))}`,
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
      const candidateIds = selectableCandidateIds(detailsQuery.data.candidates);
      if (!candidateIds.length) throw new Error(t("routeSelectionRequired"));
      const response = await apiRequest("POST", "/api/xpot/prospecting/routes", {
        routeDate: today,
        plannedStartAt: new Date().toISOString(),
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

  const retryAutomaticRoute = useMutation({
    mutationFn: async (jobId: number) => (await apiRequest("POST", `/api/xpot/prospecting/jobs/${jobId}/route/retry`, {})).json() as Promise<ProspectingJobDetails>,
    onSuccess: async (data) => {
      queryClient.setQueryData(["/api/xpot/prospecting/jobs", data.job.id], data);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/jobs"] });
    },
    onError: (error: Error) => toast({ title: t("errorTitle"), description: error.message, variant: "destructive" }),
  });

  useEffect(() => {
    const currentDetails = detailsQuery.data;
    if (!currentDetails) return;
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

  const reorderRoute = useMutation({
    mutationFn: async ({ routeId, stopIds }: { routeId: number; stopIds: number[] }) => {
      const response = await apiRequest("PATCH", `/api/xpot/prospecting/routes/${routeId}/stops/order`, { stopIds });
      return response.json() as Promise<{ reordered: true }>;
    },
    onMutate: async ({ routeId, stopIds }) => {
      const queryKey = ["/api/xpot/prospecting/routes", routeId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<RouteDetails>(queryKey);
      if (previous) {
        const byId = new Map(previous.stops.map((stop) => [stop.id, stop]));
        queryClient.setQueryData<RouteDetails>(queryKey, {
          route: {
            ...previous.route,
            optimizationMeta: { ...previous.route.optimizationMeta, encodedPolyline: undefined },
          },
          stops: stopIds.map((id, index) => ({ ...byId.get(id)!, position: index + 1 })),
        });
      }
      return { previous, queryKey };
    },
    onSuccess: async (_data, { routeId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes", routeId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
      ]);
      toast({ title: t("routeReordered") });
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      toast({ title: t("reorderUnavailable"), description: error.message, variant: "destructive" });
    },
  });

  const removeStop = useMutation({
    mutationFn: async ({ routeId, stopId }: { routeId: number; stopId: number }) => {
      const response = await apiRequest("DELETE", `/api/xpot/prospecting/routes/${routeId}/stops/${stopId}`);
      return response.json() as Promise<{ removed: true }>;
    },
    onSuccess: async (_data, { routeId }) => {
      setStopPendingRemoval(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes", routeId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
      ]);
      toast({ title: t("stopRemoved") });
    },
    onError: (error: Error) => toast({ title: t("removeStopUnavailable"), description: error.message, variant: "destructive" }),
  });

  const ensureStopLead = useMutation({
    mutationFn: async ({ routeId, stopId, destination }: { routeId: number; stopId: number; destination: "plaque" | "company" }) => {
      const response = await apiRequest("POST", `/api/xpot/prospecting/routes/${routeId}/stops/${stopId}/prepare-demo`, {});
      return response.json() as Promise<{ leadId: number; name: string; placeId: string | null }>;
    },
    onSuccess: ({ leadId, name, placeId }, { routeId, destination }) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/prospecting/routes", routeId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] }),
      ]);
      if (destination === "plaque") {
        setSellTo({ leadId, name, placeId });
        navigate("/tags");
        return;
      }
      navigate(`/leads/${leadId}`);
    },
    onError: (error: Error, { destination }) => toast({ title: t(destination === "plaque" ? "demoUnavailable" : "companyPanelUnavailable"), description: error.message, variant: "destructive" }),
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
  const selectedStop = routeDetails?.stops.find((stop) => stop.id === selectedStopId) ?? null;
  const canReorderRoute = routeDetails ? ["draft", "published"].includes(routeDetails.route.status) : false;
  // One count of found places everywhere on the card: the ones the route can use.
  const eligibleCandidates = useMemo(() => eligibleOf(details?.candidates ?? []), [details?.candidates]);
  const canShowCandidates = details?.job.status === "completed";
  const fill = details ? routeFill(eligibleCandidates.length, details.job.targetStops) : "none";
  const jobFailed = details ? details.job.status === "failed" || hasFailedRuns || details.job.routePlanningStatus === "failed" : false;
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
    hasRoute: Boolean(generatedRoute),
    routePlanningStatus: details.job.routePlanningStatus,
    typicalRunMs: details.timing?.typicalRunMs,
    nowMs: serverNowMs(details.timing, detailsQuery.dataUpdatedAt, now),
  }) : null;
  const runTiming = details ? activeRunTiming(details.runs, details.timing?.typicalRunMs, serverNowMs(details.timing, detailsQuery.dataUpdatedAt, now)) : null;
  const runTimingLabel = !runTiming ? null
    : runTiming.typicalMs
      ? t("activityTiming", { elapsed: wholeMinutes(runTiming.elapsedMs), typical: wholeMinutes(runTiming.typicalMs) })
      : t("activityElapsed", { elapsed: wholeMinutes(runTiming.elapsedMs) });
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
  // The running search names its current step (open Maps, scroll, collect, read sites).
  const runActivity = (run: NonNullable<typeof activeRun>) => {
    const vars = {
      sector: run.niche.replaceAll("_", " "),
      location: details?.job.expansionState?.currentArea || run.location,
      found: runTiming?.found ?? 0,
      target: runTiming?.target ?? run.requestedMaxResults ?? 0,
    };
    if (!runTiming) return t("activitySearching", vars);
    return {
      opening: t("activityOpening", vars),
      scrolling: t("activityScrolling", vars),
      collecting: t("activityCollecting", vars),
      contacts: t("activityContacts", vars),
    }[searchPhase(runTiming)];
  };
  const currentActivity = !details || !progress ? null
    : activeRun ? `${runActivity(activeRun)}${runTimingLabel ? ` · ${runTimingLabel}` : ""}`
      : nextRun ? t("activityPreparing", {
        sector: nextRun.niche.replaceAll("_", " "),
        location: details.job.expansionState?.currentArea || nextRun.location,
      })
        : progress.stage === "filtering" ? t("activityFiltering", { eligible: details.summary.eligible })
          : progress.stage === "review" ? t("activityOptimizing", { count: details.summary.eligible })
            : progress.stage === "route" ? t("activityReady", { count: details.summary.eligible })
            : progress.stage === "failed" ? t("activityFailed")
              : t("activityQueued");

  const reasonLabel = (reason: string) => ({
    "route-ready coordinates": t("reasonCoordinates"),
    "phone available": t("reasonPhone"),
    "email available": t("reasonEmail"),
    "website available": t("reasonWebsite"),
    "rating 4.0+": t("reasonRating"),
    "established review volume": t("reasonReviews"),
  }[reason] ?? reason);
  // Google ratings and review counts in the app language ("4,5" / "1.234" in Portuguese).
  const ratingFormat = useMemo(() => new Intl.NumberFormat(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [t.locale]);
  const countFormat = useMemo(() => new Intl.NumberFormat(t.locale), [t.locale]);
  // Android and desktop navigate with Google Maps; an iPhone or iPad also gets Apple Maps.
  const appleDevice = useMemo(isAppleMobile, []);
  const routeStart = routeDetails ? { lat: routeDetails.route.startLat, lng: routeDetails.route.startLng } : null;
  const directionsUrl = routeDetails && routeStart ? googleRouteUrl(routeStart, routeDetails.stops) : null;
  const appleDirectionsUrl = appleDevice && routeDetails && routeStart ? appleRouteUrl(routeStart, routeDetails.stops) : null;
  // The route usually starts at stop 1; a start elsewhere and the rep's home (a
  // route set to end there) get their own markers.
  const routeLandmarks = useMemo<RouteLandmark[]>(() => {
    if (!routeDetails) return [];
    const { route, stops } = routeDetails;
    const points: RouteLandmark[] = [];
    const start = { lat: Number(route.startLat), lng: Number(route.startLng) };
    const first = stops[0] ? { lat: Number(stops[0].lat), lng: Number(stops[0].lng) } : null;
    if (Number.isFinite(start.lat) && Number.isFinite(start.lng) && (!first || !samePlace(start, first))) points.push({ kind: "start", ...start });
    if (route.optimizationMeta.returnHome && route.endLat && route.endLng) {
      const home = { lat: Number(route.endLat), lng: Number(route.endLng) };
      if (Number.isFinite(home.lat) && Number.isFinite(home.lng)) points.push({ kind: "home", ...home });
    }
    return points;
  }, [routeDetails]);
  const routeEndsHome = routeLandmarks.some((point) => point.kind === "home");
  // The legend lists only what this map shows.
  const legendItems = useMemo(() => {
    if (!routeDetails) return [];
    const stops = routeDetails.stops;
    const items: Array<{ key: string; tone: { background: string; border: string; text: string }; glyph?: string | null; label: string }> = [];
    if (currentStopId !== null) items.push({ key: "current", tone: STOP_MARKER_TONES.current, label: tu("legendCurrent") });
    if (nextStopId !== null) items.push({ key: "next", tone: STOP_MARKER_TONES.next, label: tu("legendNext") });
    if (stops.some((stop) => stop.id !== currentStopId && stop.id !== nextStopId && !["completed", "skipped"].includes(stop.status))) items.push({ key: "planned", tone: STOP_MARKER_TONES.planned, label: tu("legendPlanned") });
    if (stops.some((stop) => stop.status === "completed")) items.push({ key: "done", tone: STOP_MARKER_TONES.done, glyph: STOP_MARKER_TONES.done.glyph, label: tu("legendDone") });
    if (stops.some((stop) => stop.status === "skipped")) items.push({ key: "skipped", tone: STOP_MARKER_TONES.skipped, glyph: STOP_MARKER_TONES.skipped.glyph, label: tu("legendSkipped") });
    if (routeLandmarks.some((point) => point.kind === "start")) items.push({ key: "start", tone: MAP_POINT_TONES.start, glyph: "▸", label: tu("routeStart") });
    if (routeEndsHome) items.push({ key: "home", tone: MAP_POINT_TONES.home, glyph: "⌂", label: tu("home") });
    if (routeIsToday) items.push({ key: "you", tone: MAP_POINT_TONES.you, label: tu("legendYou") });
    return items;
  }, [routeDetails, currentStopId, nextStopId, routeLandmarks, routeEndsHome, routeIsToday, tu]);
  const mapStops = useMemo(() => routeDetails?.stops.map((stop) => {
    const tone = stopMarkerTone(stop, currentStopId, nextStopId);
    return {
      id: stop.id,
      lat: Number(stop.lat),
      lng: Number(stop.lng),
      label: stop.name,
      markerColor: tone.background,
      markerBorderColor: tone.border,
      markerTextColor: tone.text,
      markerText: tone.glyph ?? undefined,
    };
  }) ?? [], [routeDetails?.stops, currentStopId, nextStopId]);
  const openStopPreview = useCallback((stopId: number) => setSelectedStopId(stopId), []);
  const resetDragState = () => {
    setDraggedStopId(null);
    setDragOverStopId(null);
    setDragPlacement(null);
  };
  const saveStopOrder = (stopIds: number[]) => {
    if (!routeDetails || !canReorderRoute || reorderRoute.isPending) return;
    const currentOrder = routeDetails.stops.map((stop) => stop.id);
    if (stopIds.every((stopId, index) => stopId === currentOrder[index])) {
      resetDragState();
      return;
    }
    reorderRoute.mutate({ routeId: routeDetails.route.id, stopIds });
    resetDragState();
  };
  const dropStopAt = (targetStopId: number, sourceStopId = draggedStopId, placement: "before" | "after" = dragPlacement ?? "before") => {
    if (!routeDetails || sourceStopId === null || sourceStopId === targetStopId || !canReorderRoute || reorderRoute.isPending) {
      resetDragState();
      return;
    }
    const stopIds = reorderIdsAroundTarget(
      routeDetails.stops.map((stop) => stop.id),
      sourceStopId,
      targetStopId,
      placement,
    );
    saveStopOrder(stopIds);
  };
  const moveStopByOffset = (stopId: number, offset: -1 | 1) => {
    if (!routeDetails || !canReorderRoute || reorderRoute.isPending) return;
    const stopIds = moveIdByOffset(routeDetails.stops.map((stop) => stop.id), stopId, offset);
    saveStopOrder(stopIds);
  };
  const openPlaqueSetup = (stop: RouteStop) => {
    if (stop.leadId) {
      setSellTo({ leadId: stop.leadId, name: stop.name, placeId: stop.googlePlaceId });
      navigate("/tags");
      return;
    }
    if (routeDetails) ensureStopLead.mutate({ routeId: routeDetails.route.id, stopId: stop.id, destination: "plaque" });
  };
  const openCompanyPanel = (stop: RouteStop) => {
    if (stop.leadId) {
      navigate(`/leads/${stop.leadId}`);
      return;
    }
    if (routeDetails) ensureStopLead.mutate({ routeId: routeDetails.route.id, stopId: stop.id, destination: "company" });
  };
  const planningTitles = [t("cityStepTitle"), t("sectorsStepTitle"), t("durationStepTitle"), t("reviewStepTitle")];
  const planningBodies = [t("cityStepBody"), t("sectorsStepBody"), t("durationStepBody", { time: dayEndLabel }), t("reviewStepBody")];
  const canAdvancePlanning = planningStep === 0
    ? cities.length > 0
    : planningStep === 1
      ? (parsedSearches.length > 0 || sectorDraft.trim().length > 0) && parsedSectors.overflow === 0
      : shiftFitsToday;
  const loadingExistingPlan = jobsQuery.isLoading
    || routesQuery.isLoading
    || (activeJobId !== null && detailsQuery.isLoading)
    || (activeRouteId !== null && routeQuery.isLoading);
  // Routes are built for the current day only (Google API cost), so the page
  // offers today's route and lists the past ones instead of a calendar.
  const routeHistory = useMemo(
    () => (routesQuery.data ?? []).filter((route) => route.id !== activeTodayRoute?.id),
    [routesQuery.data, activeTodayRoute?.id],
  );
  const routeSummaryLine = (route: ProspectingRoute) => tu("routeLine", {
    status: routeStatusLabel(route.status, t, route.routeDate < today),
    duration: formatDuration(route.totalDurationSeconds),
    distance: formatDistance(route.totalDistanceMeters, t.locale),
  });
  const openTodayAction = () => {
    if (activeTodayRoute) openRoute(activeTodayRoute.id);
    else if (pendingTodayJob) openJob(pendingTodayJob.id);
    else setBuilderOpen(true);
  };

  const submitPlanningStep = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAdvancePlanning) return;
    // A typed but not yet added sector counts, so the in-field button never drops it.
    if (planningStep === 1 && sectorDraft.trim()) addSector(sectorDraft, false);
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

  const addSector = (value = sectorDraft, refocus = true) => {
    if (!value.trim() || parsedSearches.length >= MAX_PROSPECTING_SECTORS) return;
    const next = parseSectorSearches([sectors, value].filter(Boolean).join(", ")).searches;
    setSectors(next.map((search) => search.query).join(", "));
    setSectorDraft("");
    setSectorSuggestionsOpen(false);
    if (refocus) window.requestAnimationFrame(() => sectorInputRef.current?.focus());
  };

  // On phones the keyboard covers the dialog footer, so the text steps also
  // carry their Continue button inside the field, right next to what is typed.
  // mousedown is cancelled so the input keeps focus: a blur would close the
  // keyboard, shift the layout and make the tap miss.
  const inFieldContinue = canAdvancePlanning ? (
    <Button
      type="submit"
      variant="brand"
      onMouseDown={(event) => event.preventDefault()}
      className="absolute right-2 top-1/2 min-h-10 -translate-y-1/2 gap-1 pl-3.5 pr-2.5 font-bold"
    >
      {t("continue")}<ChevronRight />
    </Button>
  ) : null;

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
            <Button type="button" variant="brand" onClick={openTodayAction} disabled={!activeTodayRoute && !pendingTodayJob && dailyRouteLimitReached} className="min-h-[92px] w-full justify-start gap-4 whitespace-normal rounded-[22px] p-4 text-left [&_svg]:size-6 lg:min-h-20 lg:px-6">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                {pendingTodayJob && !activeTodayRoute ? <Loader2 className="h-6 w-6" /> : activeTodayRoute ? <MapIcon /> : <RouteIcon />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold tracking-tight">{activeTodayRoute
                  ? t("viewRoute")
                  : pendingTodayJob
                    ? t("todayRoutePreparing")
                    : todayRoutes.some((route) => route.status === "completed") ? t("openAnotherRoute") : t("openBuilder")}</span>
                <span className="mt-1 block text-sm leading-5 text-white/75">{activeTodayRoute
                  ? routeSummaryLine(activeTodayRoute)
                  : pendingTodayJob
                    ? t("todayRoutePreparingHint")
                    : dailyRouteLimitReached
                      ? t("dailyRouteLimit", { count: MAX_DAILY_PROSPECTING_SESSIONS })
                      : t("todayOnlyHint")}</span>
              </span>
              <ChevronRight className="shrink-0 text-white/90" />
            </Button>
          </section>

          <section className="border-t border-white/[0.08] pt-6">
            <div className="flex min-h-9 items-center gap-2 text-white/85">
              <RouteIcon className="h-4 w-4 text-blue-300" />
              <h2 className="text-sm font-bold">{t("routeHistory")}</h2>
            </div>
            {routeHistory.length ? (
              <div className="mt-3 divide-y divide-white/[0.08] border-y border-white/[0.08]">
                {routeHistory.map((route) => {
                  const StatusIcon = routeStatusIcon(route.status);
                  return (
                    <button key={route.id} type="button" onClick={() => openRoute(route.id)} className="flex min-h-[76px] w-full items-center gap-3 py-3 text-left transition hover:bg-white/[0.025]">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/55"><StatusIcon className="h-5 w-5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <strong className="truncate text-sm text-white/90 first-letter:uppercase">{routeDisplayName(route, t.locale)}</strong>
                          <Pill tone={routeStatusTone(route.status)} dot className="shrink-0">{routeStatusLabel(route.status, t, route.routeDate < today)}</Pill>
                        </span>
                        <span className="mt-1 block truncate text-xs text-white/45">{tu("routePlanLine", {
                          duration: formatDuration(route.totalDurationSeconds),
                          distance: formatDistance(route.totalDistanceMeters, t.locale),
                        })}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                    </button>
                  );
                })}
              </div>
            ) : <div className="mt-3"><EmptyState compact dense icon={RouteIcon} title={t("noRouteHistory")} /></div>}
          </section>

          <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
            <DialogContent
              onInteractOutside={(event) => {
                if ((event.target as HTMLElement | null)?.closest?.(`[${SUGGESTIONS_ATTRIBUTE}]`)) event.preventDefault();
              }}
              className="max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-2xl gap-0 p-0 sm:rounded-[28px]"
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
                      className={`h-14 w-full rounded-2xl border border-white/15 bg-black/20 pl-12 text-base text-white outline-none transition placeholder:text-white/30 focus:border-indigo-300/70 focus:bg-black/30 disabled:cursor-not-allowed ${inFieldContinue ? "pr-36" : "pr-4"}`}
                    />
                    {inFieldContinue}
                    <FloatingSuggestions
                      anchorRef={cityInputRef}
                      id="prospecting-city-suggestions"
                      open={citySuggestionsOpen && cities.length < MAX_PROSPECTING_CITIES && deferredCity.length >= 2}
                    >
                        <SuggestionStatus loading={citySuggestionsQuery.isFetching} error={citySuggestionsQuery.isError} loadingLabel={t("googleSuggestions")} errorLabel={t("googleUnavailable")} />
                        {citySuggestionsQuery.data?.suggestions.map((suggestion) => (
                          <SuggestionOption key={suggestion.placeId} icon={MapPin} title={suggestion.mainText} subtitle={suggestion.secondaryText} onPick={() => addCity(suggestion)} />
                        ))}
                    </FloatingSuggestions>
                  </div>
                  {cities.length ? (
                    <div className="mt-3 flex flex-wrap gap-2" role="list" aria-label={t("areaSummary")}>
                      {cities.map((selectedCity) => (
                        <span key={selectedCity} role="listitem" className={TAG_CHIP}>
                          <span className="truncate">{selectedCity}</span>
                          <button
                            type="button"
                            onClick={() => removeCity(selectedCity)}
                            aria-label={t("removeCity", { city: selectedCity })}
                            title={t("removeCity", { city: selectedCity })}
                            className={TAG_CHIP_REMOVE}
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
                      className={`h-14 min-w-0 flex-1 bg-transparent pl-12 text-base text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed ${inFieldContinue ? "pr-36" : "pr-4"}`}
                    />
                    {inFieldContinue}
                    <FloatingSuggestions
                      anchorRef={sectorAnchorRef}
                      id="prospecting-sector-suggestions"
                      open={sectorSuggestionsOpen && sectorFragment.length >= 2 && (sectorPlacesQuery.isFetching || sectorPlacesQuery.isError || googleSectorSuggestions.length > 0)}
                    >
                        <SuggestionStatus loading={sectorPlacesQuery.isFetching} error={sectorPlacesQuery.isError} loadingLabel={t("googleSuggestions")} errorLabel={t("googleUnavailable")} />
                        {googleSectorSuggestions.map((suggestion) => (
                          <SuggestionOption key={suggestion} icon={Search} title={suggestion} onPick={() => pickSectorSuggestion(suggestion)} />
                        ))}
                    </FloatingSuggestions>
                  </div>
                  {parsedSearches.length ? (
                    <div className="mt-3 flex flex-wrap gap-2" role="list" aria-label={t("sectorsSummary")}>
                      {parsedSearches.map((sector) => (
                        <span key={sector.niche} role="listitem" className={TAG_CHIP}>
                          <span className="truncate">{sector.query}</span>
                          <button
                            type="button"
                            onClick={() => removeSector(sector.niche)}
                            aria-label={t("removeSector", { sector: sector.query })}
                            title={t("removeSector", { sector: sector.query })}
                            className={TAG_CHIP_REMOVE}
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
                    {SHIFT_HOUR_OPTIONS.map((hours) => (
                      <button key={hours} type="button" aria-pressed={shiftHours === hours} disabled={!availableShiftHours.includes(hours)} onClick={() => setShiftHours(hours)} className={`min-h-16 touch-manipulation rounded-2xl border px-3 py-3 text-base font-bold transition disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-transparent disabled:text-white/20 disabled:line-through ${shiftHours === hours ? `border-blue-300/50 ${ACCENT_SELECTED.visits.fill}` : "border-white/12 bg-black/10 text-white/55 enabled:hover:bg-white/[0.06] enabled:hover:text-white/80"}`}>
                        {t("shiftHours", { hours })}
                      </button>
                    ))}
                  </div>
                  {availableShiftHours.length ? null : (
                    <InlineAlert tone="warning" className="mt-4">{t("dayOverHint", { time: dayEndLabel })}</InlineAlert>
                  )}
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
                <Button type="button" variant="ghost" size="lg" onClick={() => setPlanningStep((planningStep - 1) as PlanningStep)} className="px-3 text-sm"><ChevronLeft />{t("back")}</Button>
              ) : <span />}
              <Button type="submit" variant="brand" size="lg" disabled={!canAdvancePlanning} loading={createJob.isPending} aria-label={createJob.isPending ? t("creating") : undefined} className="ml-auto min-w-36 px-5 text-sm font-bold">
                {planningStep === 3 ? <><RouteIcon />{t("buildToday")}</> : <>{t("continue")}<ChevronRight /></>}
              </Button>
            </div>
          </form>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      {loadingExistingPlan && !details && !routeDetails ? (
        <section className="space-y-4 rounded-[20px] p-4 sm:p-6" style={GLASS} aria-busy="true">
          <ListSkeleton rows={1} rowClassName="h-[92px] rounded-[22px]" className="" />
          <ListSkeleton rows={4} rowClassName="h-[76px] rounded-2xl" />
        </section>
      ) : null}

      {!routeDetails && details ? (
        <section className="mx-auto min-w-0 max-w-3xl rounded-[20px] p-3 sm:rounded-[22px] sm:p-6" style={GLASS}>
          {detailsQuery.isLoading ? <ListSkeleton rows={3} /> : details ? (
            <div className="space-y-4 sm:space-y-5">
              <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
                <div className="min-w-0"><div className={`text-[11px] font-bold uppercase tracking-[0.14em] ${jobFailed ? "text-red-300" : "text-indigo-300"}`}>{details.job.status === "completed" && ["pending", "building"].includes(details.job.routePlanningStatus) ? t("preparingRoute") : statusLabel(details.job.status, t)}</div><h2 className="mt-1 truncate text-xl font-bold text-white [text-wrap:balance]">{details.job.location}</h2></div>
                <div className="flex flex-wrap gap-2">
                  <Pill tone="slate" className="tabular-nums">{t("found", { count: eligibleCandidates.length })}</Pill>
                  <Pill tone="muted" className="tabular-nums">{t("excluded", { count: details.summary.excluded })}</Pill>
                </div>
              </div>

              {progress && progressCopy ? (
                <div className="rounded-2xl bg-indigo-400/[0.07] p-3 shadow-[inset_0_0_0_1px_rgba(165,180,252,0.18)] sm:p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-400/15 text-indigo-200"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
                      <p className="text-sm font-bold text-white [text-wrap:pretty]">{progressCopy[0]}</p>
                      <p className="mt-0.5 text-xs leading-5 text-white/60">{progressCopy[1]}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-indigo-100">{progress.percent}%</span>
                  </div>
                  <div className="relative mt-4">
                    <div className="absolute inset-x-0 top-3.5 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={progressCopy[0]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                      <div className={`relative h-full overflow-hidden rounded-full transition-[width] duration-300 ${progress.stage === "failed" ? "bg-red-400" : "bg-gradient-to-r from-sky-400 to-indigo-400"}`} style={{ width: `${progress.percent}%` }}>
                        {["queued", "running"].includes(details.job.status) || progress.stage === "review" ? <span className="xpot-progress-shimmer absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-white/75 to-transparent" aria-hidden="true" /> : null}
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
                      <span className={`h-2 w-2 shrink-0 rounded-full ${["queued", "running"].includes(details.job.status) || progress.stage === "review" ? "animate-pulse bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.7)]" : progress.stage === "failed" ? PILL_DOTS.red : PILL_DOTS.green}`} aria-hidden="true" />
                      <span className="shrink-0 font-bold uppercase tracking-[0.12em] text-indigo-200">{t("activityLabel")}</span>
                      <span className="min-w-0 break-words leading-5 text-pretty text-white/65">{currentActivity}</span>
                    </div>
                    {["queued", "running"].includes(details.job.status) ? (
                      <div className="flex justify-end">
                        <Button type="button" variant="outline" disabled={notificationsEnabled} onClick={() => void enableReadyNotification()} className="w-full text-xs sm:w-auto">
                          <BellRing />{notificationsEnabled ? t("notificationsEnabled") : t("notifyWhenReady")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!details.engine.configured ? <InlineAlert tone="warning">{t("engineUnavailable")}</InlineAlert> : null}
              {details.job.errorMessage ? <InlineAlert tone="error">{details.job.errorMessage}</InlineAlert> : null}
              {details.job.expansionState?.currentArea ? <InlineAlert tone="info" title={t("currentArea", { area: details.job.expansionState.currentArea })}>{t("expanding")}</InlineAlert> : null}

              {details.runs.length > 1 && ["queued", "running"].includes(details.job.status) ? (
                <details className={`group rounded-xl ${GLASS_SUBTLE_CLASS}`}>
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-white/70">
                    <span>{t("searchDetails", { completed: details.runs.filter((run) => run.status === "completed").length, total: details.runs.length })}</span>
                    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="grid gap-2 border-t border-white/[0.06] p-2 sm:grid-cols-2">
                    {details.runs.slice(0, 6).map((run) => (
                      <div key={run.id} className="flex min-h-10 items-center gap-3 rounded-lg bg-white/[0.035] px-3 py-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PILL_DOTS[toneOf(RUN_STATUS_TONE, run.status)]}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/70">{t("runProgress", { sector: run.niche.replaceAll("_", " "), status: runStatusLabel(run.status, t) })}</span>
                        <span className="text-xs tabular-nums text-white/55">{Math.max(0, Math.min(100, run.progress))}%</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {details.summary.excluded > 0 ? (
                <details className={`group rounded-xl p-3 ${GLASS_SUBTLE_CLASS}`}>
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

              {canShowCandidates && eligibleCandidates.length > 0 ? (
                <div className="border-t border-white/[0.07] pt-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white [text-wrap:balance]">{t("candidateReview")}</h3>
                    {/* Xpot picks the stops itself; the rep can still remove or reorder them on the route. */}
                    <p className="mt-1 max-w-xl text-xs leading-5 text-white/60">{t("candidateReviewBody")}</p>
                    <p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-white/75">{fill === "short" ? tu("shortRoute") : tu("fullRoute")}</p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {visibleCandidates.map((candidate) => {
                      return (
                        <div key={candidate.id} className={`flex min-h-20 items-start gap-3 rounded-2xl p-3 ${GLASS_SUBTLE_CLASS}`}>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="line-clamp-2 text-sm font-semibold text-white/90 [text-wrap:pretty]">{candidate.name}</span>
                              <span className="shrink-0 rounded-lg bg-white/[0.08] px-2 py-1 text-xs font-bold tabular-nums text-white/75">{t("scoreLabel", { score: candidate.score })}</span>
                            </span>
                            <span className="mt-1 block truncate text-xs leading-5 text-white/55">{candidate.address || t("noAddress")}</span>
                            {candidate.scoreReasons.length ? (
                              <span className="mt-2 flex flex-wrap gap-1.5" aria-label={tu("reasonsLabel")}>
                                {candidate.scoreReasons.slice(0, 2).map((reason) => <Pill key={reason} tone="slate">{reasonLabel(reason)}</Pill>)}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {eligibleCandidates.length > 6 ? (
                    <Button type="button" variant="ghost" onClick={() => setShowAllCandidates((value) => !value)} className="mt-3 w-full">
                      {showAllCandidates ? <ChevronUp /> : <ChevronDown />}{showAllCandidates ? t("showFewerCandidates") : t("showAllCandidates")}
                    </Button>
                  ) : null}
                </div>
              ) : canShowCandidates ? (
                <EmptyState icon={SearchX} title={tu("noEligibleTitle")} hint={tu("noEligibleHint")} />
              ) : null}

              {hasFailedRuns ? (
                <Button variant="brand" onClick={() => retryJob.mutate(details.job.id)} disabled={!details.engine.configured} loading={retryJob.isPending} className="w-full">
                  <RotateCw />{t("tryAgain")}
                </Button>
              ) : !canShowCandidates ? null : generatedRoute ? (
                <Button asChild variant="brand" className="w-full">
                  <a href="#today-route"><MapIcon />{t("viewRoute")}</a>
                </Button>
              ) : details.job.routePlanningStatus === "failed" ? (
                <div className="space-y-2">
                  {details.job.routeErrorMessage ? <InlineAlert tone="error">{details.job.routeErrorMessage}</InlineAlert> : null}
                  <Button variant="brand" onClick={() => retryAutomaticRoute.mutate(details.job.id)} loading={retryAutomaticRoute.isPending} className="w-full">
                    <RotateCw />{t("retryRoute")}
                  </Button>
                </div>
              ) : fill === "none" ? null : (
                <div className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white/75 ${GLASS_SUBTLE_CLASS}`} role="status">
                  <Loader2 className="h-4 w-4" />{t("automaticRouteHint")}
                </div>
              )}
            </div>
          ) : <EmptyState compact icon={RouteIcon} title={t("noPlans")} />}
        </section>
      ) : null}

      {routeDetails ? (
        <section id="today-route" className="scroll-mt-4 overflow-hidden rounded-[20px] sm:rounded-[24px]" style={GLASS}>
          <div className="border-b border-white/[0.08] px-4 py-2 sm:px-5">
            <BackLink onBack={closeRoute}>{t("backToRoutes")}</BackLink>
          </div>
          <div className="grid lg:h-[calc(100vh-11rem)] lg:min-h-[620px] lg:max-h-[820px] lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
            <div className="flex min-w-0 flex-col overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r">
              <RoutePreviewMap
                start={{ lat: Number(routeDetails.route.startLat), lng: Number(routeDetails.route.startLng) }}
                stops={mapStops}
                landmarks={routeLandmarks}
                encodedPolyline={routeDetails.route.optimizationMeta.encodedPolyline}
                alt={routeContextLabel}
                showCurrentLocation={routeIsToday}
                locateLabel={t("showMyLocation")}
                onStopClick={openStopPreview}
                className="lg:h-auto lg:flex-1"
              />
              {legendItems.length ? (
                <ul aria-label={tu("legendLabel")} className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-white/[0.08] px-4 py-2.5 text-[11px] font-medium text-white/55">
                  {legendItems.map((item) => <LegendItem key={item.key} tone={item.tone} glyph={item.glyph} label={item.label} />)}
                </ul>
              ) : null}
            </div>
            <div className="min-w-0 space-y-6 p-4 sm:p-5 lg:overflow-y-auto lg:p-6">
            <div>
              <div className="flex items-center gap-2 text-indigo-300"><RouteIcon className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wider">{routeContextLabel}</span></div>
              <h2 className="mt-2 text-xl font-bold text-white first-letter:uppercase">{selectedRouteName}</h2>
              <p className="mt-1 text-sm text-white/65">{tu("routeDetailLine", {
                count: routeDetails.stops.length,
                duration: formatDuration(routeDetails.route.totalDurationSeconds),
                distance: formatDistance(routeDetails.route.totalDistanceMeters, t.locale),
              })}</p>
              <div className="mt-3">
                {(() => {
                  const StatusIcon = routeStatusIcon(routeDetails.route.status);
                  return (
                    <Pill tone={routeStatusTone(routeDetails.route.status)} bordered className="gap-1.5">
                      <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {routeStatusLabel(routeDetails.route.status, t, routeDetails.route.routeDate < today)}
                    </Pill>
                  );
                })()}
              </div>
              <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                {routeDetails.route.status === "draft" && routeIsToday ? (
                  <Button variant="brand" onClick={() => publishRoute.mutate(routeDetails.route.id)} loading={publishRoute.isPending} aria-label={publishRoute.isPending ? t("publishing") : undefined} className="w-full sm:w-auto">
                    <ShieldCheck />{t("publishRoute")}
                  </Button>
                ) : routeIsToday && !["cancelled", "draft"].includes(routeDetails.route.status) ? (
                  <Button asChild variant="brand" className="w-full sm:w-auto"><Link href="/dashboard/history?view=day">{t("openVisits")}</Link></Button>
                ) : null}
                {directionsUrl ? <Button asChild variant="secondary" className="w-full sm:w-auto"><a href={directionsUrl} target="_blank" rel="noreferrer"><Navigation />{t("openMaps")}</a></Button> : null}
                {appleDirectionsUrl ? <Button asChild variant="secondary" className="w-full sm:w-auto"><a href={appleDirectionsUrl} target="_blank" rel="noreferrer"><Navigation />{t("openAppleMaps")}</a></Button> : null}
                {isSuperAdmin && details ? (
                  <Button
                    variant="outline"
                    onClick={() => createRoute.mutate({ rebuild: true })}
                    disabled={["queued", "running"].includes(details.job.status)}
                    loading={createRoute.isPending}
                    className="w-full sm:w-auto"
                  >
                    <RefreshCw />{t("rebuildRoute")}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="border-t border-white/[0.08] pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">{t("visitOrder")}</h3>
                  {canReorderRoute ? <p className="mt-1 text-xs text-white/45">{t("reorderHint")}</p> : null}
                </div>
                <span className="text-xs text-white/60">{reorderRoute.isPending ? t("savingOrder") : t("stopCount", { count: routeDetails.stops.length })}</span>
              </div>
              <ol className="space-y-2">
                {routeDetails.stops.map((stop) => {
                  const stopUrl = stopNavigationUrl(stop, appleDevice);
                  const stopTone = stopMarkerTone(stop, currentStopId, nextStopId);
                  const numberRailClass = stop.status === "completed"
                    ? "border-white/[0.06] bg-white/[0.02] text-emerald-300/80"
                    : stop.status === "skipped"
                      ? "border-white/[0.06] bg-white/[0.02] text-white/35"
                      : stop.id === currentStopId
                        ? "border-blue-300/45 bg-blue-500 text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.12)]"
                        : stop.id === nextStopId
                          ? "border-blue-300/30 bg-blue-400/[0.1] text-blue-100/85 shadow-[inset_-1px_0_0_rgba(147,197,253,0.12)]"
                          : "border-white/10 bg-white/[0.035] text-white/45";
                  const checkingInHere = prepareCheckIn.isPending && prepareCheckIn.variables?.stopId === stop.id;
                  const canRemoveThisStop = routeDetails.stops.length > 1
                    && ["draft", "published", "in_progress"].includes(routeDetails.route.status)
                    && ["planned", "en_route"].includes(stop.status);
                  return (
                    <li
                      key={stop.id}
                      onDragOver={(event) => {
                        if (!canReorderRoute) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverStopId(stop.id);
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setDragPlacement(event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const placement = event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before";
                        const transferredStopId = Number(event.dataTransfer.getData("text/plain"));
                        dropStopAt(stop.id, Number.isSafeInteger(transferredStopId) ? transferredStopId : draggedStopId, placement);
                      }}
                      onClick={() => openStopPreview(stop.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openStopPreview(stop.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      data-route-stop-id={stop.id}
                      aria-label={t("openCompanyPreview", { name: stop.name })}
                      className={`group relative grid min-h-[84px] cursor-pointer grid-cols-[3.5rem_minmax(0,1fr)] items-stretch overflow-hidden rounded-xl border bg-black/10 transition-[border-color,background-color,box-shadow,opacity,transform] hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] [contain-intrinsic-size:84px] [content-visibility:auto] ${dragOverStopId === stop.id && draggedStopId !== stop.id ? "border-indigo-300/70 ring-2 ring-indigo-400/20" : "border-white/10"} ${draggedStopId === stop.id ? "scale-[0.995] opacity-45" : "opacity-100"} ${dragOverStopId === stop.id && draggedStopId !== stop.id && dragPlacement === "before" ? "before:absolute before:inset-x-2 before:top-0 before:z-30 before:h-0.5 before:rounded-full before:bg-indigo-300 before:shadow-[0_0_12px_rgba(165,180,252,0.9)]" : ""} ${dragOverStopId === stop.id && draggedStopId !== stop.id && dragPlacement === "after" ? "after:absolute after:inset-x-2 after:bottom-0 after:z-30 after:h-0.5 after:rounded-full after:bg-indigo-300 after:shadow-[0_0_12px_rgba(165,180,252,0.9)]" : ""}`}
                    >
                      <span className={`row-span-2 flex w-14 shrink-0 items-center justify-center self-stretch border-r px-2 text-sm font-bold tabular-nums transition-colors sm:row-span-1 ${numberRailClass}`}>{stopTone.glyph ?? stop.position}</span>
                      {canReorderRoute ? (
                        <button
                          type="button"
                          draggable={!reorderRoute.isPending}
                          aria-label={t("dragStop", { name: stop.name })}
                          title={t("dragStop", { name: stop.name })}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                            event.preventDefault();
                            event.stopPropagation();
                            moveStopByOffset(stop.id, event.key === "ArrowUp" ? -1 : 1);
                          }}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            setDraggedStopId(stop.id);
                            setDragOverStopId(stop.id);
                            setDragPlacement(null);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", String(stop.id));
                          }}
                          onDragEnd={resetDragState}
                          onPointerDown={(event) => {
                            if (event.pointerType === "mouse") return;
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setDraggedStopId(stop.id);
                            setDragOverStopId(stop.id);
                            setDragPlacement(null);
                          }}
                          onPointerMove={(event) => {
                            if (event.pointerType === "mouse" || draggedStopId !== stop.id) return;
                            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-route-stop-id]");
                            const targetId = Number(target?.dataset.routeStopId);
                            if (!Number.isSafeInteger(targetId) || !target) return;
                            const bounds = target.getBoundingClientRect();
                            setDragOverStopId(targetId);
                            setDragPlacement(event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before");
                          }}
                          onPointerUp={(event) => {
                            if (event.pointerType === "mouse") return;
                            event.stopPropagation();
                            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-route-stop-id]");
                            const targetId = Number(target?.dataset.routeStopId);
                            if (Number.isSafeInteger(targetId) && target) {
                              const bounds = target.getBoundingClientRect();
                              dropStopAt(targetId, stop.id, event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before");
                            } else {
                              resetDragState();
                            }
                          }}
                          onPointerCancel={resetDragState}
                          className="absolute right-2 top-2 z-20 flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg border border-white/[0.08] bg-[#0d1322]/90 text-white/40 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur transition hover:border-indigo-300/30 hover:bg-indigo-400/15 hover:text-indigo-100 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {reorderRoute.isPending ? <Loader2 className="h-4 w-4" aria-hidden="true" /> : <GripVertical className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      ) : null}
                      <div className="min-w-0 px-4 py-3 pr-12">
                        <div className="line-clamp-2 text-sm font-semibold text-white/90">{stop.name}</div>
                        <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-white/60">{stop.address || t("noAddress")}</div>
                        {typeof stop.rating === "number" ? (
                          <div className="mt-1 flex items-center gap-1 text-xs text-amber-300">
                            <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                            <span className="font-semibold tabular-nums">{ratingFormat.format(stop.rating)}</span>
                            {typeof stop.reviewCount === "number" ? <span className="text-white/45">({countFormat.format(stop.reviewCount)})</span> : null}
                          </div>
                        ) : null}
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-white/65">
                          <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{stop.position === 1 && stop.travelDurationSeconds === 0
                            ? t("routeStartsHere")
                            : t("driveMinutes", { minutes: driveMinutes(stop.travelDurationSeconds) })}</span>
                          {stop.estimatedArrivalAt ? <><span aria-hidden="true">·</span><span>{t("arrivalAt", { time: formatTime(stop.estimatedArrivalAt, t.locale) })}</span></> : null}
                        </div>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Pill tone={stopStatusTone(stop.status)} dot>{t(stopStatusLabelKey(stop.status))}</Pill>
                          {stop.origin === "ad_hoc" ? <Pill tone="slate" bordered>{t("stopExtra")}</Pill> : null}
                        </span>
                      </div>
                      <div className="col-start-2 flex self-end justify-end gap-2 px-3 pb-3 sm:col-start-3 sm:row-start-1 sm:shrink-0 sm:self-end sm:pb-3 sm:pl-0 sm:pr-3 sm:pt-12">
                        {isStopOpen(stop.status) ? (
                          <Button
                            type="button"
                            variant="brand"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              prepareCheckIn.mutate({ routeId: routeDetails.route.id, stopId: stop.id });
                            }}
                            loading={checkingInHere}
                            aria-label={t("checkIn")}
                            title={t("checkIn")}
                            className="[&_svg]:size-5"
                          >
                            <MapPinCheck strokeWidth={2} />
                          </Button>
                        ) : null}
                        <Button
                          asChild
                          variant="secondary"
                          size="icon"
                          className="[&_svg]:size-5"
                        >
                          <a
                            href={stopUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={appleDevice ? t("navigateWithApple", { name: stop.name }) : t("navigateTo", { name: stop.name })}
                            title={appleDevice ? t("navigateWithApple", { name: stop.name }) : t("navigateTo", { name: stop.name })}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Navigation strokeWidth={2} aria-hidden="true" />
                          </a>
                        </Button>
                        {canRemoveThisStop ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              setStopPendingRemoval(stop);
                            }}
                            aria-label={t("removeStop", { name: stop.name })}
                            title={t("removeStop", { name: stop.name })}
                            className="text-red-200/80 hover:text-red-100 [&_svg]:size-5"
                          >
                            <Trash2 strokeWidth={2} aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {routeEndsHome && routeDetails.route.plannedEndAt ? (
                <div className={`mt-2 flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm text-white/70 ${GLASS_SUBTLE_CLASS}`}>
                  <Home className="h-4 w-4 shrink-0 text-white/45" aria-hidden="true" />
                  <span>{tu("backHomeAt", { time: formatTime(routeDetails.route.plannedEndAt, t.locale) })}</span>
                </div>
              ) : null}
            </div>
          </div>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={stopPendingRemoval !== null}
        onOpenChange={(open) => { if (!open) setStopPendingRemoval(null); }}
        tone="danger"
        title={t("removeStopTitle")}
        description={stopPendingRemoval ? t("removeStopDescription", { name: stopPendingRemoval.name }) : ""}
        confirmLabel={<><Trash2 className="h-4 w-4" />{t("confirmRemoveStop")}</>}
        cancelLabel={t("keepStop")}
        pending={removeStop.isPending}
        confirmDisabled={!stopPendingRemoval || !routeDetails}
        onConfirm={() => {
          if (stopPendingRemoval && routeDetails) removeStop.mutate({ routeId: routeDetails.route.id, stopId: stopPendingRemoval.id });
        }}
      />

      <Dialog open={selectedStop !== null} onOpenChange={(open) => { if (!open) setSelectedStopId(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 p-0 sm:max-w-lg">
          {selectedStop && routeDetails ? (() => {
            const tone = stopMarkerTone(selectedStop, currentStopId, nextStopId);
            const checkingInHere = prepareCheckIn.isPending && prepareCheckIn.variables?.stopId === selectedStop.id;
            const pendingDestination = ensureStopLead.isPending ? ensureStopLead.variables?.destination : null;
            return (
            <>
              <div className="relative overflow-hidden border-b border-white/[0.08] px-5 pb-5 pt-6 sm:px-6">
                <div className="relative flex items-start gap-4 pr-8">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold shadow-lg"
                    style={{ background: tone.background, borderColor: tone.border, color: tone.text }}
                  >
                    {tone.glyph ?? selectedStop.position}
                  </span>
                  <div className="min-w-0">
                    <DialogTitle className="text-xl font-bold leading-tight text-white">{selectedStop.name}</DialogTitle>
                    <DialogDescription className="mt-1.5 text-sm leading-5 text-white/55">{selectedStop.address || t("noAddress")}</DialogDescription>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Pill tone={stopStatusTone(selectedStop.status)} dot>{t(stopStatusLabelKey(selectedStop.status))}</Pill>
                      {selectedStop.origin === "ad_hoc" ? <Pill tone="slate" bordered>{t("stopExtra")}</Pill> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-5 px-5 py-5 sm:px-6">
                <div className={`rounded-2xl p-4 ${GLASS_CLASS}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <GoogleLogo className="h-5 w-5" />
                    {typeof selectedStop.rating === "number" ? (
                      <>
                        <span className="text-lg font-bold tabular-nums text-white">{ratingFormat.format(selectedStop.rating)}</span>
                        <span className="flex items-center gap-0.5" aria-label={t("googleRating", { rating: ratingFormat.format(selectedStop.rating) })}>
                          {Array.from({ length: 5 }, (_, index) => (
                            <Star key={index} className={`h-4 w-4 ${selectedStop.rating! >= index + 0.5 ? "fill-amber-400 text-amber-400" : "fill-white/10 text-white/20"}`} aria-hidden="true" />
                          ))}
                        </span>
                        <span className="text-sm text-white/50">{typeof selectedStop.reviewCount === "number" ? t("googleReviews", { count: countFormat.format(selectedStop.reviewCount) }) : t("googleBusiness")}</span>
                      </>
                    ) : <span className="text-sm text-white/50">{t("noGoogleRating")}</span>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedStop.phone ? (
                      <Button asChild variant="secondary" size="sm">
                        <a href={`tel:${selectedStop.phone}`}><Phone />{selectedStop.phone}</a>
                      </Button>
                    ) : null}
                    {selectedStop.website ? (
                      <Button asChild variant="secondary" size="sm">
                        <a href={/^https?:\/\//i.test(selectedStop.website) ? selectedStop.website : `https://${selectedStop.website}`} target="_blank" rel="noreferrer"><ExternalLink />{t("website")}</a>
                      </Button>
                    ) : null}
                  </div>
                </div>

                {selectedStop.scoreReasons?.length ? (
                  <div className="flex flex-wrap gap-2" aria-label={tu("reasonsLabel")}>
                    {selectedStop.scoreReasons.map((reason) => <Pill key={reason} tone="slate">{reasonLabel(reason)}</Pill>)}
                  </div>
                ) : null}

                <div className={`rounded-2xl p-4 ${GLASS_CLASS}`}>
                  <div className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70"><Nfc className="h-5 w-5" /></span>
                    <div>
                      <p className="text-sm font-bold text-white">{t("demoPlaqueTitle")}</p>
                      <p className="mt-1 text-xs leading-5 text-white/50">{t("demoPlaqueBody")}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => openPlaqueSetup(selectedStop)}
                    disabled={ensureStopLead.isPending && pendingDestination !== "plaque"}
                    loading={pendingDestination === "plaque"}
                    aria-label={pendingDestination === "plaque" ? t("preparingDemo") : undefined}
                    className="mt-4 w-full"
                  >
                    <Nfc />{t("prepareDemoPlaque")}
                  </Button>
                </div>

                <div className="space-y-2">
                  {isStopOpen(selectedStop.status) ? (
                    <Button type="button" variant="brand" onClick={() => prepareCheckIn.mutate({ routeId: routeDetails.route.id, stopId: selectedStop.id })} loading={checkingInHere} className="w-full font-bold">
                      <MapPinCheck />{t("checkIn")}
                    </Button>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="secondary" onClick={() => openCompanyPanel(selectedStop)} disabled={ensureStopLead.isPending && pendingDestination !== "company"} loading={pendingDestination === "company"} className="min-w-0 px-2 sm:px-4">
                      <Building2 />{t("openCompanyPanel")}
                    </Button>
                    <Button asChild variant="secondary" className="min-w-0 px-2 sm:px-4">
                      <a href={stopNavigationUrl(selectedStop, appleDevice)} target="_blank" rel="noreferrer"><Navigation />{appleDevice ? t("appleMaps") : t("googleMaps")}</a>
                    </Button>
                  </div>
                </div>
              </div>
            </>
            );
          })() : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
