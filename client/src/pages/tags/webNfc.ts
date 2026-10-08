// Thin wrapper around the Web NFC API (Chrome for Android only).
// Every operation takes an AbortSignal so the UI can cancel a pending tap.
// Errors carry a code; the screens turn it into words in the user's language.

import { contentKindOf } from "@shared/chipContent";

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
  return (window as unknown as { NDEFReader?: NdefReaderCtor }).NDEFReader ?? null;
}

export function isWebNfcSupported(): boolean {
  return getCtor() !== null;
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
    return await readNext(signal);
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
    await new Ctor().write({ records: [record] }, { overwrite: true, signal });
  } catch (err) {
    throw mapNfcError(err);
  }
}

/** Reads the next tap (after the write) and returns the URL stored, or null if it holds none. */
export async function readBack(signal: AbortSignal): Promise<string | null> {
  const reading = await scanOnce(signal);
  return reading.kind === "url" ? reading.url : reading.kind === "text" ? reading.text : null;
}
