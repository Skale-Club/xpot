import { useQuery } from "@tanstack/react-query";
import type { PrintBed, PrintJobItem, PrintJobStatus, PrintModelItem, PrintModelStatus } from "@shared/printProduction";
import { Pill, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import { translate, useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { serverErrorText } from "@/lib/apiErrors";
import { AdminHttpError, ADMIN_TAGS_KEY, STALE_MS, getJson, withQuery } from "./api";

// Tags › Production (docs/PRINT_EXECUTION_PLAN.md): the queries, pills and the upload shared by the catalog, the
// model page, the queue and the order page. Every query key starts with ADMIN_TAGS_KEY, so invalidateAdminTags()
// refreshes them with the rest of the Tags admin (a print order also creates a batch).

export const PRODUCTION_BASE = "/production";

export const MODELS_KEY = [ADMIN_TAGS_KEY, "production", "models"] as const;
export const JOBS_KEY = [ADMIN_TAGS_KEY, "production", "jobs"] as const;

export type JobFilter = "open" | "done" | "all";

export function usePrintModels() {
  return useQuery({
    queryKey: MODELS_KEY,
    queryFn: () => getJson<PrintModelItem[]>("/api/xpot/admin/print-models"),
    staleTime: STALE_MS,
  });
}

export function usePrintJobs(filter: JobFilter, model?: string) {
  return useQuery({
    queryKey: [...JOBS_KEY, filter, model ?? null],
    queryFn: () => getJson<PrintJobItem[]>(withQuery("/api/xpot/admin/print-jobs", { status: filter, model })),
    staleTime: STALE_MS,
    // A bench may be building: keep the open queue fresh while it is on screen.
    refetchInterval: filter === "open" ? 20_000 : false,
  });
}

const JOB_TONE: Record<PrintJobStatus, PillTone> = {
  requested: "amber",
  building: "blue",
  ready: "green",
  printing: "blue",
  printed: "muted",
  failed: "red",
  cancelled: "muted",
};

const MODEL_TONE: Record<PrintModelStatus, PillTone> = {
  ready: "green",
  design_needed: "amber",
  retired: "muted",
};

export function JobStatusPill({ status }: { status: string }) {
  const t = useT(productionMessages);
  return <Pill tone={toneOf(JOB_TONE, status)}>{t(`jobStatus_${status}` as never)}</Pill>;
}

export function ModelStatusPill({ status }: { status: string }) {
  const t = useT(productionMessages);
  return <Pill tone={toneOf(MODEL_TONE, status)}>{t(`modelStatus_${status}` as never)}</Pill>;
}

export function KindPill({ kind }: { kind: string }) {
  const t = useT(productionMessages);
  return <Pill tone={kind === "part" ? "slate" : "violet"}>{t(kind === "part" ? "kindPart" : "kindSerialized")}</Pill>;
}

/** "x4 · 4 pieces · 4 h 34" — what one bed prints and how long it takes. */
export function bedSummary(bed: PrintBed, t: Translate<typeof productionMessages.en>): string {
  const parts = [bed.label, t.plural("pieceCount", bed.copies)];
  if (bed.minutes) parts.push(minutesText(bed.minutes));
  return parts.join(" · ");
}

export function minutesText(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

/** The bytes of a file as the request body (the server takes application/octet-stream, up to 64 MB). */
export async function uploadFile<T>(url: string, file: File): Promise<T> {
  const res = await fetch(withQuery(url, { filename: file.name }), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    let message = translate(commonMessages, "requestFailed");
    let code: string | null = null;
    try {
      const json = await res.json();
      message = serverErrorText(json, message);
      code = typeof json?.code === "string" ? json.code : null;
    } catch {
      // not JSON (a proxy's 413, say)
    }
    throw new AdminHttpError(res.status, message, code);
  }
  return (await res.json()) as T;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
