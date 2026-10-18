// Distribution (Hand out, Stuscle orders, Kits, Take back): the view names in the URL, the code list a station
// builds, and the message key for every reason a code is refused. Pure, unit-tested (tests/admin-tags-distribution.test.ts).

import type { HandOutBlocker, ReceiveBlocker, SellBlocker, TakeBackBlocker } from "@shared/tagDistribution";
import type { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";

type FlowKey = keyof (typeof adminTagsFlowMessages)["en"];

/** Sub-views of /admin/tags/kits, kept in `?view=`. */
export const DISTRIBUTION_VIEWS = ["handout", "orders", "kits", "returns"] as const;
export type DistributionView = (typeof DISTRIBUTION_VIEWS)[number];

export function distributionView(value: string | null | undefined): DistributionView {
  return (DISTRIBUTION_VIEWS as readonly string[]).includes(value ?? "") ? (value as DistributionView) : "handout";
}

/** Where Hand out opens for a batch (Batch detail › Hand out). */
export function handOutHref(batchId?: string): string {
  return batchId ? `/kits?view=handout&batch=${encodeURIComponent(batchId)}` : "/kits?view=handout";
}

export const HAND_OUT_REASON_KEYS = {
  unknown: "reasonUnknown",
  duplicate: "reasonDuplicate",
  sold: "reasonSold",
  with_reseller: "reasonWithReseller",
  not_received: "reasonNotReceived",
  damaged: "reasonDamaged",
  not_in_stock: "reasonNotInStock",
  set_up: "reasonSetUpHandOut",
} as const satisfies Record<HandOutBlocker, FlowKey>;

export const TAKE_BACK_REASON_KEYS = {
  unknown: "reasonUnknown",
  duplicate: "reasonDuplicate",
  sold: "reasonSoldTakeBack",
  not_with_reseller: "reasonNotWithReseller",
  set_up: "reasonSetUpTakeBack",
  not_in_stock: "reasonNotInStockTakeBack",
} as const satisfies Record<TakeBackBlocker, FlowKey>;

export const RECEIVE_BLOCKER_KEYS = {
  blocked: "receiveBlocked",
  inactive: "receiveInactive",
  tags_off: "receiveTagsOff",
} as const satisfies Record<ReceiveBlocker, FlowKey>;

export const SELL_BLOCKER_KEYS = {
  blocked: "sellBlocked",
  tags_off: "sellTagsOff",
  cost_rule: "sellNoCostRule",
  wholesale_code: "sellNoWholesaleCode",
} as const satisfies Record<SellBlocker, FlowKey>;

/** The message key for a refused code; null for an accepted one or a reason this screen does not know. */
export function reasonKey(kind: "handOut" | "takeBack", reason: string | null): FlowKey | null {
  if (!reason) return null;
  const map: Record<string, FlowKey> = kind === "handOut" ? HAND_OUT_REASON_KEYS : TAKE_BACK_REASON_KEYS;
  return map[reason] ?? "reasonUnknown";
}

/**
 * Adds codes read or typed to a station's list, in reading order, never twice. Returns the new list and what was
 * new vs. already on it (the station beeps differently and says "already on the list").
 */
export function addCodes(list: readonly string[], incoming: readonly string[]): { list: string[]; added: string[]; repeated: string[] } {
  const seen = new Set(list);
  const added: string[] = [];
  const repeated: string[] = [];
  for (const code of incoming) {
    if (seen.has(code)) repeated.push(code);
    else {
      seen.add(code);
      added.push(code);
    }
  }
  return { list: [...list, ...added], added, repeated };
}
