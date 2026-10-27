// Thin wrapper around the Web NFC API (Chrome for Android only).
// Every operation takes an AbortSignal so the UI can cancel a pending tap.
// Errors carry a code; the screens turn it into words in the user's language.

import { contentKindOf } from "@shared/chipContent";
import { currentPlatform, isIpad } from "@/lib/device";

interface NdefRecordLike {
  recordType: string;
  mediaType?: string;
  data?: DataView;
  encoding?: string;
}
interface NdefReadingEventLike extends Event {
  serialNumber: string;
  message: { records: NdefRecordLike[] };
}
interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: unknown, options?: { overwrite?: boolean; signal?: AbortSignal }): Promise<void>;
  makeReadOnly?(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((ev: NdefReadingEventLike) => void) | null;
  onreadingerror: ((ev: Event) => void) | null;
}
type NdefReaderCtor = new () => NdefReaderLike;

export type NfcReading =
  | { kind: "url"; url: string; serialNumber: string }
  | { kind: "text"; text: string; serialNumber: string }
  | { kind: "empty"; serialNumber: string };

/** Keys in the tags dictionary. */
export type NfcErrorCode =
  | "nfcCancelled"
  | "nfcDenied"
  | "nfcUnsupported"
  | "nfcUnreadable"
  | "nfcRemoved"
  | "nfcInsecure"
  | "nfcBusy"
  | "nfcTimeout"
  | "nfcInterrupted"
  | "nfcGeneric"
  | "nfcNoBrowser";

export class NfcError extends Error {
  code: NfcErrorCode;
  /** Cancelled by the user: nothing to show. */
  silent: boolean;
  constructor(code: NfcErrorCode) {
    super(code);
    this.name = "NfcError";
    this.code = code;
    this.silent = code === "nfcCancelled";
  }
}

function getCtor(): NdefReaderCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { NDEFReader?: NdefReaderCtor }).NDEFReader ?? null;
}

// A missing tap (or a suspended Android NFC service) need not reject the native
// promise. Bound the wait ourselves and release the radio on every exit path.
export const NFC_TIMEOUT_MS = 30_000;

function runNfcOperation<T>(signal: AbortSignal, operation: (session: AbortSignal) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new NfcError("nfcCancelled"));
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      return reject(new NfcError("nfcInsecure"));
    }
    const session = new AbortController();
    let settled = false;
    const finish = (outcome: { value: T } | { error: NfcError }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      session.abort();
      if ("error" in outcome) reject(outcome.error);
      else resolve(outcome.value);
    };
    const onAbort = () => finish({ error: new NfcError("nfcCancelled") });
    const timer = setTimeout(() => finish({ error: new NfcError("nfcTimeout") }), NFC_TIMEOUT_MS);
    signal.addEventListener("abort", onAbort, { once: true });
    const fail = (err: unknown) => {
      const error = mapNfcError(err);
      // Only our caller's abort is a silent cancellation. A native interruption
      // without it must leave the waiting screen and offer a retry.
      finish({ error: error.silent ? new NfcError("nfcInterrupted") : error });
    };
    try {
      // Invoke synchronously: the first NFC permission prompt needs the click's
      // user activation. Do not put a permission query or a network await here.
      operation(session.signal).then((value) => finish({ value }), fail);
    } catch (err) {
      fail(err);
    }
  });
}

export function isWebNfcSupported(): boolean {
  return getCtor() !== null;
}

/**
 * How chips are handled on this device, so a screen offers only what works here:
 *   web   Chrome on Android: the app reads, writes and locks chips itself.
 *   app   Any other phone (iPhone, other Android browsers): NFC Tools writes and
 *         locks the chip; the app cannot read it.
 *   none  A computer or an iPad: no NFC at all; it hands the job to the phone with a QR.
 */
export type NfcMode = "web" | "app" | "none";

export function nfcMode(): NfcMode {
  if (isWebNfcSupported()) return "web";
  if (isIpad()) return "none";
  if (currentPlatform() !== "other") return "app";
  // A tablet with an unusual user agent still has a touch screen.
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "app" : "none";
}

export function mapNfcError(err: unknown): NfcError {
  if (err instanceof NfcError) return err;
  switch ((err as { name?: string } | null)?.name) {
    case "AbortError":
      return new NfcError("nfcCancelled");
    case "NotAllowedError":
      return new NfcError("nfcDenied");
    case "NotSupportedError":
      return new NfcError("nfcUnsupported");
    case "NotReadableError":
      return new NfcError("nfcUnreadable");
    case "NetworkError":
      return new NfcError("nfcRemoved");
    case "SecurityError":
      return new NfcError("nfcInsecure");
    case "InvalidStateError":
      return new NfcError("nfcBusy");
    default:
      return new NfcError("nfcGeneric");
  }
}

function decode(record: NdefRecordLike): string | null {
  if (!record.data) return null;
  try {
    return new TextDecoder(record.encoding || "utf-8").decode(record.data);
  } catch {
    return null;
  }
}

function readingFrom(ev: NdefReadingEventLike): NfcReading {
  for (const record of ev.message.records) {
    if (record.recordType === "url" || record.recordType === "absolute-url") {
      const url = decode(record);
      if (url) return { kind: "url", url, serialNumber: ev.serialNumber };
    }
  }
  // A contact card written as a text/vcard record (writeContent).
  for (const record of ev.message.records) {
    if (record.recordType === "mime" && /^text\/(x-)?vcard/i.test(record.mediaType ?? "")) {
      const text = decode(record);
      if (text) return { kind: "text", text, serialNumber: ev.serialNumber };
    }
  }
  for (const record of ev.message.records) {
    if (record.recordType === "text") {
      const text = decode(record);
      if (text) return { kind: "text", text, serialNumber: ev.serialNumber };
    }
  }
  return { kind: "empty", serialNumber: ev.serialNumber };
}

/** Resolves with the next reading. Each call gets a fresh reader, so it has no repeat history. */
function readNext(signal: AbortSignal): Promise<NfcReading> {
  const Ctor = getCtor();
  if (!Ctor) return Promise.reject(new NfcError("nfcNoBrowser"));
  const reader = new Ctor();
  // Own controller: the scan session ends as soon as this read settles, so a
  // finished read never keeps the radio busy (or swallows the next tap).
  const session = new AbortController();
  return new Promise<NfcReading>((resolve, reject) => {
    const cleanup = () => {
      reader.onreading = null;
      reader.onreadingerror = null;
      signal.removeEventListener("abort", onAbort);
      session.abort();
    };
    const onAbort = () => {
      cleanup();
      reject(new NfcError("nfcCancelled"));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort);
    reader.onreading = (ev) => {
      cleanup();
      resolve(readingFrom(ev));
    };
    reader.onreadingerror = () => {
      cleanup();
      reject(new NfcError("nfcUnreadable"));
    };
    reader.scan({ signal: session.signal }).catch((err) => {
      if (session.signal.aborted) return; // settled already, or cancelled via onAbort
      cleanup();
      reject(mapNfcError(err));
    });
  });
}

/** Waits for the next tap and returns what the chip holds. */
export async function scanOnce(signal: AbortSignal): Promise<NfcReading> {
  try {
    return await runNfcOperation(signal, readNext);
  } catch (err) {
    throw mapNfcError(err);
  }
}

/**
 * Writes one record on the next tap: a URI record for a link, mailto: or tel:
 * (phones open each in the right app), a text/vcard MIME record for a contact
 * card (phones offer to save the contact).
 */
export async function writeContent(value: string, signal: AbortSignal): Promise<void> {
  const Ctor = getCtor();
  if (!Ctor) throw new NfcError("nfcNoBrowser");
  const record = contentKindOf(value) === "vcard"
    ? { recordType: "mime", mediaType: "text/vcard", data: new TextEncoder().encode(value) }
    : { recordType: "url", data: value };
  try {
    await runNfcOperation(signal, (session) => new Ctor().write({ records: [record] }, { overwrite: true, signal: session }));
  } catch (err) {
    throw mapNfcError(err);
  }
}

/** Whether this browser can lock a chip (Chrome 100+ on Android). */
export function canLockChip(): boolean {
  const Ctor = getCtor();
  return !!Ctor && typeof Ctor.prototype.makeReadOnly === "function";
}

/** Makes the next chip tapped permanently read-only. Irreversible. */
export async function lockChip(signal: AbortSignal): Promise<void> {
  const Ctor = getCtor();
  if (!Ctor) throw new NfcError("nfcNoBrowser");
  const reader = new Ctor();
  if (typeof reader.makeReadOnly !== "function") throw new NfcError("nfcUnsupported");
  try {
    await runNfcOperation(signal, (session) => reader.makeReadOnly!({ signal: session }));
  } catch (err) {
    throw mapNfcError(err);
  }
}

/** Reads the next tap (after the write) and returns the URL stored, or null if it holds none. */
export async function readBack(signal: AbortSignal): Promise<string | null> {
  const reading = await scanOnce(signal);
  return reading.kind === "url" ? reading.url : reading.kind === "text" ? reading.text : null;
}
