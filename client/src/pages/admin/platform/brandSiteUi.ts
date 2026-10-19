// Brand & public site: which tab a URL opens, kept apart so it is unit-tested.
// /admin/branding opens Identity, /admin/branding?tab=app the installed app,
// /admin/landing the Landing page editor (both old URLs keep working).

export const BRAND_SITE_TABS = ["identity", "app", "landing"] as const;
export type BrandSiteTab = (typeof BRAND_SITE_TABS)[number];

export function brandSiteTabFrom(path: string, search = ""): BrandSiteTab {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "");
  if (clean === "/admin/landing") return "landing";
  const tab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab");
  return tab === "app" ? "app" : "identity";
}

/** Black or white, whichever reads on a #rrggbb ground (the opening-screen preview). */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const [r, g, b] = m.slice(1).map((part) => parseInt(part, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#0b1020" : "#ffffff";
}

export function brandSiteTabHref(tab: BrandSiteTab): string {
  if (tab === "landing") return "/admin/landing";
  return tab === "app" ? "/admin/branding?tab=app" : "/admin/branding";
}
