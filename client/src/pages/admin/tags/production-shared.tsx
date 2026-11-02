import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { isSuperAdmin } from "@shared/modules";
import { productionOrganizations } from "@shared/organizations";
import type { PrintBed, PrintJobDetail, PrintJobItem, PrintJobStatus, PrintModelItem, PrintModelStatus, PrintRequestItem } from "@shared/printProduction";
import type { ProvisionerDeviceItem } from "@shared/tagsApi";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Pill, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import { translate, useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { serverErrorText } from "@/lib/apiErrors";
import { AdminHttpError, ADMIN_TAGS_KEY, STALE_MS, errorMessage, getJson, invalidateAdminTags, sendJson, withQuery } from "./api";
import { printComputers, type BuildState } from "./production-workflow";

// Tags › Production (docs/PRINT_EXECUTION_PLAN.md): the queries, pills and the upload shared by the catalog, the
// model page, the queue of requests and the plate page. Every query key starts with ADMIN_TAGS_KEY, so
// invalidateAdminTags() refreshes them with the rest of the Tags admin (a plate also creates a batch).

export const PRODUCTION_BASE = "/production";

export const MODELS_KEY = [ADMIN_TAGS_KEY, "production", "models"] as const;
export const REQUESTS_KEY = [ADMIN_TAGS_KEY, "production", "requests"] as const;

export type JobFilter = "open" | "done" | "all";

/**
 * Who this viewer prints for: the admin (every organization, the catalog too) or the Rep Admin of a branch that
 * prints its own pieces (that branch's requests, plates and bench only). `organizations` is what the Print dialog
 * offers and the queue filters by; `prints` false: no Production at all.
 */
export function useProductionAccess() {
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const isAdmin = isSuperAdmin(me);
  const organizations = productionOrganizations(me?.organizations, isAdmin);
  return { isAdmin, organizations, prints: organizations.length > 0 };
}

export function usePrintModels() {
  return useQuery({
    queryKey: MODELS_KEY,
    queryFn: () => getJson<PrintModelItem[]>("/api/xpot/admin/print-models"),
    staleTime: STALE_MS,
  });
}

/** The requests with their plates, newest first; `organization`: that organization's only. */
export function usePrintRequests(filter: JobFilter, model?: string, organization?: number) {
  return useQuery({
    queryKey: [...REQUESTS_KEY, filter, model ?? null, organization ?? null],
    queryFn: () => getJson<PrintRequestItem[]>(withQuery("/api/xpot/admin/print-requests", { status: filter, model, organization })),
    staleTime: STALE_MS,
    // The bench builds the files while the request is on screen.
    refetchInterval: 20_000,
  });
}

/** The paired computers that make print files, and whether each is on (heard from in the last few minutes). */
/** The sentence for a plate being built (see buildState): who is on it and whether there is anything to do, the same on the board, the list and the page. */
export function useBuildSentence() {
  const t = useT(productionMessages);
  return (job: Pick<PrintJobItem, "deviceName">, state: BuildState): string => {
    const device = job.deviceName ?? t("buildDeviceGeneric");
    return t(`build_${state}` as never, { device: state === "computerOff" ? device : device.charAt(0).toUpperCase() + device.slice(1) });
  };
}

export function usePrintComputers() {
  const { data: devices } = useQuery<ProvisionerDeviceItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "provisioners"],
    queryFn: () => getJson("/api/xpot/admin/tag-provisioners"),
    staleTime: STALE_MS,
    refetchInterval: 60_000,
  });
  return { loaded: devices !== undefined, computers: printComputers(devices ?? [], Date.now()) };
}

/**
 * A print file, taken with a check first: the endpoint answers a redirect to the file or a JSON error (storage off,
 * file gone, session over). The error becomes a message on the screen instead of a tab full of JSON.
 */
export function useFileDownload() {
  const t = useT(productionMessages);
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const download = async (id: string): Promise<boolean> => {
    setBusy(id);
    const href = `/api/xpot/admin/print-files/${id}`;
    try {
      const res = await fetch(href, { credentials: "include", redirect: "manual" });
      if (res.type !== "opaqueredirect" && !res.ok) throw new Error(String(res.status));
      const link = document.createElement("a");
      link.href = href;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    } catch {
      toast({ title: t("downloadFailed"), description: t("downloadFailedHint"), variant: "destructive" });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { download, busy };
}

/** "Download file": the main action of a job that is ready, a quiet one once it is on the printer. */
export function DownloadFileButton({ id, label, quiet = false, onDownloaded }: { id: string; label: string; quiet?: boolean; onDownloaded?: () => void }) {
  const { download, busy } = useFileDownload();
  return (
    <Button
      type="button"
      variant={quiet ? "ghost" : "brand"}
      accent="tags"
      size="sm"
      loading={busy === id}
      onClick={() => void download(id).then((ok) => { if (ok) onDownloaded?.(); })}
      data-testid="production-plate-download"
    >
      <Download />
      {label}
    </Button>
  );
}

/** The move of a print job that is one click: say it is on the printer. */
export function usePlateMoves() {
  const t = useT(productionMessages);
  const { toast } = useToast();
  const move = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "start" }) => sendJson<PrintJobDetail>("POST", `/api/xpot/admin/print-jobs/${id}/transition`, { action }),
    onSuccess: async (updated) => {
      await invalidateAdminTags();
      toast({ title: t("orderNow", { status: t(`jobStatus_${updated.status}` as never) }) });
    },
    onError: (err) => toast({ title: t("couldNotUpdateOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  return { start: (id: string) => move.mutate({ id, action: "start" }), starting: move.isPending ? move.variables?.id ?? null : null };
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

/** The colours a model is made in (stored in lowercase, the same words "Generate pieces" groups by). */
export const PRINT_THEMES = ["white", "black", "mixed"] as const;

/** The colour picker's options; a model saved with another colour keeps it as one more choice. */
export function useThemeOptions(current?: string | null) {
  const b = useT(productionBoardMessages);
  const own = current?.trim().toLowerCase();
  const extra = own && !(PRINT_THEMES as readonly string[]).includes(own) ? [{ value: own, label: own }] : [];
  return [...PRINT_THEMES.map((theme) => ({ value: theme, label: b(`theme_${theme}` as "theme_white") })), ...extra];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
