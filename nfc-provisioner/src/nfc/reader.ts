// Reader abstraction. Hardware-specific code lives behind ReaderAdapter so a
// different PC/SC reader (or a future non-PC/SC one) replaces only this file.

import { EventEmitter } from "events";
import { TagError, type PageIO } from "./type2";

export interface TagPresence {
  /** Chip UID as hex, when the reader reports it. Never used as identity. */
  uid: string | null;
  standard: string | null;
}

export interface ReaderAdapter extends EventEmitter {
  start(): void;
  stop(): void;
  /** Reader names currently attached (SAM slots excluded). */
  readers(): string[];
  currentTag(): TagPresence | null;
  /** Page I/O for the tag on the reader; throws tag_removed if none. */
  io(): PageIO;
  on(event: "readers", listener: (names: string[]) => void): this;
  on(event: "tag", listener: (tag: TagPresence) => void): this;
  on(event: "tag-removed", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
}

// ─── PC/SC (ACR122U and other PC/SC NFC readers) ─────────────────────────────

interface PcscReader extends EventEmitter {
  reader: { name: string };
  autoProcessing: boolean;
  card: { uid?: string; standard?: string; type?: string } | null;
  read(block: number, length: number, blockSize?: number, packetSize?: number): Promise<Buffer>;
  write(block: number, data: Buffer, blockSize?: number): Promise<void>;
  close(): void;
}

export class PcscReaderAdapter extends EventEmitter implements ReaderAdapter {
  private nfc: (EventEmitter & { close(): void }) | null = null;
  private attached = new Map<string, PcscReader>();
  private tagReader: PcscReader | null = null;
  private tag: TagPresence | null = null;

  start() {
    // Loaded lazily: the native module is only needed with real hardware.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NFC } = require("nfc-pcsc") as { NFC: new (logger?: unknown) => EventEmitter & { close(): void } };
    const silent = { log() {}, debug() {}, info() {}, warn() {}, error() {} };
    this.nfc = new NFC(silent);
    this.nfc.on("reader", (reader: PcscReader) => {
      const name = reader.reader.name;
      // ACR1252U and similar expose a SAM slot as a second "reader".
      if (/\bSAM\b/i.test(name)) return;
      reader.autoProcessing = true;
      this.attached.set(name, reader);
      this.emit("readers", this.readers());
      reader.on("card", (card: { uid?: string; standard?: string; type?: string }) => {
        this.tagReader = reader;
        this.tag = { uid: card.uid ?? null, standard: card.standard ?? card.type ?? null };
        this.emit("tag", this.tag);
      });
      reader.on("card.off", () => {
        if (this.tagReader === reader) {
          this.tagReader = null;
          this.tag = null;
          this.emit("tag-removed");
        }
      });
      reader.on("error", (err: Error) => this.emit("error", err));
      reader.on("end", () => {
        this.attached.delete(name);
        if (this.tagReader === reader) {
          this.tagReader = null;
          this.tag = null;
          this.emit("tag-removed");
        }
        this.emit("readers", this.readers());
      });
    });
    this.nfc.on("error", (err: Error) => this.emit("error", err));
  }

  stop() {
    for (const r of Array.from(this.attached.values())) r.close();
    this.attached.clear();
    this.nfc?.close();
    this.nfc = null;
  }

  readers() {
    return Array.from(this.attached.keys());
  }

  currentTag() {
    return this.tag;
  }

  io(): PageIO {
    const reader = this.tagReader;
    if (!reader || !reader.card) throw new TagError("tag_removed", "No tag on the reader");
    const guard = <T>(op: () => Promise<T>) =>
      op().catch((err: Error) => {
        if (!this.tagReader || !this.tagReader.card) throw new TagError("tag_removed", "Tag was removed");
        throw new TagError("write_failed", err.message || "Reader command failed");
      });
    return {
      // READ BINARY returns up to 16 bytes (4 pages) per APDU.
      readPages: (page, count) => guard(() => reader.read(page, count * 4, 4, 16)),
      writePage: (page, data) => guard(() => reader.write(page, data, 4)),
    };
  }
}

// ─── Simulator (tests, demos, development without hardware) ─────────────────

/** Fresh NTAG21x memory: CC set, empty NDEF TLV, as tags ship from the factory. */
export function blankNtagMemory(dataAreaBytes = 144, opts: { readOnly?: boolean; formatted?: boolean } = {}): Buffer {
  const mem = Buffer.alloc(16 + dataAreaBytes + 4 * 5);
  Buffer.from([0x04, 0x11, 0x22, 0x88, 0x33, 0x44, 0x55, 0x66, 0x77, 0x48, 0x00, 0x00]).copy(mem, 0);
  if (opts.formatted !== false) {
    Buffer.from([0xe1, 0x10, dataAreaBytes / 8, opts.readOnly ? 0x0f : 0x00]).copy(mem, 12);
    Buffer.from([0x03, 0x00, 0xfe, 0x00]).copy(mem, 16);
  }
  return mem;
}

export class SimulatedReaderAdapter extends EventEmitter implements ReaderAdapter {
  memory: Buffer | null = null;
  writes = 0;
  /** Remove the tag after this many page writes (simulates lifting it mid-write). */
  removeAfterWrites: number | null = null;
  /** Corrupt the data written to this page (simulates a bad write). */
  corruptPage: number | null = null;
  private names: string[];

  constructor(readerNames: string[] = ["Simulated ACR122U"]) {
    super();
    this.names = readerNames;
  }

  start() {
    setImmediate(() => this.emit("readers", this.readers()));
  }

  stop() {}

  readers() {
    return [...this.names];
  }

  setReaders(names: string[]) {
    this.names = names;
    this.emit("readers", this.readers());
  }

  placeTag(memory: Buffer = blankNtagMemory()) {
    this.memory = memory;
    this.writes = 0;
    this.emit("tag", this.currentTag());
  }

  removeTag() {
    this.memory = null;
    this.emit("tag-removed");
  }

  currentTag(): TagPresence | null {
    return this.memory ? { uid: this.memory.subarray(0, 7).toString("hex"), standard: "TAG_ISO_14443_3" } : null;
  }

  io(): PageIO {
    if (!this.memory) throw new TagError("tag_removed", "No tag on the reader");
    return {
      readPages: async (page, count) => {
        if (!this.memory) throw new TagError("tag_removed", "Tag was removed");
        const out = Buffer.alloc(count * 4);
        this.memory.copy(out, 0, page * 4, Math.min(this.memory.length, (page + count) * 4));
        return out;
      },
      writePage: async (page, data) => {
        if (!this.memory) throw new TagError("tag_removed", "Tag was removed");
        if (data.length !== 4) throw new TagError("write_failed", "Page writes are 4 bytes");
        const ccAccess = this.memory[15] & 0x0f;
        if (page >= 4 && ccAccess !== 0x00) throw new TagError("write_failed", "Write rejected by tag (read-only)");
        const bytes = Buffer.from(data);
        if (this.corruptPage === page) bytes[0] ^= 0xff;
        bytes.copy(this.memory, page * 4);
        this.writes += 1;
        if (this.removeAfterWrites !== null && this.writes >= this.removeAfterWrites) {
          this.removeTag();
        }
      },
    };
  }
}
