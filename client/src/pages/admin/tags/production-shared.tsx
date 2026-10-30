import { useQuery } from "@tanstack/react-query";
import type { PrintBed, PrintJobItem, PrintJobStatus, PrintModelItem, PrintModelStatus, PrintRequestItem } from "@shared/printProduction";
import { Pill, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import { translate, useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { serverErrorText } from "@/lib/apiErrors";
import { AdminHttpError, ADMIN_TAGS_KEY, STALE_MS, getJson, withQuery } from "./api";

// Tags › Production (docs/PRINT_EXECUTION_PLAN.md): the queries, pills and the upload shared by the catalog, the
// model page, the queue of requests and the plate page. Every query key starts with ADMIN_TAGS_KEY, so
// invalidateAdminTags() refreshes them with the rest of the Tags admin (a plate also creates a batch).

export const PRODUCTION_BASE = "/production";

export const MODELS_KEY = [ADMIN_TAGS_KEY, "production", "models"] as const;
export const REQUESTS_KEY = [ADMIN_TAGS_KEY, "production", "requests"] as const;

export type JobFilter = "open" | "done" | "all";

export function usePrintModels() {
  return useQuery({
    queryKey: MODELS_KEY,
    queryFn: () => getJson<PrintModelItem[]>("/api/xpot/admin/print-models"),
    staleTime: STALE_MS,
  });
}

/** The requests with their plates, newest first. */
export function usePrintRequests(filter: JobFilter, model?: string) {
  return useQuery({
    queryKey: [...REQUESTS_KEY, filter, model ?? null],
    queryFn: () => getJson<PrintRequestItem[]>(withQuery("/api/xpot/admin/print-requests", { status: filter, model })),
    staleTime: STALE_MS,
    // File generation and physical receiving both change the request while it is on screen.
    refetchInterval: 20_000,
  });
}

/** The newest file of each kind a plate offers: the Bambu Studio project and the checked slice. */
export function plateDownloads(job: Pick<PrintJobItem, "downloads">) {
  return {
    project: job.downloads.find((f) => f.kind === "3mf") ?? null,
    sliced: job.downloads.find((f) => f.kind === "gcode_3mf") ?? null,
  };
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
