import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { TagBatchOption } from "@shared/tagsApi";
import { CopyButton } from "@/components/xpot/CopyButton";
import { ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { EYEBROW, MODULE_ACCENT } from "@/components/xpot/surface";
import { AdminHttpError, ADMIN_TAGS_KEY, errorMessage, getJson, STALE_MS } from "./api";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";

// Pickers' data and the loading / error / copy parts shared by the Tags admin screens. The labels for
// a piece's product, destination, face, status and scan events are in labels.ts (useTagLabels).

// ─── Pickers' data ────────────────────────────────────────────────────────────

export interface RepOption {
  id: number;
  displayName: string;
  role: string;
  isActive: boolean;
}

export interface LeadOption {
  id: number;
  name: string;
  city?: string | null;
  /** Set when the customer is matched to their Google place. */
  googlePlaceId?: string | null;
}

/** Resellers (Xpot reps), for "move to reseller" and the reseller filter. */
export function useReps() {
  return useQuery<RepOption[]>({
    queryKey: [ADMIN_TAGS_KEY, "pickers", "reps"],
    queryFn: async () => {
      const reps = await getJson<RepOption[]>("/api/xpot/admin/reps");
      return reps
        .map((r) => ({ id: r.id, displayName: r.displayName, role: r.role, isActive: r.isActive }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    staleTime: STALE_MS,
  });
}

/** Every lead (managers see all), trimmed to what a picker needs. */
export function useLeads() {
  return useQuery<LeadOption[]>({
    queryKey: [ADMIN_TAGS_KEY, "pickers", "leads"],
    queryFn: async () => {
      const leads = await getJson<Array<{ id: number; name: string; googlePlaceId?: string | null; locations?: Array<{ city?: string | null }> }>>("/api/xpot/leads");
      return leads
        .map((l) => ({ id: l.id, name: l.name, city: l.locations?.[0]?.city ?? null, googlePlaceId: l.googlePlaceId ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: STALE_MS,
  });
}

/** Batches for pickers (Pieces filter, Give a kit). Managers can read this list; the Batches screens are the admin's. */
export function useBatchOptions() {
  return useQuery<TagBatchOption[]>({
    queryKey: [ADMIN_TAGS_KEY, "pickers", "batches"],
    queryFn: () => getJson<TagBatchOption[]>("/api/xpot/admin/tag-batch-options"),
    staleTime: STALE_MS,
  });
}

// ─── Loading, error, copy ─────────────────────────────────────────────────────

/** The one loader of the Tags admin: skeleton rows (ListSkeleton), so an empty state never flashes first. */
export function Loading({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return <ListSkeleton rows={rows} className={`space-y-2 ${className}`} />;
}

/**
 * Load failure (ErrorState) with the server's reason (e.g. "Manager access required" on a 403) and a
 * Retry. `what` is already translated and fills "Could not load {what}." (e.g. "the pieces" / "as peças").
 */
export function LoadError({ what, error, onRetry, compact = false }: { what: string; error: unknown; onRetry?: () => void; compact?: boolean }) {
  const t = useT(manageTagsMessages);
  const forbidden = error instanceof AdminHttpError && (error.status === 401 || error.status === 403);
  return (
    <ErrorState
      title={forbidden ? t("noAccessHere") : t("couldNotLoad", { what })}
      message={error ? errorMessage(error) : undefined}
      onRetry={forbidden ? undefined : onRetry}
      compact={compact}
    />
  );
}

/** A labelled value (a URL) with the kit's CopyButton. */
export function CopyRow({ label, value }: { label: string; value: string }) {
  const t = useT(manageTagsMessages);
  return (
    <div className="space-y-1">
      <p className={EYEBROW}>{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white/80">{value}</code>
        <CopyButton value={value} iconOnly label={t("copyLabel", { label })} />
      </div>
    </div>
  );
}

/** "Kits →": a quiet link in the Tags accent, at the end of a section's title row. */
export function SectionLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-my-1 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold ${MODULE_ACCENT.tags.text} transition-colors hover:bg-white/[0.05] hover:text-violet-200`}
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
