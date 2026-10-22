import { useQuery } from "@tanstack/react-query";
import type { PrintBed, PrintJobItem, PrintJobStatus, PrintModelItem, PrintModelStatus, PrinterItem } from "@shared/printProduction";
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

const PRINTER_TONE: Record<string, PillTone> = {
  IDLE: "slate",
  PREPARE: "blue",
  RUNNING: "blue",
  PAUSE: "amber",
  FINISH: "green",
  FAILED: "red",
  OFFLINE: "muted",
  UNKNOWN: "muted",
};

export function usePrinters() {
  return useQuery({
    queryKey: [ADMIN_TAGS_KEY, "production", "printers"],
    queryFn: () => getJson<PrinterItem[]>("/api/xpot/admin/print-printers"),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/** What each paired bench last read from its printer: state, progress, the job on the bed. Nothing when no bench prints. */
export function PrinterCards() {
  const t = useT(productionMessages);
  const { data } = usePrinters();
  if (!data?.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="production-printers">
      {data.map((printer) => {
        const status = printer.status;
        const state = printer.stale || !status ? "UNKNOWN" : status.state;
        return (
          <div key={printer.deviceId} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold text-white">{status?.name ?? printer.deviceName}</span>
              <Pill tone={toneOf(PRINTER_TONE, state)}>{t(`printerState_${state}` as never)}</Pill>
            </div>
            {status && !printer.stale && (state === "RUNNING" || state === "PAUSE" || state === "PREPARE") ? (
              <div className="mt-2 space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.round(status.percent ?? 0)}%` }} />
                </div>
                <p className="truncate text-xs text-white/50">
                  {status.subtask ? `${status.subtask} · ` : ""}
                  {Math.round(status.percent ?? 0)}%
                  {status.remainingMinutes ? ` · ${t("printerRemaining", { time: minutesText(status.remainingMinutes) })}` : ""}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-white/40">
                {printer.stale ? t("printerStale", { device: printer.deviceName }) : status?.error || t("printerIdleHint")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
