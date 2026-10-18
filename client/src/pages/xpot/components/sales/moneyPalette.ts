// The one money palette of the Visits charts and tiles (the Dashboard and
// Sales). Money is green: what we kept is emerald, what was billed is the
// cyan end of SUCCESS_GRADIENT, so the same revenue never shows in indigo on
// one screen and sky on another. Money going out or not earned (acquisition
// cost, discounts) is the neutral slate "cost": never amber (that is "needs a
// step") nor rose/red (a problem). Counts that are not money stay neutral.

export const MONEY_CHART = {
  /** Billed / revenue. */
  revenue: { stroke: "#22d3ee", fill: "#06b6d4", swatch: "bg-cyan-400", text: "text-cyan-300" },
  /** Kept / profit. */
  profit: { stroke: "#34d399", fill: "#10b981", swatch: "bg-emerald-400", text: "text-emerald-300" },
  /** Out or not earned: acquisition cost, cost of goods, discounts. */
  cost: { stroke: "#94a3b8", fill: "#64748b", swatch: "bg-slate-400", text: "text-slate-300" },
} as const;

/**
 * Money still to come in. Outstanding (sold, not fully paid, not late) needs a
 * step, collecting it: amber, on the tile and the banner alike. Only an
 * overdue amount (a consignment settlement past its date) is red.
 */
export const MONEY_DUE_TONE = {
  outstanding: "amber",
  overdue: "red",
} as const;
