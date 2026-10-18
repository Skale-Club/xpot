import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole, Maximize2, Minimize2, ScanLine, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Pill, type PillTone } from "@/components/xpot/StatusPill";
import { GLASS_SUBTLE_CLASS, MODULE_ACCENT } from "@/components/xpot/surface";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { AdminHttpError, deleteJson, errorMessage, formatTime, invalidateAdminTags, sendJson } from "./api";
import { intakeKey, readCode, readErrorStatus, STATION_READS, type ReadStatus } from "./batches-model";
import { CameraButton, CodeEntry, ContinuousCamera, feedback } from "./scan-station";

interface ScanResult {
  tag: { id: string; publicCode: string };
  batchCount: number;
  receivedCount: number;
  alreadyRegistered: boolean;
}

type Read = {
  id: number;
  raw: string;
  code: string | null;
  status: ReadStatus | "sending" | "undone";
  tagId: string | null;
  message: string | null;
  at: Date;
};

const READ_TONE: Record<Read["status"], PillTone> = {
  sending: "muted",
  added: "violet",
  duplicate: "slate",
  invalid: "red",
  other_batch: "amber",
  closed: "red",
  error: "red",
  undone: "muted",
};

const READ_KEY = {
  sending: "readSending",
  added: "readAdded",
  duplicate: "readDuplicate",
  invalid: "readInvalid",
  other_batch: "readOtherBatch",
  closed: "readClosed",
  error: "readError",
  undone: "readUndone",
} as const;

/** What the station needs from the batch. */
export interface ReceiveBatch {
  id: string;
  batchCode: string;
  status: string;
  codeSource: string;
  tagCount: number;
  receivedCount: number;
  pendingCount: number;
}

/**
 * Batch › Receive: the intake station. The camera stays open between reads (or a hand scanner types into the box),
 * every read gets a line in the last-10 list with what happened (added / already in / not a code / another batch),
 * a beep and a buzz; "Undo last read" takes back a read made by mistake; "Close batch" stays at hand, with the
 * pending warning. A read retried (a timeout, a double tap) never counts twice: its key is stable per code.
 */
export function BatchReceiveStation({ batch, onRequestClose }: { batch: ReceiveBatch; onRequestClose: () => void }) {
  const t = useT(adminTagsFlowMessages);
  const tb = useT(manageTagsBatchesMessages);
  const { toast } = useToast();
  const [reads, setReads] = useState<Read[]>([]);
  const [camera, setCamera] = useState(false);
  const [full, setFull] = useState(false);
  const [counts, setCounts] = useState({ received: batch.receivedCount, total: batch.tagCount });
  const [undoing, setUndoing] = useState(false);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  const nextId = useRef(1);
  const refresh = useRef<number | undefined>(undefined);

  // The batch's own numbers win whenever they reload.
  useEffect(() => setCounts({ received: batch.receivedCount, total: batch.tagCount }), [batch.receivedCount, batch.tagCount]);
  useEffect(() => () => window.clearTimeout(refresh.current), []);
  // Leaving full screen with Escape.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const update = (id: number, patch: Partial<Read>) => setReads((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  /** The rest of the screen (pieces, counts) catches up once reading pauses. */
  const refreshSoon = () => {
    window.clearTimeout(refresh.current);
    refresh.current = window.setTimeout(() => void invalidateAdminTags(), 2500);
  };

  const send = useCallback(async (raw: string) => {
    const id = nextId.current++;
    const code = readCode(raw, [window.location.hostname]);
    const read: Read = { id, raw, code, status: code ? "sending" : "invalid", tagId: null, message: null, at: new Date() };
    setReads((list) => [read, ...list].slice(0, STATION_READS));
    if (!code) {
      feedback("error");
      return;
    }
    try {
      const result = await sendJson<ScanResult>("POST", `/api/xpot/admin/tag-batches/${batch.id}/scan`, { value: raw, idempotencyKey: intakeKey(batch.id, code) });
      update(id, { status: result.alreadyRegistered ? "duplicate" : "added", tagId: result.tag.id, code: result.tag.publicCode });
      setCounts({ received: result.receivedCount, total: result.batchCount });
      feedback(result.alreadyRegistered ? "warn" : "ok");
      if (!result.alreadyRegistered) refreshSoon();
    } catch (err) {
      const status = err instanceof AdminHttpError ? readErrorStatus(err.code, err.status) : "error";
      update(id, { status, message: errorMessage(err) });
      feedback(status === "other_batch" ? "warn" : "error");
    }
  }, [batch.id]);

  /** Reads go one at a time, in order, however fast they come. */
  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) await send(queue.current.shift()!);
    } finally {
      busy.current = false;
    }
  }, [send]);
  const enqueue = (raws: string[]) => {
    queue.current.push(...raws);
    void pump();
  };

  const lastAdded = reads.find((r) => r.status === "added" && r.tagId);
  const undo = async () => {
    if (!lastAdded?.tagId) return;
    setUndoing(true);
    try {
      const result = await deleteJson<{ publicCode: string; receivedCount: number; batchCount: number }>(
        `/api/xpot/admin/tag-batches/${batch.id}/tags/${lastAdded.tagId}`,
      );
      update(lastAdded.id, { status: "undone" });
      setCounts({ received: result.receivedCount, total: result.batchCount });
      feedback("warn");
      toast({ title: t("readUndoneToast", { code: result.publicCode }) });
      refreshSoon();
    } catch (err) {
      toast({ title: t("couldNotUndo"), description: errorMessage(err), variant: "destructive" });
      feedback("error");
    } finally {
      setUndoing(false);
    }
  };

  const pending = Math.max(counts.total - counts.received, 0);
  const issued = batch.codeSource === "issued";

  if (batch.status !== "open") {
    return <EmptyState compact tone="tags" icon={LockKeyhole} title={t("receiveClosed")} />;
  }

  return (
    <div
      className={full ? "fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-background p-4 sm:p-6" : "flex flex-col"}
      role={full ? "dialog" : undefined}
      aria-label={full ? t("receiveTitle", { code: batch.batchCode }) : undefined}
      data-testid="admin-tags-batch-intake"
    >
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <ScanLine className={`h-4 w-4 ${MODULE_ACCENT.tags.text}`} />
              {t("receiveTitle", { code: batch.batchCode })}
            </p>
            <p className="mt-1 text-xs text-white/45">{issued ? tb("receiveIntro") : tb("addPiecesIntro")}</p>
          </div>
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-violet-400/10 px-3 py-1 text-sm font-semibold tabular-nums text-violet-200" data-testid="intake-progress">
              {issued ? tb("receivedCount", { received: counts.received, total: counts.total }) : tb("registeredCount", { count: counts.total })}
            </span>
            <Button type="button" variant="ghost" size="icon" onClick={() => setFull((v) => !v)} aria-label={full ? t("exitFullScreen") : t("fullScreen")} aria-pressed={full}>
              {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </span>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1 basis-64">
            <CodeEntry onReads={enqueue} placeholder={tb("scanPlaceholder")} testId="admin-tags-batch-scan-input" />
          </div>
          <CameraButton on={camera} onToggle={() => setCamera((v) => !v)} />
        </div>
        {camera ? <ContinuousCamera onRead={(text) => enqueue([text])} onClose={() => setCamera(false)} /> : null}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">{t("lastReads", { count: STATION_READS })}</p>
          <Button type="button" variant="secondary" size="sm" disabled={!lastAdded || undoing} loading={undoing} onClick={() => void undo()} data-testid="intake-undo">
            <Undo2 className="h-4 w-4" />
            {lastAdded?.code ? t("undoRead", { code: lastAdded.code }) : t("undoLastRead")}
          </Button>
        </div>
        {reads.length === 0 ? (
          <EmptyState compact dense tone="tags" icon={ScanLine} title={t("noReadsYet")} cardStyle={{}} />
        ) : (
          <ol className={`divide-y divide-white/5 rounded-2xl ${GLASS_SUBTLE_CLASS}`} aria-live="polite" data-testid="intake-reads">
            {reads.map((r) => (
              <li key={r.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
                <span className="w-12 shrink-0 text-[11px] tabular-nums text-white/35">{formatTime(r.at.toISOString())}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-white">{r.code ?? r.raw}</p>
                  {r.message ? <p className="truncate text-xs text-white/45">{r.message}</p> : null}
                </div>
                <span data-testid={`intake-read-${r.status}`}>
                  <Pill tone={READ_TONE[r.status]}>{t(READ_KEY[r.status])}</Pill>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Close batch stays at hand, with what is still missing. */}
      {/* Above the phone's tab bar (components/xpot/MobileTabBar.tsx) unless full screen covers it. */}
      <div className={`sticky z-10 mx-auto mt-3 w-full max-w-3xl ${full ? "bottom-[max(env(safe-area-inset-bottom),8px)]" : "bottom-[calc(env(safe-area-inset-bottom)+96px)] lg:bottom-3"}`}>
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl ${GLASS_SUBTLE_CLASS} bg-background/95 px-3 py-2 backdrop-blur`}>
          <p className="text-xs text-white/60">{issued && pending ? <span className="text-amber-300">{t.plural("stillToReceive", pending)}</span> : t("closeWhenDone")}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => { setFull(false); onRequestClose(); }} data-testid="intake-close-batch">
            <LockKeyhole className="h-4 w-4" />
            {tb("closeBatch")}
          </Button>
        </div>
      </div>
    </div>
  );
}
