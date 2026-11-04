import { can, type Profile } from "@shared/profiles";
import type { XpotModule } from "@shared/modules";

// The three places the app is divided into (docs/PANELS_EXECUTION_PLAN.md): Admin (the platform and every company),
// Production (the pieces to print and where they are) and Visits (the default app: the Visits | Tags modules). Which
// panel a path belongs to is decided here, once; the URLs themselves never change. Pure, unit-tested
// (tests/panels.test.ts). Hiding a panel is never the boundary: the server still authorizes every request.

export type Panel = "admin" | "production" | "visits";

/** The panels a person has, in the order the selector lists them: the default app first. */
export function panelsOf(profile: Profile | null | undefined, modules: readonly XpotModule[]): Panel[] {
  if (!profile) return [];
  const panels: Panel[] = [];
  // Visits is everyone's, as long as they have a module to work in (a partner may have none).
  if (modules.length > 0) panels.push("visits");
  if (can(profile, "produce")) panels.push("production");
  if (can(profile, "managePlatform")) panels.push("admin");
  return panels;
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The panel a path belongs to. `path` may carry a query, which never changes the answer: Distribution (/admin/tags/kits)
 * is Production's whatever its view, Stuscle orders included. A path the table does not list falls in Admin: the
 * platform reaches it there and nobody else does, so it never disappears in silence.
 *
 * An owner has no panel of their own: the screens of their team (/admin, /organizations and what they reach under
 * /admin) are Visits' Company group, so every management path is told as Visits for them. What they do not reach stays
 * denied by the screen itself.
 */
export function panelOfPath(path: string, profile?: Profile | null): Panel {
  const [target] = path.split("#", 1);
  const [pathname] = target.split("?", 1);
  const management = under(pathname, "/admin") || under(pathname, "/organizations");
  if (!management) return "visits";
  if (profile === "owner") return "visits";
  if (under(pathname, "/organizations")) return profile === "partner" ? "production" : "admin";
  const tags = /^\/admin\/tags(?:\/([^/]+))?/.exec(pathname);
  if (tags) {
    const tab = tags[1];
    // The shop and the History are the platform's controls; the old per-reseller report moved to People.
    if (tab === "shop" || tab === "journey" || tab === "team") return "admin";
    return "production";
  }
  return "admin";
}

/** Where a panel starts ("Today"). Visits has the modules' own entry points (moduleEntryPath), this is only its default. */
export function panelHome(panel: Panel, _profile?: Profile | null): string {
  if (panel === "admin") return "/admin";
  if (panel === "production") return "/admin/tags/production";
  return "/dashboard";
}
