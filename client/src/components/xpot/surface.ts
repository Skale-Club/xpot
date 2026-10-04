// Shared surface styles for Xpot's dark glass look. Screens used to redefine
// these objects locally; import them from here instead.

/** The standard card: faint white fill with a hairline border. */
export const GLASS = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
} as const;

/** GLASS with a drop shadow, for cards that float over the page (check-in). */
export const GLASS_RAISED = {
  ...GLASS,
  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
} as const;

/** Primary action fill. */
export const BRAND_GRADIENT = "linear-gradient(135deg, #3b82f6, #6366f1)";

/** Page background behind every shell (app, tags, settings, admin). */
export const PAGE_GRADIENT = "linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%)";
