// What the settle dialog may do with what the rep typed in "How many are left
// on the shelf?". The count starts empty: an untouched dialog used to read it
// as 0, which billed everything on record as sold. Kept free of app imports so
// the tests can load it.

/** "" and anything that is not a number are no count yet; otherwise a whole number, never negative. */
export function parseSettleCount(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

/**
 * - "empty": nothing counted yet, so no amount is shown and Settle is not offered.
 * - "over": more than the agreement holds; an adjustment comes first.
 * - "ready": a count, including 0 (a shelf found empty is a real count).
 */
export function settleCountState(onHand: number, counted: number | null): "empty" | "over" | "ready" {
  if (counted === null) return "empty";
  return counted > onHand ? "over" : "ready";
}
