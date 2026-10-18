// Shared surface styles for Xpot's dark glass look. Screens used to redefine
// these objects locally; import them from here instead. docs/UI_KIT.md lists
// every token and when to use it.
//
// Colour rules for the whole app:
//   brand blue (BRAND_GRADIENT, --primary) = the primary action and focus
//   green (SUCCESS_GRADIENT)               = money and success only
//   violet (MODULE_ACCENT.tags)            = the Tags module only
//   amber                                  = needs a step
//   red (DANGER)                           = destructive / broken
//
// This file has no imports on purpose: tailwind.config.ts reads RADIUS and
// OPACITY_STEPS from it.

/** The standard card: faint white fill with a hairline border. */
export const GLASS = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
} as const;

/** GLASS as Tailwind classes, for elements styled with className. */
export const GLASS_CLASS = "border border-white/[0.09] bg-white/[0.04]";

/**
 * Quieter than GLASS, for containers that hold other cards or rows: the filter
 * bar, dashboard sections, tables, KPI tiles.
 */
export const GLASS_SUBTLE = {
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,255,255,0.07)",
} as const;

/** GLASS_SUBTLE as Tailwind classes. */
export const GLASS_SUBTLE_CLASS = "border border-white/[0.07] bg-white/[0.025]";

/** GLASS with a drop shadow, for cards that float over the page (check-in). */
export const GLASS_RAISED = {
  ...GLASS,
  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
} as const;

/** Primary action fill. */
export const BRAND_GRADIENT = "linear-gradient(135deg, #3b82f6, #6366f1)";

/** Money and success actions ("New sale", "Record payment"). Green means money; never use it for anything else. */
export const SUCCESS_GRADIENT = "linear-gradient(135deg, #10b981, #06b6d4)";

/** Tinted red surface for error boxes and the danger zone of a form. */
export const DANGER_SURFACE = {
  background: "rgba(239,68,68,0.06)",
  border: "1px solid rgba(239,68,68,0.2)",
} as const;

/** Page background behind every shell (app, tags, settings, admin). */
export const PAGE_GRADIENT = "linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%)";

/** The solid colour PAGE_GRADIENT starts from: boot screen, theme-color, full-page loaders. */
export const PAGE_BASE = "#060912";

/**
 * The one surface for dialogs, alert dialogs, sheets, popovers and menus.
 * ui/dialog.tsx and ui/alert-dialog.tsx already use it; don't override it.
 */
export const SURFACE_MODAL = "#0d1322";

/** SURFACE_MODAL as Tailwind classes (fill + hairline border). */
export const SURFACE_MODAL_CLASS = "border border-white/10 bg-[#0d1322]";

/** The one backdrop behind dialogs and sheets. */
export const OVERLAY_CLASS = "bg-black/60 backdrop-blur-sm";

/**
 * Radius scale, also registered in tailwind.config.ts as rounded-control,
 * rounded-card and rounded-sheet. Each equals a stock Tailwind step, so code
 * merged with cn() (ui primitives that accept a className) can use the stock
 * name and still be overridden: control = rounded-xl, card = rounded-2xl,
 * sheet = rounded-3xl.
 */
export const RADIUS = {
  /** Inputs, selects, buttons, chips with text. */
  control: "0.75rem",
  /** Cards, sections, tables, empty states. */
  card: "1rem",
  /** Dialogs, bottom sheets, side panes. */
  sheet: "1.5rem",
} as const;

/** Alpha steps used by the screens that Tailwind 3 does not generate by default (/8, /12, /32…). */
export const OPACITY_STEPS = {
  8: "0.08",
  12: "0.12",
  28: "0.28",
  32: "0.32",
  34: "0.34",
  38: "0.38",
  78: "0.78",
  82: "0.82",
} as const;

/** Small uppercase label above a title or a group ("TODAY", "CUSTOMER"). */
export const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40";

/** Table header cells. */
export const TABLE_HEAD = "text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40";

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

export type ModuleAccent = keyof typeof MODULE_ACCENT;

/** Solid primary fill per module: Visits and account pages use the brand gradient, Tags its violet one. */
export const ACCENT_GRADIENT: Record<ModuleAccent, string> = {
  visits: BRAND_GRADIENT,
  tags: "linear-gradient(135deg, #8b5cf6, #c026d3)",
  account: BRAND_GRADIENT,
};

/**
 * Class strings for "this one is selected" in one-of-N controls (Tabs,
 * Segmented, the command palette), per module. Static strings so Tailwind
 * sees every class.
 */
export const ACCENT_SELECTED: Record<ModuleAccent, { fill: string; icon: string; row: string }> = {
  visits: {
    fill: "bg-gradient-to-br from-blue-500/25 to-indigo-500/20 text-white shadow-[inset_0_0_0_1px_rgba(96,165,250,0.25)]",
    icon: "text-blue-300",
    row: "bg-blue-500/15",
  },
  tags: {
    fill: "bg-gradient-to-br from-violet-500/30 to-fuchsia-600/20 text-white shadow-[inset_0_0_0_1px_rgba(167,139,250,0.3)]",
    icon: "text-violet-300",
    row: "bg-violet-500/15",
  },
  account: {
    fill: "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]",
    icon: "text-slate-200",
    row: "bg-white/10",
  },
};
