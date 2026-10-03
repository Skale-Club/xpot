import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Cpu, XCircle } from "lucide-react";
import { OPEN_JOB_STATUSES, type ProvisioningJobStatus } from "@shared/tagProvisioning";
import type { ProvisionerDeviceItem, TagProvisioningState } from "@shared/tagsApi";
import { Loader2 } from "@/components/ui/loader";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TAGS_KEY, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, STALE_MS } from "./api";
import { BTN, BTN_GHOST, CARD } from "./ui";
import { Select } from "./pieces-shared";

const NFC_STATUS: Record<string, { label: string; tone: string }> = {
  not_programmed: { label: "Not programmed", tone: "bg-white/10 text-white/60" },
  programmed: { label: "Programmed", tone: "bg-amber-400/10 text-amber-300" },
  verified: { label: "Verified", tone: "bg-emerald-400/10 text-emerald-300" },
  locked: { label: "Locked", tone: "bg-white/5 text-white/50" },
  failed: { label: "Failed", tone: "bg-red-400/10 text-red-300" },
};

export function NfcStatusPill({ status }: { status: string }) {
  const s = NFC_STATUS[status] ?? { label: status, tone: "bg-white/10 text-white/60" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${s.tone}`}>{s.label}</span>;
}

const JOB_STEP_LABEL: Record<string, string> = {
  pending: "Waiting for the desktop NFC writer…",
  claimed: "The writer has the job — place the piece on the reader and press Program.",
  writing: "Writing the chip…",
  verifying: "Reading back to verify…",
};

const ERROR_LABEL: Record<string, string> = {
  verification_mismatch: "Read-back did not match the expected URL",
  unsupported_tag: "Unsupported tag type",
  unsupported_reader: "Unsupported reader",
  multiple_readers: "More than one reader connected",
  tag_read_only: "Tag is read-only",
  insufficient_capacity: "Not enough memory on the tag",
  tag_removed: "Tag was removed during the write",
  write_failed: "Write failed",
  no_tag: "No tag on the reader",
  no_reader: "No reader connected",
  expired: "Job expired before completion",
  superseded: "Replaced by a newer job",
  cancelled_by_admin: "Cancelled from the website",
  cancelled_by_operator: "Cancelled at the writer",
  device_revoked: "Writer was revoked",
  internal_error: "Internal error",
};

const isOpen = (status: string | undefined) => !!status && OPEN_JOB_STATUSES.includes(status as ProvisioningJobStatus);

function QaItem({ done, label, at }: { done: boolean; label: string; at?: string | null }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <Circle className="h-4 w-4 shrink-0 text-white/30" />}
      <span className={done ? "text-white/80" : "text-white/40"}>{label}</span>
      {at ? <span className="ml-auto text-xs text-white/40">{formatDateTime(at)}</span> : null}
    </li>
  );
}

/**
 * Chip programming through the "Xpot NFC Provisioner" desktop app. The admin
 * creates a job; the app writes <base>/n/<code>, reads it back, and the server
 * marks the chip verified only on an exact match.
 */
export function NfcProvisioningCard({
  tagId,
  publicCode,
  nfcUrl,
  retired,
  onOpenWriters,
}: {
  tagId: string;
  publicCode: string;
  nfcUrl: string;
  retired: boolean;
  onOpenWriters?: () => void;
}) {
  const { toast } = useToast();
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const devicesQuery = useQuery<ProvisionerDeviceItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "pickers", "provisioners"],
    queryFn: () => getJson("/api/xpot/admin/tag-provisioners"),
    staleTime: STALE_MS,
  });
  const activeDevices = (devicesQuery.data ?? []).filter((d) => d.status === "active");

  const { data: state, isLoading, error } = useQuery<TagProvisioningState>({
    queryKey: [ADMIN_TAGS_KEY, "provisioning", tagId],
    queryFn: () => getJson(`/api/xpot/admin/tags/${tagId}/provisioning`),
    staleTime: 2_000,
    // Live progress while a job is open.
    refetchInterval: (q) => (isOpen(q.state.data?.jobs[0]?.status) ? 2_000 : false),
  });

  const send = useMutation({
    mutationFn: () => sendJson<TagProvisioningState>("POST", `/api/xpot/admin/tags/${tagId}/provisioning-jobs`, { deviceId: deviceId ?? null }),
    onSuccess: () => void invalidateAdminTags(),
    onError: (err) => toast({ title: "Could not send to the NFC writer", description: errorMessage(err), variant: "destructive" }),
  });
  const cancel = useMutation({
    mutationFn: (jobId: string) => sendJson("POST", `/api/xpot/admin/tag-provisioning-jobs/${jobId}/cancel`),
    onSuccess: () => void invalidateAdminTags(),
    onError: (err) => toast({ title: "Could not cancel", description: errorMessage(err), variant: "destructive" }),
  });

  const header = (right?: ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-white"><Cpu className="h-4 w-4 text-white/50" />NFC chip · desktop writer</p>
      {right}
    </div>
  );

  if (isLoading) {
    return <section className={`${CARD} space-y-3 p-4`}>{header(<Loader2 className="h-4 w-4 text-white/40" />)}</section>;
  }
  if (error || !state) {
    return (
      <section className={`${CARD} space-y-2 p-4`}>
        {header()}
        <p className="text-sm text-red-400">Could not load the chip status. {errorMessage(error)}</p>
      </section>
    );
  }

  const latest = state.jobs[0];
  const open = isOpen(latest?.status);
  const verified = state.status === "verified" || state.status === "locked";

  return (
    <section className={`${CARD} space-y-4 p-4`} data-testid="admin-nfc-provisioning-card">
      {header(<NfcStatusPill status={state.status} />)}

      <p className="text-xs text-white/50">
        The chip must hold exactly <code className="rounded bg-white/10 px-1 text-white/80">{nfcUrl}</code> — never the destination. Make sure the piece on
        the reader is the one printed <strong className="font-mono text-white">{publicCode}</strong>.
      </p>

      {open && latest ? (
        <div className="space-y-2 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <Loader2 className="h-4 w-4 text-blue-400" />
            {JOB_STEP_LABEL[latest.status] ?? latest.status}
          </p>
          <p className="text-xs text-white/50">
            {latest.deviceName ? `On ${latest.deviceName}. ` : ""}Expires {formatDateTime(latest.expiresAt)}.
          </p>
          <button type="button" className={BTN_GHOST} onClick={() => cancel.mutate(latest.id)} disabled={cancel.isPending}>
            Cancel job
          </button>
        </div>
      ) : retired ? (
        <p className="text-sm text-white/40">Retired pieces cannot be programmed.</p>
      ) : state.status === "locked" ? (
        <p className="text-sm text-white/40">This chip is locked and cannot be rewritten.</p>
      ) : devicesQuery.isLoading ? (
        <Loader2 className="h-4 w-4 text-white/40" />
      ) : activeDevices.length === 0 ? (
        <p className="text-sm text-white/40">
          No paired NFC writer yet —{" "}
          {onOpenWriters ? (
            <button type="button" className="text-blue-400 hover:text-blue-300" onClick={onOpenWriters}>pair one in NFC writers</button>
          ) : (
            "pair one in the NFC writers tab"
          )}
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={deviceId}
            onChange={setDeviceId}
            placeholder="Any paired writer"
            options={activeDevices.map((d) => ({ value: d.id, label: d.deviceName }))}
            className="sm:max-w-xs"
          />
          <button type="button" className={`${BTN} shrink-0`} onClick={() => send.mutate()} disabled={send.isPending} data-testid="admin-nfc-send">
            {state.status === "not_programmed" ? "Send to writer" : "Program again"}
          </button>
        </div>
      )}

      {latest && !open ? (
        <div className="flex items-start gap-2 text-sm">
          {latest.status === "succeeded" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          )}
          <div className="min-w-0 text-white/70">
            <p>
              Last job {latest.status}
              {latest.tagType ? ` · ${latest.tagType}` : ""}
              {latest.deviceName ? ` · ${latest.deviceName}` : ""} · {formatDateTime(latest.completedAt ?? latest.createdAt)}
            </p>
            {latest.errorCode ? (
              <p className="break-all text-xs text-white/40">
                {ERROR_LABEL[latest.errorCode] ?? latest.errorCode}
                {latest.errorMessage ? ` — ${latest.errorMessage}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Pairing QA</p>
        <ul className="space-y-1.5">
          <QaItem done={verified} label="Chip written and read back" at={state.verifiedAt} />
          <QaItem done={!!state.tapTestAt} label="Real phone NFC tap reached this piece" at={state.tapTestAt} />
          <QaItem done={!!state.qrTestAt} label="Printed QR scan reached this piece" at={state.qrTestAt} />
        </ul>
        {verified && (!state.tapTestAt || !state.qrTestAt) ? (
          <p className="mt-2 text-xs text-white/40">Tap the chip and scan the printed QR with a phone to confirm both are the same piece.</p>
        ) : null}
      </div>
    </section>
  );
}
