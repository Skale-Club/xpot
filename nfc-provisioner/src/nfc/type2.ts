// NFC Forum Type 2 tag operations (NTAG213/215/216 and compatibles) over a
// page-level I/O interface, so the logic is hardware-independent and testable.
//
// Memory map: pages of 4 bytes. Page 2 bytes 2–3 = static lock bits, page 3 =
// Capability Container (E1 10 <size/8> <access>), user data from page 4.

import { NdefError, decodeUriFromMessage, encodeUriRecord, findNdefMessage, wrapNdefTlv } from "./ndef";

export interface PageIO {
  /** `count` pages starting at `page` (count × 4 bytes). */
  readPages(page: number, count: number): Promise<Buffer>;
  /** Writes exactly one 4-byte page. */
  writePage(page: number, data: Buffer): Promise<void>;
}

export type TagErrorCode = "unsupported_tag" | "tag_read_only" | "insufficient_capacity" | "write_failed" | "tag_removed";

export class TagError extends Error {
  constructor(public code: TagErrorCode, message: string) {
    super(message);
  }
}

export interface TagInfo {
  /** e.g. "NTAG213" — inferred from the CC data-area size. */
  tagType: string;
  dataAreaBytes: number;
  writable: boolean;
  ndefVersion: string;
}

const FIRST_DATA_PAGE = 4;

const KNOWN_SIZES: Record<number, string> = {
  48: "MIFARE Ultralight",
  144: "NTAG213",
  496: "NTAG215",
  872: "NTAG216",
};

export async function readTagInfo(io: PageIO): Promise<TagInfo> {
  const header = await io.readPages(0, 4);
  if (header.length < 16) throw new TagError("unsupported_tag", "Could not read the tag header");
  const [magic, version, size, access] = header.subarray(12, 16);
  if (magic !== 0xe1) {
    throw new TagError("unsupported_tag", "Tag is not NDEF-formatted (no NFC Forum capability container)");
  }
  const dataAreaBytes = size * 8;
  // Static lock bits for pages 4–15 live in page 2 bytes 2 (bits 4–7) and 3.
  const staticLocked = (header[10] & 0xf0) !== 0 || header[11] !== 0;
  return {
    tagType: KNOWN_SIZES[dataAreaBytes] ?? `Type 2 (${dataAreaBytes} bytes)`,
    dataAreaBytes,
    writable: (access & 0x0f) === 0x00 && !staticLocked,
    ndefVersion: `${version >> 4}.${version & 0x0f}`,
  };
}

/** Reads the data area just far enough to decode the NDEF message. */
export async function readNdefUri(io: PageIO, info: TagInfo): Promise<string | null> {
  let data = await io.readPages(FIRST_DATA_PAGE, 4);
  for (let guard = 0; guard < 64; guard++) {
    const found = findNdefMessage(data);
    if (found.message) return found.message.length ? decodeUriFromMessage(found.message) : null;
    if (!found.needBytes || data.length >= info.dataAreaBytes) return null;
    const want = Math.min(info.dataAreaBytes, Math.ceil(found.needBytes / 16) * 16);
    const more = await io.readPages(FIRST_DATA_PAGE + data.length / 4, (want - data.length) / 4);
    data = Buffer.concat([data, more]);
  }
  return null;
}

export function bytesForUri(uri: string): Buffer {
  const tlv = wrapNdefTlv(encodeUriRecord(uri));
  const padded = Buffer.alloc(Math.ceil(tlv.length / 4) * 4);
  tlv.copy(padded);
  return padded;
}

/**
 * Writes `uri` as the only NDEF record. The NDEF TLV length is written as 0
 * first and set last, so a tag lifted mid-write reads as empty rather than as
 * a truncated (wrong) URL.
 */
export async function writeNdefUri(io: PageIO, info: TagInfo, uri: string): Promise<void> {
  if (!info.writable) throw new TagError("tag_read_only", "Tag is locked / read-only");
  let bytes: Buffer;
  try {
    bytes = bytesForUri(uri);
  } catch (err) {
    if (err instanceof NdefError) throw new TagError("insufficient_capacity", err.message);
    throw err;
  }
  if (bytes.length > info.dataAreaBytes) {
    throw new TagError("insufficient_capacity", `Needs ${bytes.length} bytes, tag has ${info.dataAreaBytes}`);
  }
  const pages = bytes.length / 4;
  const first = Buffer.from(bytes.subarray(0, 4));
  const lengthOffset = 1; // [0x03, L, …] — messages here are < 255 bytes
  const emptied = Buffer.from(first);
  emptied[lengthOffset] = 0x00;

  await io.writePage(FIRST_DATA_PAGE, emptied);
  for (let p = 1; p < pages; p++) {
    await io.writePage(FIRST_DATA_PAGE + p, bytes.subarray(p * 4, p * 4 + 4));
  }
  await io.writePage(FIRST_DATA_PAGE, first);
}
