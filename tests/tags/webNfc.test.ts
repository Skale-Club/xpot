import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isWebNfcSupported, lockChip, NFC_TIMEOUT_MS, readBack, scanOnce, writeContent } from "../../client/src/pages/tags/webNfc";

const URL = "https://xpot.place/n/A7K3P9X2";
const pending = () => new Promise<void>(() => {});

class FakeReader {
  static instances: FakeReader[] = [];
  onreading: ((event: unknown) => void) | null = null;
  onreadingerror: ((event: unknown) => void) | null = null;
  scan = vi.fn(async (_options: { signal?: AbortSignal }) => {});
  write = vi.fn((_message: unknown, _options: { signal?: AbortSignal }) => pending());
  makeReadOnly = vi.fn((_options: { signal?: AbortSignal }) => pending());
  constructor() { FakeReader.instances.push(this); }
  read(value = URL, recordType = "url", mediaType?: string) {
    const bytes = new TextEncoder().encode(value);
    this.onreading?.({ serialNumber: "01:02:03", message: { records: [{ recordType, mediaType, data: new DataView(bytes.buffer) }] } });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeReader.instances = [];
  vi.stubGlobal("window", { NDEFReader: FakeReader, isSecureContext: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Android Web NFC sessions", () => {
  it("starts writing in the click's call stack and writes a URI record", async () => {
    const result = writeContent(URL, new AbortController().signal);
    const reader = FakeReader.instances[0];
    expect(reader.write).toHaveBeenCalledWith({ records: [{ recordType: "url", data: URL }] }, { overwrite: true, signal: expect.any(AbortSignal) });
    const rejected = expect(result).rejects.toMatchObject({ code: "nfcTimeout", silent: false });
    await vi.advanceTimersByTimeAsync(NFC_TIMEOUT_MS);
    await rejected;
    expect(reader.write.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["mailto:hello@example.com", "tel:+15551234567"])("preserves a %s URI", async (value) => {
    const ctrl = new AbortController();
    const result = writeContent(value, ctrl.signal);
    expect(FakeReader.instances[0].write.mock.calls[0][0]).toEqual({ records: [{ recordType: "url", data: value }] });
    const rejected = expect(result).rejects.toMatchObject({ code: "nfcCancelled" });
    ctrl.abort();
    await rejected;
  });

  it("writes contacts as vCard bytes", async () => {
    const value = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:José\r\nEND:VCARD";
    const ctrl = new AbortController();
    const result = writeContent(value, ctrl.signal);
    expect(FakeReader.instances[0].write.mock.calls[0][0]).toEqual({ records: [{ recordType: "mime", mediaType: "text/vcard", data: new TextEncoder().encode(value) }] });
    const rejected = expect(result).rejects.toMatchObject({ code: "nfcCancelled" });
    ctrl.abort();
    await rejected;
  });

  it("cancels immediately even if the native writer never settles", async () => {
    const ctrl = new AbortController();
    const result = writeContent(URL, ctrl.signal);
    const rejected = expect(result).rejects.toMatchObject({ code: "nfcCancelled", silent: true });
    ctrl.abort();
    await rejected;
    expect(FakeReader.instances[0].write.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a write that was already cancelled", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(writeContent(URL, ctrl.signal)).rejects.toMatchObject({ code: "nfcCancelled" });
    expect(FakeReader.instances).toHaveLength(0);
  });

  it.each([
    ["AbortError", "nfcInterrupted"],
    ["NotAllowedError", "nfcDenied"],
    ["NotSupportedError", "nfcUnsupported"],
    ["NetworkError", "nfcRemoved"],
  ])("reports native %s instead of leaving the UI waiting", async (name, code) => {
    class RejectingReader extends FakeReader {
      override write = vi.fn(async () => { throw new DOMException("NFC failed", name); });
    }
    vi.stubGlobal("window", { NDEFReader: RejectingReader, isSecureContext: true });
    await expect(writeContent(URL, new AbortController().signal)).rejects.toMatchObject({ code, silent: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a scan and clears both native event handlers", async () => {
    const result = scanOnce(new AbortController().signal);
    const reader = FakeReader.instances[0];
    const rejected = expect(result).rejects.toMatchObject({ code: "nfcTimeout" });
    await vi.advanceTimersByTimeAsync(NFC_TIMEOUT_MS);
    await rejected;
    expect(reader.scan.mock.calls[0][0].signal?.aborted).toBe(true);
    expect(reader.onreading).toBeNull();
    expect(reader.onreadingerror).toBeNull();
  });

  it("finishes a read and releases the radio for the next operation", async () => {
    const result = scanOnce(new AbortController().signal);
    const reader = FakeReader.instances[0];
    reader.read();
    await expect(result).resolves.toEqual({ kind: "url", url: URL, serialNumber: "01:02:03" });
    expect(reader.scan.mock.calls[0][0].signal?.aborted).toBe(true);
    expect(reader.onreading).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a chip read error and stops scanning", async () => {
    const result = scanOnce(new AbortController().signal);
    const reader = FakeReader.instances[0];
    reader.onreadingerror?.({});
    await expect(result).rejects.toMatchObject({ code: "nfcUnreadable" });
    expect(reader.scan.mock.calls[0][0].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows verification to be retried after a timeout without writing again", async () => {
    class WritingReader extends FakeReader {
      override write = vi.fn(async () => {});
    }
    vi.stubGlobal("window", { NDEFReader: WritingReader, isSecureContext: true });
    const ctrl = new AbortController();
    await writeContent(URL, ctrl.signal);
    const firstRead = readBack(ctrl.signal);
    const rejected = expect(firstRead).rejects.toMatchObject({ code: "nfcTimeout" });
    await vi.advanceTimersByTimeAsync(NFC_TIMEOUT_MS);
    await rejected;
    // Timeout cancels only that native session, not the caller's controller.
    expect(ctrl.signal.aborted).toBe(false);
    const retry = readBack(ctrl.signal);
    FakeReader.instances[2].read();
    await expect(retry).resolves.toBe(URL);
    expect(FakeReader.instances.flatMap((r) => r.write.mock.calls)).toHaveLength(1);
  });

  it("returns the actual mismatched content for verification", async () => {
    const result = readBack(new AbortController().signal);
    FakeReader.instances[0].read("https://example.com/wrong-chip");
    await expect(result).resolves.toBe("https://example.com/wrong-chip");
  });

  it("reads vCards back as text", async () => {
    const result = readBack(new AbortController().signal);
    FakeReader.instances[0].read("BEGIN:VCARD\r\nFN:José\r\nEND:VCARD", "mime", "text/vcard");
    await expect(result).resolves.toBe("BEGIN:VCARD\r\nFN:José\r\nEND:VCARD");
  });

  it("bounds the wait for a lock as well", async () => {
    const result = lockChip(new AbortController().signal);
    const rejected = expect(result).rejects.toMatchObject({ code: "nfcTimeout" });
    await vi.advanceTimersByTimeAsync(NFC_TIMEOUT_MS);
    await rejected;
    expect(FakeReader.instances[0].makeReadOnly.mock.calls[0][0].signal?.aborted).toBe(true);
  });

  it("rejects insecure contexts before starting the hardware", async () => {
    vi.stubGlobal("window", { NDEFReader: FakeReader, isSecureContext: false });
    await expect(writeContent(URL, new AbortController().signal)).rejects.toMatchObject({ code: "nfcInsecure" });
    expect(FakeReader.instances).toHaveLength(0);
  });

  it("handles unavailable Web NFC without crashing outside the browser", async () => {
    vi.stubGlobal("window", undefined);
    expect(isWebNfcSupported()).toBe(false);
    await expect(writeContent(URL, new AbortController().signal)).rejects.toMatchObject({ code: "nfcNoBrowser" });
  });
});
