import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, TriangleAlert, XCircle } from "lucide-react";
import type { PrintJobDetail, PrintJobItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/xpot/Field";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { ADMIN_TAGS_KEY, errorMessage, getJson, invalidateAdminTags, sendJson } from "./api";
import { Loading, LoadError } from "./pieces-shared";

// "Did it come off the bed well?": the one confirmation of Mark printed, used from the orders list and the plate
// page. Yes → printed and every piece of the plate goes into stock. Some bad → the checked pieces become damaged,
// the rest go into stock. No → the plate failed (a reason is required). A part has no pieces to check.

type Mode = "ask" | "bad" | "failed";

export function PrintedDialog({ job, onClose }: { job: PrintJobItem | null; onClose: () => void }) {
  return job ? <PrintedDialogBody job={job} onClose={onClose} /> : null;
}

function PrintedDialogBody({ job, onClose }: { job: PrintJobItem; onClose: () => void }) {
  const t = useT(productionMessages);
  const tc = useT(commonMessages);
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("ask");
  const [bad, setBad] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState("");
  const serialized = Boolean(job.batchId);
  // The list carries no pieces: fetch the plate when the checklist opens (the plate page already has it cached).
  const detail = useQuery({
    queryKey: [ADMIN_TAGS_KEY, "production", "job", job.id],
    queryFn: () => getJson<PrintJobDetail>(`/api/xpot/admin/print-jobs/${job.id}`),
    enabled: mode === "bad",
  });
  const pieces = (detail.data?.pieces ?? []).filter((piece) => piece.stockStatus === "pending");
  const send = useMutation({
    mutationFn: (body: { action: "printed" | "fail"; reason?: string; badPieces?: string[] }) =>
      sendJson<PrintJobDetail>("POST", `/api/xpot/admin/print-jobs/${job.id}/transition`, body),
    onSuccess: async (updated) => {
      await invalidateAdminTags();
      toast({ title: t("orderNow", { status: t(`jobStatus_${updated.status}` as never) }) });
      onClose();
    },
    onError: (err) => toast({ title: t("couldNotUpdateOrder"), description: errorMessage(err), variant: "destructive" }),
  });
  const busy = send.isPending;
  // Back to the three answers whenever the person changes their mind.
  useEffect(() => { if (mode === "ask") { setBad(new Set()); setReason(""); } }, [mode]);
  const toggle = (code: string) => setBad((current) => {
    const next = new Set(current);
    if (!next.delete(code)) next.add(code);
    return next;
  });
  const description = serialized ? t("confirmPrintedBodyBatch") : t.plural("confirmPrintedBodyPart", job.quantity);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-md" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} data-testid="production-printed-dialog">
        <DialogHeader>
          <DialogTitle className="text-white">{t("confirmPrintedTitle")}</DialogTitle>
          <DialogDescription>{mode === "failed" ? t("confirmFailBody") : mode === "bad" ? t("printedBadHint") : description}</DialogDescription>
        </DialogHeader>

        {mode === "ask" ? (
          <div className="flex flex-col gap-2">
            <Button type="button" variant="brand" accent="tags" loading={busy} onClick={() => send.mutate({ action: "printed" })} data-testid="production-printed-yes">
              <CheckCircle2 />
              {t("printedYes")}
            </Button>
            {serialized ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setMode("bad")} data-testid="production-printed-some">
                <TriangleAlert />
                {t("printedSome")}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode("failed")} data-testid="production-printed-no">
              <XCircle />
              {t("printedNo")}
            </Button>
          </div>
        ) : null}

        {mode === "bad" ? (
          <div className="space-y-3">
            {detail.isLoading ? <Loading rows={3} /> : detail.error && !detail.data ? (
              <LoadError what={t("orderWhat")} error={detail.error} onRetry={() => void detail.refetch()} />
            ) : (
              <ul className="max-h-64 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/10" data-testid="production-printed-pieces">
                {pieces.map((piece) => (
                  <li key={piece.publicCode}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-white/[0.03]">
                      <input type="checkbox" checked={bad.has(piece.publicCode)} disabled={busy} onChange={() => toggle(piece.publicCode)} className="h-4 w-4 shrink-0 accent-violet-500" />
                      <span className="min-w-0 flex-1 text-white/80">{piece.position ?? "—"}</span>
                      <span className="font-mono text-xs text-white/55">{piece.serialNumber ?? "—"}</span>
                      <span className="font-mono text-xs text-white">{piece.publicCode}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode("ask")}><ChevronLeft />{tc("back")}</Button>
              <Button
                type="button"
                variant="brand"
                accent="tags"
                loading={busy}
                disabled={!pieces.length || bad.size === 0}
                onClick={() => send.mutate({ action: "printed", badPieces: Array.from(bad) })}
                data-testid="production-printed-confirm-bad"
              >
                {t("printedConfirmBad", { count: bad.size })}
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "failed" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="production-printed-reason" className="text-xs font-semibold text-white/60">{t("fieldReason")}</label>
              <Textarea id="production-printed-reason" value={reason} rows={3} maxLength={500} disabled={busy} autoFocus onChange={(event) => setReason(event.target.value)} aria-required />
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode("ask")}><ChevronLeft />{tc("back")}</Button>
              <Button type="button" variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => send.mutate({ action: "fail", reason: reason.trim() })} data-testid="production-printed-confirm-failed">
                {t("markFailed")}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
