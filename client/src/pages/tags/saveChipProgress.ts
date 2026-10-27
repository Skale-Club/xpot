// Saving is separate from the physical operation: a network failure must only
// retry this callback, never write or permanently lock the chip a second time.
export const CHIP_SAVE_TIMEOUT_MS = 20_000;

export class ChipSaveTimeout extends Error {
  constructor() {
    super("Chip progress save timed out");
    this.name = "ChipSaveTimeout";
  }
}

export function saveChipProgress(save: (signal: AbortSignal) => Promise<void> | void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Cancelled", "AbortError"));
    const request = new AbortController();
    let settled = false;
    const finish = (outcome: { error: unknown } | { ok: true }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      request.abort();
      if ("error" in outcome) reject(outcome.error);
      else resolve();
    };
    const onAbort = () => finish({ error: new DOMException("Cancelled", "AbortError") });
    const timer = setTimeout(() => finish({ error: new ChipSaveTimeout() }), CHIP_SAVE_TIMEOUT_MS);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      Promise.resolve(save(request.signal)).then(() => finish({ ok: true }), (error) => finish({ error }));
    } catch (err) {
      finish({ error: err });
    }
  });
}
