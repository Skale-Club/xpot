import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isSuperAdmin } from "@shared/modules";
import { JOURNEY_ENTRY_KINDS, JOURNEY_PRODUCTION_ACTIONS, PLAN_KINDS, PLAN_STATUSES } from "@shared/tagJourney";
import type { TagJourney } from "@shared/tagsApi";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { ADMIN_TAGS_KEY, STALE_MS, getJson, withQuery } from "./api";

// Shared bits of the Tags Journey admin: who may see it, the timeline query,
// labels and tones. The journey is Skale Club's internal production story, so
// everything here is admin only (managers get 403 from the server as well).

/** Same rule as the server's requireTagAdmin: users.is_admin or rep role "admin". */
export function useIsTagAdmin(): boolean {
  const { data } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  return isSuperAdmin(data);
}

/** The batch / piece a new entry or plan is attached to. */
export interface JourneyScope {
  batchId?: string;
  tagId?: string;
}

export interface JourneyFilters extends JourneyScope {
  repId?: number | null;
  kind?: string;
  includeArchived?: boolean;
}

export const JOURNEY_LIMIT = 300;

/** The timeline and plans of a scope. `enabled` keeps non-admins from firing the request. */
export function useJourney(filters: JourneyFilters, enabled: boolean) {
  const url = withQuery("/api/xpot/admin/tag-journey", {
    batchId: filters.batchId,
    tagId: filters.tagId,
    repId: filters.repId,
    kind: filters.kind,
    includeArchived: filters.includeArchived ? "1" : undefined,
    limit: JOURNEY_LIMIT,
  });
  return useQuery<TagJourney>({
    queryKey: [ADMIN_TAGS_KEY, "journey", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
    enabled,
  });
}

/**
 * Kind, status, plan and production-step names in the language in use. The shared English labels
 * in @shared/tagJourney stay for the titles the server writes; the screens translate here.
 * An unknown value (free-text action, a newer status) shows as stored, underscores as spaces.
 */
export function useJourneyLabels() {
  const t = useT(manageTagsMessages);
  return useMemo(() => {
    const lookup = (prefix: string, value: string) => {
      const key = `${prefix}${value}`;
      const label = t(key as never);
      return label === key ? value.replace(/_/g, " ") : label;
    };
    const kind = (value: string) => lookup("journeyKind_", value);
    const entryStatus = (value: string) => lookup("entryStatus_", value);
    const planKind = (value: string) => lookup("planKind_", value);
    const planStatus = (value: string) => lookup("planStatus_", value);
    const action = (value: string) => lookup("journeyAction_", value);
    return {
      kind,
      entryStatus,
      planKind,
      planStatus,
      action,
      kindOptions: JOURNEY_ENTRY_KINDS.map((value) => ({ value, label: kind(value) })),
      actionOptions: JOURNEY_PRODUCTION_ACTIONS.map((value) => ({ value, label: action(value) })),
      planKindOptions: PLAN_KINDS.map((value) => ({ value, label: planKind(value) })),
      planStatusOptions: PLAN_STATUSES.map((value) => ({ value, label: planStatus(value) })),
    };
  }, [t]);
}

const KIND_TONES: Record<string, string> = {
  execution: "bg-white/10 text-white/70",
  decision: "bg-blue-400/10 text-blue-300",
  insight: "bg-violet-400/10 text-violet-300",
  observation: "bg-white/5 text-white/50",
  risk: "bg-amber-400/10 text-amber-300",
  result: "bg-emerald-400/10 text-emerald-300",
};

const ENTRY_STATUS_TONES: Record<string, string> = {
  active: "bg-emerald-400/10 text-emerald-300",
  needs_review: "bg-amber-400/10 text-amber-300",
  archived: "bg-white/5 text-white/40",
  superseded: "bg-white/5 text-white/40",
};

const PLAN_STATUS_TONES: Record<string, string> = {
  draft: "bg-white/10 text-white/60",
  active: "bg-blue-400/10 text-blue-300",
  paused: "bg-amber-400/10 text-amber-300",
  validated: "bg-emerald-400/10 text-emerald-300",
  done: "bg-emerald-400/10 text-emerald-300",
  invalidated: "bg-red-400/10 text-red-300",
  cancelled: "bg-white/5 text-white/40",
};

const PILL = "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold";

export function KindBadge({ kind }: { kind: string }) {
  const labels = useJourneyLabels();
  return <span className={`${PILL} ${KIND_TONES[kind] ?? "bg-white/10 text-white/60"}`}>{labels.kind(kind)}</span>;
}

export function EntryStatusBadge({ status }: { status: string }) {
  const labels = useJourneyLabels();
  return <span className={`${PILL} ${ENTRY_STATUS_TONES[status] ?? "bg-white/10 text-white/60"}`}>{labels.entryStatus(status)}</span>;
}

export function PlanStatusBadge({ status }: { status: string }) {
  const labels = useJourneyLabels();
  return <span className={`${PILL} ${PLAN_STATUS_TONES[status] ?? "bg-white/10 text-white/60"}`}>{labels.planStatus(status)}</span>;
}
