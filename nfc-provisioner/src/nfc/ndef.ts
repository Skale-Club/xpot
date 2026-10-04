// NFC Forum NDEF: a single well-known URI record ("U"), wrapped in the NDEF
// TLV used by Type 2 tags. Only what the provisioner needs, no dependencies.

/** URI identifier codes (NFC Forum URI RTD, table 3). Index = code. */
const URI_PREFIXES = [
  "", "http://www.", "https://www.", "http://", "https://", "tel:", "mailto:",
  "ftp://anonymous:anonymous@", "ftp://ftp.", "ftps://", "sftp://", "smb://", "nfs://",
  "ftp://", "dav://", "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:", "sip:",
  "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://", "tcpobex://", "irdaobex://",
  "file://", "urn:epc:id:", "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:", "urn:nfc:",
];

const TNF_WELL_KNOWN = 0x01;
const TLV_NULL = 0x00;
const TLV_NDEF = 0x03;
const TLV_TERMINATOR = 0xfe;

export class NdefError extends Error {}

/** One NDEF message holding one short URI record. */
export function encodeUriRecord(uri: string): Buffer {
  // Longest matching prefix wins ("https://www." before "https://").
  let code = 0;
  for (let i = 1; i < URI_PREFIXES.length; i++) {
    if (uri.startsWith(URI_PREFIXES[i]) && URI_PREFIXES[i].length > URI_PREFIXES[code].length) code = i;
  }
  const rest = Buffer.from(uri.slice(URI_PREFIXES[code].length), "utf8");
  const payload = Buffer.concat([Buffer.from([code]), rest]);
  if (payload.length > 255) throw new NdefError("URI too long for a short record");
  // MB | ME | SR | TNF=well-known
  return Buffer.concat([Buffer.from([0xd1, 0x01, payload.length, 0x55]), payload]);
}

/** NDEF TLV + terminator, as written from page 4 of a Type 2 tag. */
export function wrapNdefTlv(message: Buffer): Buffer {
  const length = message.length < 0xff
    ? Buffer.from([message.length])
    : Buffer.from([0xff, (message.length >> 8) & 0xff, message.length & 0xff]);
  return Buffer.concat([Buffer.from([TLV_NDEF]), length, message, Buffer.from([TLV_TERMINATOR])]);
}

/**
 * Finds the NDEF TLV in a Type 2 data area. Returns its value (the NDEF
 * message), an empty buffer for an empty NDEF TLV, or null if there is none.
 * `needBytes` reports how many bytes the caller must read to finish parsing.
 */
export function findNdefMessage(data: Buffer): { message: Buffer | null; needBytes?: number } {
  let i = 0;
  while (i < data.length) {
    const t = data[i];
    if (t === TLV_NULL) { i += 1; continue; }
    if (t === TLV_TERMINATOR) return { message: null };
    if (i + 1 >= data.length) return { message: null, needBytes: i + 4 };
    let len = data[i + 1];
    let header = 2;
    if (len === 0xff) {
      if (i + 3 >= data.length) return { message: null, needBytes: i + 4 };
      len = (data[i + 2] << 8) | data[i + 3];
      header = 4;
    }
    const start = i + header;
    if (t === TLV_NDEF) {
      if (start + len > data.length) return { message: null, needBytes: start + len };
      return { message: data.subarray(start, start + len) };
    }
    // Lock Control (0x01), Memory Control (0x02) and proprietary TLVs: skip.
    i = start + len;
  }
  return { message: null, needBytes: data.length + 16 };
}

/** The URI of the first well-known "U" record of an NDEF message, or null. */
export function decodeUriFromMessage(message: Buffer): string | null {
  let i = 0;
  while (i < message.length) {
    const flags = message[i];
    const tnf = flags & 0x07;
    const sr = (flags & 0x10) !== 0;
    const il = (flags & 0x08) !== 0;
    const typeLength = message[i + 1];
    let p = i + 2;
    let payloadLength: number;
    if (sr) {
      payloadLength = message[p];
      p += 1;
    } else {
      payloadLength = message.readUInt32BE(p);
      p += 4;
    }
    const idLength = il ? message[p++] : 0;
    const type = message.subarray(p, p + typeLength).toString("latin1");
    p += typeLength + idLength;
    const payload = message.subarray(p, p + payloadLength);
    if (payload.length !== payloadLength) throw new NdefError("Truncated NDEF record");
    if (tnf === TNF_WELL_KNOWN && type === "U" && payload.length >= 1) {
      const prefix = URI_PREFIXES[payload[0]] ?? "";
      return prefix + payload.subarray(1).toString("utf8");
    }
    if (flags & 0x40) break; // ME: last record
    i = p + payloadLength;
  }
  return null;
}
