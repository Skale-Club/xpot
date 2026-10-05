import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Cpu, XCircle } from "lucide-react";
import { OPEN_JOB_STATUSES, type ProvisioningJobStatus } from "@shared/tagProvisioning";
import type { ProvisionerDeviceItem, TagProvisioningState } from "@shared/tagsApi";
import { AdminBadge } from "@/components/xpot/AdminBadge";
import { Loader2 } from "@/components/ui/loader";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TAGS_KEY, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, STALE_MS } from "./api";
import { BTN, BTN_GHOST, CARD } from "./ui";
import { Select } from "./pieces-shared";
import { useTagLabels } from "./labels";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";

type PieceKey = keyof (typeof manageTagsPiecesMessages)["en"];

const NFC_TONE: Record<string, string> = {
  not_programmed: "bg-white/10 text-white/60",
  programmed: "bg-amber-400/10 text-amber-300",
  verified: "bg-emerald-400/10 text-emerald-300",
  locked: "bg-white/5 text-white/50",
  failed: "bg-red-400/10 text-red-300",
};

export function NfcStatusPill({ status }: { status: string }) {
  const labels = useTagLabels();
  const tone = NFC_TONE[status] ?? "bg-white/10 text-white/60";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{labels.chip(status)}</span>;
}

const JOB_STEP_KEYS: Record<string, PieceKey> = {
  pending: "jobStep_pending",
  claimed: "jobStep_claimed",
  writing: "jobStep_writing",
  verifying: "jobStep_verifying",
};

const LAST_JOB_KEYS: Record<string, PieceKey> = {
  succeeded: "lastJob_succeeded",
  failed: "lastJob_failed",
  cancelled: "lastJob_cancelled",
};

const ERROR_KEYS: Record<string, PieceKey> = {
  verification_mismatch: "jobError_verification_mismatch",
  unsupported_tag: "jobError_unsupported_tag",
  unsupported_reader: "jobError_unsupported_reader",
  multiple_readers: "jobError_multiple_readers",
  tag_read_only: "jobError_tag_read_only",
  insufficient_capacity: "jobError_insufficient_capacity",
  tag_removed: "jobError_tag_removed",
  write_failed: "jobError_write_failed",
  no_tag: "jobError_no_tag",
  no_reader: "jobError_no_reader",
  expired: "jobError_expired",
  superseded: "jobError_superseded",
  cancelled_by_admin: "jobError_cancelled_by_admin",
  cancelled_by_operator: "jobError_cancelled_by_operator",
  device_revoked: "jobError_device_revoked",
  internal_error: "jobError_internal_error",
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
  const t = useT(manageTagsPiecesMessages);
  const ts = useT(shellMessages);
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
    onError: (err) => toast({ title: t("sendFailed"), description: errorMessage(err), variant: "destructive" }),
  });
  const cancel = useMutation({
    mutationFn: (jobId: string) => sendJson("POST", `/api/xpot/admin/tag-provisioning-jobs/${jobId}/cancel`),
    onSuccess: () => void invalidateAdminTags(),
    onError: (err) => toast({ title: t("cancelFailed"), description: errorMessage(err), variant: "destructive" }),
  });

  const header = (right?: ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-white"><Cpu className="h-4 w-4 text-white/50" />{t("nfcCardTitle")}<AdminBadge /></p>
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
        <p className="text-sm text-red-400">{t("chipStatusFailed")} {errorMessage(error)}</p>
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
        {t("mustHoldBefore")}
        <code className="rounded bg-white/10 px-1 text-white/80">{nfcUrl}</code>
        {t("mustHoldMiddle")}
        <strong className="font-mono text-white">{publicCode}</strong>
        {t("mustHoldAfter")}
      </p>

      {open && latest ? (
        <div className="space-y-2 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <Loader2 className="h-4 w-4 text-blue-400" />
            {JOB_STEP_KEYS[latest.status] ? t(JOB_STEP_KEYS[latest.status]) : latest.status}
          </p>
          <p className="text-xs text-white/50">
            {latest.deviceName
              ? t("jobOnDeviceExpires", { name: latest.deviceName, date: formatDateTime(latest.expiresAt) })
              : t("jobExpires", { date: formatDateTime(latest.expiresAt) })}
          </p>
          <button type="button" className={BTN_GHOST} onClick={() => cancel.mutate(latest.id)} disabled={cancel.isPending}>
            {t("cancelJob")}
          </button>
        </div>
      ) : retired ? (
        <p className="text-sm text-white/40">{t("retiredCannotProgram")}</p>
      ) : state.status === "locked" ? (
        <p className="text-sm text-white/40">{t("chipLocked")}</p>
      ) : devicesQuery.isLoading ? (
        <Loader2 className="h-4 w-4 text-white/40" />
      ) : activeDevices.length === 0 ? (
        <p className="text-sm text-white/40">
          {t("noWriterBefore")}
          {onOpenWriters ? (
            <button type="button" className="text-blue-400 hover:text-blue-300" onClick={onOpenWriters}>{t("noWriterLink", { tab: ts("manageWriters") })}</button>
          ) : (
            t("noWriterPlain", { tab: ts("manageWriters") })
          )}
          {t("noWriterAfter")}
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={deviceId}
            onChange={setDeviceId}
            placeholder={t("anyWriter")}
            options={activeDevices.map((d) => ({ value: d.id, label: d.deviceName }))}
            className="sm:max-w-xs"
          />
          <button type="button" className={`${BTN} shrink-0`} onClick={() => send.mutate()} disabled={send.isPending} data-testid="admin-nfc-send">
            {state.status === "not_programmed" ? t("sendToWriter") : t("programAgain")}
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
              {LAST_JOB_KEYS[latest.status] ? t(LAST_JOB_KEYS[latest.status]) : t("lastJob", { status: latest.status })}
              {latest.tagType ? ` · ${latest.tagType}` : ""}
              {latest.deviceName ? ` · ${latest.deviceName}` : ""} · {formatDateTime(latest.completedAt ?? latest.createdAt)}
            </p>
            {latest.errorCode ? (
              <p className="break-all text-xs text-white/40">
                {ERROR_KEYS[latest.errorCode] ? t(ERROR_KEYS[latest.errorCode]) : latest.errorCode}
                {latest.errorMessage ? ` — ${latest.errorMessage}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{t("pairingQa")}</p>
        <ul className="space-y-1.5">
          <QaItem done={verified} label={t("qaWritten")} at={state.verifiedAt} />
          <QaItem done={!!state.tapTestAt} label={t("qaTap")} at={state.tapTestAt} />
          <QaItem done={!!state.qrTestAt} label={t("qaQr")} at={state.qrTestAt} />
        </ul>
        {verified && (!state.tapTestAt || !state.qrTestAt) ? (
          <p className="mt-2 text-xs text-white/40">{t("qaHint")}</p>
        ) : null}
      </div>
    </section>
  );
}
