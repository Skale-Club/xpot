import { classifyScan, type ScanClassification } from "./tagApp.js";
import { normalizeTagCode, type TagAccessMethod } from "./tags.js";

export type TagIntakeScan =
  | { ok: true; publicCode: string; method: TagAccessMethod | null }
  | { ok: false; error: string };

const INVALID_INTAKE_SCAN = "Scan an Xpot QR/NFC link or public code";

/** Converts the raw QR/NFC/manual scanner payload into the permanent Xpot code. */
export function parseTagIntakeScan(raw: string | null | undefined, extraHosts: readonly string[] = []): TagIntakeScan {
  const value = (raw ?? "").trim();
  if (/^[0-9a-z-]{8,12}$/i.test(value)) {
    const publicCode = normalizeTagCode(value);
    if (publicCode) return { ok: true, publicCode, method: null };
  }
  const scan: ScanClassification = classifyScan(raw, extraHosts);
  if (scan.kind !== "xpot") return { ok: false, error: INVALID_INTAKE_SCAN };
  return { ok: true, publicCode: scan.code, method: scan.method };
}
