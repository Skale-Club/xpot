// The one money palette of the Visits charts and tiles (the Dashboard and
// Sales). Money is green: what we kept is emerald, what was billed is the
// cyan end of SUCCESS_GRADIENT, so the same revenue never shows in indigo on
// one screen and sky on another. Counts that are not money stay neutral.

export const MONEY_CHART = {
  /** Billed / revenue. */
  revenue: { stroke: "#22d3ee", fill: "#06b6d4", swatch: "bg-cyan-400" },
  /** Kept / profit. */
  profit: { stroke: "#34d399", fill: "#10b981", swatch: "bg-emerald-400" },
} as const;
