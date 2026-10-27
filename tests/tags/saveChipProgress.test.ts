import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHIP_SAVE_TIMEOUT_MS, ChipSaveTimeout, saveChipProgress } from "../../client/src/pages/tags/saveChipProgress";
import { pieceSend } from "../../client/src/components/piece/PieceContext";
import { tagsPost } from "../../client/src/pages/tags/lib";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("saving a completed chip operation", () => {
  it("times out and aborts the request even when saving never resolves", async () => {
    let request!: AbortSignal;
    const save = vi.fn((signal: AbortSignal) => {
      request = signal;
      return new Promise<void>(() => {});
    });
    const result = saveChipProgress(save, new AbortController().signal);
    const rejected = expect(result).rejects.toBeInstanceOf(ChipSaveTimeout);
    await vi.advanceTimersByTimeAsync(CHIP_SAVE_TIMEOUT_MS);
    await rejected;
    expect(request.aborted).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels when the sheet closes and ignores a late successful save", async () => {
    const ctrl = new AbortController();
    let complete!: () => void;
    let request!: AbortSignal;
    const result = saveChipProgress((signal) => {
      request = signal;
      return new Promise<void>((resolve) => { complete = resolve; });
    }, ctrl.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    ctrl.abort();
    complete();
    await rejected;
    expect(request.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves server errors so retry can save the same physical result", async () => {
    const failure = new Error("Session expired");
    const save = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    const ctrl = new AbortController();
    await expect(saveChipProgress(save, ctrl.signal)).rejects.toBe(failure);
    await expect(saveChipProgress(save, ctrl.signal)).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not save if the session was already closed", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const save = vi.fn();
    await expect(saveChipProgress(save, ctrl.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["piece", "direct"])("passes cancellation through the %s API to fetch", async (kind) => {
    let request!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      request = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        request.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
      });
    }));
    const ctrl = new AbortController();
    const result = saveChipProgress(async (signal) => {
      if (kind === "piece") await pieceSend("POST", "/api/xpot/tags/1/nfc-written", { method: "web_nfc" }, signal);
      else await tagsPost("/api/xpot/tag-direct-writes", { url: "https://example.com", method: "web_nfc" }, signal);
    }, ctrl.signal);
    const rejected = expect(result).rejects.toBeInstanceOf(ChipSaveTimeout);
    await vi.advanceTimersByTimeAsync(CHIP_SAVE_TIMEOUT_MS);
    await rejected;
    expect(request.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
