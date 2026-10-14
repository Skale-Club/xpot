import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Radar } from "lucide-react";
import { Link } from "wouter";
import { useT } from "@/i18n";
import { prospectingMessages } from "@/i18n/messages/prospecting";
import {
  persistentProspectingJob,
  prospectingProgress,
  type ProspectingProgressStage,
} from "@/pages/xpot/prospectingUi";

type ProspectingJob = {
  id: number;
  status: string;
  routePlanningStatus: "pending" | "building" | "ready" | "failed";
  location: string;
  createdAt: string;
};

type ProspectingJobDetails = {
  job: ProspectingJob;
  runs: Array<{ status: string; progress: number; wave: number }>;
  summary: { eligible: number; excluded: number };
};

type ProspectingRoute = { id: number; jobId: number | null; status: string; createdAt: string | null };

function stageStatus(stage: ProspectingProgressStage, t: ReturnType<typeof useT<typeof prospectingMessages.en>>) {
  if (stage === "queued") return t("statusQueued");
  if (stage === "review") return t("preparingRoute");
  if (stage === "route") return t("statusCompleted");
  if (stage === "failed") return t("statusFailed");
  return t("statusRunning");
}

function progressStep(stage: ProspectingProgressStage) {
  if (stage === "route") return 3;
  if (stage === "review") return 2;
  if (stage === "filtering") return 1;
  return 0;
}

function ProgressRail({
  activeStep,
  compact = false,
  isSearching,
  label,
  percent,
}: {
  activeStep: number;
  compact?: boolean;
  isSearching: boolean;
  label: string;
  percent: number;
}) {
  return (
    <span
      className={compact ? "absolute inset-x-1.5 bottom-0.5 block h-2" : "relative mt-1.5 block h-3"}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
        <span className="relative block h-full overflow-hidden rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-[width] duration-300" style={{ width: `${percent}%` }}>
          {isSearching ? <span className="xpot-progress-shimmer absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-white/75 to-transparent" aria-hidden="true" /> : null}
        </span>
      </span>
      <span className="absolute inset-0 flex items-center justify-between" aria-hidden="true">
        {[0, 1, 2, 3].map((step) => (
          <span
            key={step}
            className={step < activeStep
              ? "h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_5px_rgba(125,211,252,0.7)]"
              : step === activeStep
                ? "h-2.5 w-2.5 rounded-full border border-indigo-100/80 bg-indigo-400 shadow-[0_0_0_2px_rgba(20,27,49,0.95)]"
                : "h-1.5 w-1.5 rounded-full border border-white/25 bg-[#171d30]"}
          />
        ))}
      </span>
    </span>
  );
}

/** Shell-level visibility for the automatic search-and-route pipeline. */
export function PersistentRouteProgress({ collapsed = false, className = "" }: { collapsed?: boolean; className?: string }) {
  const t = useT(prospectingMessages);
  const jobsQuery = useQuery<ProspectingJob[]>({
    queryKey: ["/api/xpot/prospecting/jobs"],
    refetchInterval: (query) => query.state.data?.some((job) => ["queued", "running"].includes(job.status)
      || ["pending", "building"].includes(job.routePlanningStatus)) ? 10_000 : false,
  });
  const routeIsBeingBuilt = jobsQuery.data?.some((job) => job.status === "completed" && ["pending", "building"].includes(job.routePlanningStatus)) ?? false;
  const routesQuery = useQuery<ProspectingRoute[]>({
    queryKey: ["/api/xpot/prospecting/routes"],
    refetchInterval: routeIsBeingBuilt ? 10_000 : false,
  });
  const shellItem = persistentProspectingJob(jobsQuery.data ?? [], routesQuery.data ?? []);
  const detailsQuery = useQuery<ProspectingJobDetails>({
    queryKey: ["/api/xpot/prospecting/jobs", shellItem?.job.id],
    enabled: shellItem !== null,
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return job && (["queued", "running"].includes(job.status) || ["pending", "building"].includes(job.routePlanningStatus)) ? 8_000 : false;
    },
  });
  const details = detailsQuery.data;

  if (!shellItem || !details) return null;

  const progress = prospectingProgress({
    jobStatus: details.job.status,
    runs: details.runs,
    eligibleCount: details.summary.eligible,
    hasRoute: Boolean(shellItem.route),
    routePlanningStatus: details.job.routePlanningStatus,
  });
  const status = stageStatus(progress.stage, t);
  const destination = shellItem.route
    ? `/route?routeId=${shellItem.route.id}`
    : `/route?jobId=${details.job.id}`;
  const accessibleLabel = `${t("recentPlans")}: ${status}, ${progress.percent}%. ${details.job.location}`;
  const isSearching = ["queued", "running"].includes(details.job.status) || progress.stage === "review";
  const activeStep = progressStep(progress.stage);

  if (collapsed) {
    return (
      <Link
        href={destination}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        className={`group relative mx-auto flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-indigo-300/20 bg-indigo-400/[0.08] text-indigo-200 transition hover:border-indigo-300/40 hover:bg-indigo-400/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 ${className}`}
        data-testid="persistent-route-progress-collapsed"
      >
        <Radar className={`h-[18px] w-[18px] ${isSearching ? "animate-pulse" : ""}`} aria-hidden="true" />
        <ProgressRail compact activeStep={activeStep} isSearching={isSearching} label={accessibleLabel} percent={progress.percent} />
      </Link>
    );
  }

  return (
    <Link
      href={destination}
      aria-label={accessibleLabel}
      className={`group relative block overflow-hidden rounded-2xl border border-indigo-300/20 bg-indigo-400/[0.07] px-3 py-2.5 shadow-[0_10px_28px_rgba(14,20,43,0.22)] transition hover:border-indigo-300/35 hover:bg-indigo-400/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 active:scale-[0.985] ${className}`}
      data-testid="persistent-route-progress"
    >
      <span className="flex items-center gap-2.5">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-400/15 text-indigo-200">
          {progress.stage === "route"
            ? <Check className="h-4 w-4" aria-hidden="true" />
            : <Radar className={`h-4 w-4 ${isSearching ? "animate-pulse" : ""}`} aria-hidden="true" />}
          {isSearching ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_7px_rgba(125,211,252,0.9)]" aria-hidden="true" /> : null}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <strong className="min-w-0 flex-1 truncate text-xs font-bold text-white/90">{status}</strong>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-indigo-100">{progress.percent}%</span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] leading-4 text-white/45">{details.job.location}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-200" aria-hidden="true" />
      </span>
      <ProgressRail activeStep={activeStep} isSearching={isSearching} label={accessibleLabel} percent={progress.percent} />
    </Link>
  );
}
