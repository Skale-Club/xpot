// NFC provisioning protocol between Xpot (system of record) and the
// "Xpot NFC Writer" desktop app (nfc-provisioner/). Pure rules only.
//
// The app keeps its own copy of the wire constants (it ships separately); bump
// PROVISIONER_PROTOCOL_VERSION on any breaking change so old apps get a clear
// "update required" instead of misbehaving.

export const PROVISIONER_PROTOCOL_VERSION = 1;
export const PROVISIONER_PROTOCOL_HEADER = "x-provisioner-protocol";

export const NFC_PROVISIONING_STATUSES = ["not_programmed", "programmed", "verified", "locked", "failed"] as const;
export type NfcProvisioningStatus = (typeof NFC_PROVISIONING_STATUSES)[number];

export const PROVISIONING_JOB_STATUSES = ["pending", "claimed", "writing", "verifying", "succeeded", "failed", "cancelled"] as const;
export type ProvisioningJobStatus = (typeof PROVISIONING_JOB_STATUSES)[number];
export const OPEN_JOB_STATUSES: readonly ProvisioningJobStatus[] = ["pending", "claimed", "writing", "verifying"];

/** Events the desktop app may report (server-only events are excluded). */
export const DEVICE_EVENT_TYPES = [
  "reader_connected",
  "reader_disconnected",
  "tag_detected",
  "write_started",
  "write_completed",
  "verification_passed",
  "verification_failed",
  "error",
] as const;
export type DeviceEventType = (typeof DEVICE_EVENT_TYPES)[number];

/** Machine-readable failure reasons the app reports (free text goes in errorMessage). */
export const PROVISIONING_ERROR_CODES = [
  "no_reader",
  "multiple_readers",
  "unsupported_reader",
  "no_tag",
  "unsupported_tag",
  "tag_read_only",
  "insufficient_capacity",
  "write_failed",
  "tag_removed",
  "verification_mismatch",
  "cancelled_by_operator",
  "expired",
  "internal_error",
] as const;
export type ProvisioningErrorCode = (typeof PROVISIONING_ERROR_CODES)[number];

/** A job not finished within this window is expired and must be re-sent. */
export const PROVISIONING_JOB_TTL_MS = 30 * 60_000;
export const PAIRING_CODE_TTL_MS = 10 * 60_000;

// ─── Pairing codes ────────────────────────────────────────────────────────────
// 8 Crockford symbols shown as XXXX-XXXX; typed by a person into the app.

const PAIRING_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function encodePairingCode(bytes: ArrayLike<number>): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += PAIRING_ALPHABET[bytes[i] & 31];
  return code;
}

export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizePairingCode(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(cleaned) ? cleaned : null;
}

// ─── Job progress ─────────────────────────────────────────────────────────────

/** Job status implied by a progress event from the device, if any. */
export function statusAfterEvent(current: string, event: DeviceEventType): ProvisioningJobStatus | null {
  if (!OPEN_JOB_STATUSES.includes(current as ProvisioningJobStatus) || current === "pending") return null;
  if (event === "write_started") return "writing";
  if (event === "write_completed") return "verifying";
  return null;
}

export interface CompletionReport {
  outcome: "succeeded" | "failed";
  readbackUrl?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export type CompletionDecision =
  | { status: "succeeded"; tagStatus: "verified" }
  | { status: "failed"; tagStatus: NfcProvisioningStatus | null; errorCode: string; errorMessage: string | null };

/**
 * The server never takes "it worked" on trust: success requires the read-back
 * URL to equal the URL the job was created with, exactly.
 * A failure only marks the chip `failed` once a write may have touched it;
 * an attempt that failed before writing leaves the chip's status as it was.
 */
export function decideCompletion(
  job: { expectedUrl: string; status: string },
  report: CompletionReport,
): CompletionDecision {
  const writeAttempted = job.status === "writing" || job.status === "verifying";
  if (report.outcome === "succeeded") {
    if (report.readbackUrl === job.expectedUrl) return { status: "succeeded", tagStatus: "verified" };
    return {
      status: "failed",
      tagStatus: "failed",
      errorCode: "verification_mismatch",
      errorMessage: `Read back ${JSON.stringify(report.readbackUrl ?? null)}, expected ${job.expectedUrl}`,
    };
  }
  return {
    status: "failed",
    tagStatus: writeAttempted ? "failed" : null,
    errorCode: report.errorCode || "internal_error",
    errorMessage: report.errorMessage ?? null,
  };
}
