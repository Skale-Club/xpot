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

/**
 * Each part of the app has its own accent so you always know where you are:
 * Visits blue (the brand), Tags violet, the account pages neutral. Tags is not
 * green on purpose: green already means money, "live" and success all over the
 * app (Visits' "New sale" button is emerald), so a green module would blur
 * back into Visits. Used by the sidebar, the module switch and the
 * top bar; keep the solid colours in step with the gradients.
 */
export const MODULE_ACCENT = {
  visits: {
    solid: "#3b82f6",
    soft: "linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(99,102,241,0.22) 100%)",
    strong: "linear-gradient(135deg, rgba(59,130,246,0.35) 0%, rgba(99,102,241,0.35) 100%)",
    text: "text-blue-300",
  },
  tags: {
    solid: "#8b5cf6",
    soft: "linear-gradient(135deg, rgba(139,92,246,0.24) 0%, rgba(192,38,211,0.20) 100%)",
    strong: "linear-gradient(135deg, rgba(139,92,246,0.40) 0%, rgba(192,38,211,0.34) 100%)",
    text: "text-violet-300",
  },
  account: {
    solid: "#94a3b8",
    soft: "linear-gradient(135deg, rgba(148,163,184,0.16) 0%, rgba(148,163,184,0.10) 100%)",
    strong: "linear-gradient(135deg, rgba(148,163,184,0.26) 0%, rgba(148,163,184,0.18) 100%)",
    text: "text-slate-200",
  },
} as const;
