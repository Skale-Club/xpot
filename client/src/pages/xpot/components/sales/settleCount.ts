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

/** How the shop paid for what it sold, as the rep tapped it. Nothing is paid until a choice is made. */
export type SettleChoice = "paid" | "later" | "partial";
/** The ways to pay the settle dialog offers; "other" covers the rest. */
export const SETTLE_METHODS = ["cash", "card", "other"] as const;
export type SettleMethod = (typeof SETTLE_METHODS)[number];

/**
 * What a settlement records for a choice, or null while the choice is not complete. Money that did not arrive is never
 * recorded as received: "paid" needs the way it was paid, "later" records nothing received, and "partial" needs the
 * amount (more than nothing, less than the bill) and the way.
 */
export function settlePayment(
  choice: SettleChoice | null,
  method: SettleMethod | "",
  partialCents: number,
  amountCents: number,
): { paymentStatus: "paid" | "unpaid" | "partial"; paymentMethod: SettleMethod | null; paidCents?: number } | null {
  if (choice === "later") return { paymentStatus: "unpaid", paymentMethod: null };
  if (!choice || !method) return null;
  if (choice === "paid") return { paymentStatus: "paid", paymentMethod: method };
  if (partialCents <= 0 || partialCents >= amountCents) return null;
  return { paymentStatus: "partial", paymentMethod: method, paidCents: partialCents };
}

/** The difference to correct when the shelf holds more than the record: +3 for a count of 21 against 18. */
export function overCountDelta(onHand: number, counted: number): number {
  return Math.max(0, counted - onHand);
}

/**
 * Taking stock back starts empty, like the count: an untouched dialog must not pick up everything on record.
 * - "empty": nothing typed yet, so nothing can be saved.
 * - "over": more than the record holds.
 * - "some": part of it; the agreement stays open.
 * - "all": everything on record, the one case that may also end the agreement.
 */
export function takeBackState(onHand: number, quantity: number | null): "empty" | "over" | "some" | "all" {
  if (quantity === null || quantity < 1) return "empty";
  if (quantity > onHand) return "over";
  return quantity === onHand ? "all" : "some";
}
