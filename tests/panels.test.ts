// The three panels (client/src/components/xpot/panels.ts, docs/PANELS_EXECUTION_PLAN.md sections 3.1 and 3.2): which
// panels each profile has, which panel a path belongs to, and where a panel starts. The shell reads this one table, so a
// wrong answer puts a screen under the wrong menu or hides a panel from someone who has it.

import { describe, expect, it } from "vitest";
import { panelHome, panelOfPath, panelsOf, type Panel } from "../client/src/components/xpot/panels";
import type { Profile } from "../shared/profiles";

const both = ["visits", "tags"] as const;

describe("panelsOf", () => {
  it("gives the platform all three, Visits first (the default app)", () => {
    expect(panelsOf("platform", both)).toEqual(["visits", "production", "admin"]);
  });

  it("gives a partner its production, and Visits when it has a module to work in", () => {
    expect(panelsOf("partner", both)).toEqual(["visits", "production"]);
    expect(panelsOf("partner", ["tags"])).toEqual(["visits", "production"]);
    expect(panelsOf("partner", [])).toEqual(["production"]);
  });

  it("gives an owner and a member Visits only: no Production, no Admin", () => {
    expect(panelsOf("owner", both)).toEqual(["visits"]);
    expect(panelsOf("member", ["visits"])).toEqual(["visits"]);
    expect(panelsOf("member", [])).toEqual([]);
  });

  it("gives nobody without a profile any panel", () => {
    expect(panelsOf(null, both)).toEqual([]);
    expect(panelsOf(undefined, both)).toEqual([]);
  });
});

// [path, platform, partner, owner, member]: the table of section 3.2, profile by profile.
const TABLE: Array<[string, Panel, Panel, Panel, Panel]> = [
  // The work screens are Visits' for everyone.
  ["/dashboard", "visits", "visits", "visits", "visits"],
  ["/route", "visits", "visits", "visits", "visits"],
  ["/leads/4", "visits", "visits", "visits", "visits"],
  ["/tasks", "visits", "visits", "visits", "visits"],
  ["/sales/stock/3", "visits", "visits", "visits", "visits"],
  ["/tags", "visits", "visits", "visits", "visits"],
  ["/tags/pieces/ABC", "visits", "visits", "visits", "visits"],
  ["/settings", "visits", "visits", "visits", "visits"],
  // Admin: the platform's, every company. (An owner has no panel: all of it is told as Visits, their Company group, and
  // what they do not reach the screen itself denies.)
  ["/admin", "admin", "admin", "visits", "admin"],
  ["/organizations", "admin", "production", "visits", "admin"],
  ["/admin/reps/12", "admin", "admin", "visits", "admin"],
  ["/admin/work/leads", "admin", "admin", "visits", "admin"],
  ["/admin/overview", "admin", "admin", "visits", "admin"],
  ["/admin/products", "admin", "admin", "visits", "admin"],
  ["/admin/integrations", "admin", "admin", "visits", "admin"],
  ["/admin/xphere", "admin", "admin", "visits", "admin"],
  ["/admin/branding", "admin", "admin", "visits", "admin"],
  ["/admin/landing", "admin", "admin", "visits", "admin"],
  ["/admin/health", "admin", "admin", "visits", "admin"],
  ["/admin/settings", "admin", "admin", "visits", "admin"],
  ["/admin/tags/shop", "admin", "admin", "visits", "admin"],
  ["/admin/tags/journey", "admin", "admin", "visits", "admin"],
  // Tasks and Sales of every company have no menu item, and are still Admin's.
  ["/admin/work/tasks", "admin", "admin", "visits", "admin"],
  ["/admin/work/sales/stock/3", "admin", "admin", "visits", "admin"],
  // Production: the pieces; an organization's workspace is a partner's operation there.
  ["/admin/tags", "production", "production", "visits", "production"],
  ["/admin/tags/production", "production", "production", "visits", "production"],
  ["/admin/tags/production/printing", "production", "production", "visits", "production"],
  ["/admin/tags/production/models/plate", "production", "production", "visits", "production"],
  ["/admin/tags/production/jobs/9", "production", "production", "visits", "production"],
  ["/admin/tags/batches/12", "production", "production", "visits", "production"],
  ["/admin/tags/provisioners", "production", "production", "visits", "production"],
  ["/admin/tags/pieces/ABC", "production", "production", "visits", "production"],
  ["/admin/tags/kits", "production", "production", "visits", "production"],
  ["/admin/tags/overview/chipPending", "production", "production", "visits", "production"],
  ["/organizations/7?tab=team", "admin", "production", "visits", "admin"],
  ["/organizations/7/people/3", "admin", "production", "visits", "admin"],
];

describe("panelOfPath", () => {
  const profiles: Profile[] = ["platform", "partner", "owner", "member"];
  for (const [path, ...expected] of TABLE) {
    it(`${path}`, () => {
      profiles.forEach((profile, index) => expect(panelOfPath(path, profile), `${profile}`).toBe(expected[index]));
    });
  }

  it("keeps Distribution in Production whatever its view, Stuscle orders (?view=orders) included", () => {
    for (const query of ["", "?view=orders", "?view=handout", "?view=orders&org=3"]) {
      expect(panelOfPath(`/admin/tags/kits${query}`, "platform"), query).toBe("production");
      expect(panelOfPath(`/admin/tags/kits${query}`, "partner"), query).toBe("production");
      expect(panelOfPath(`/admin/tags/kits${query}`, "owner"), query).toBe("visits");
    }
    expect(panelOfPath("/admin/tags/kits/7?view=orders#top", "platform")).toBe("production");
  });

  it("ignores a hash, and does not mistake a prefix for a section", () => {
    expect(panelOfPath("/admin/tags/production#top", "platform")).toBe("production");
    expect(panelOfPath("/admin-other", "platform")).toBe("visits");
    expect(panelOfPath("/organizations-old", "platform")).toBe("visits");
    expect(panelOfPath("/tagsx", "platform")).toBe("visits");
  });

  it("puts an unknown management path in Admin, where only the platform reaches it", () => {
    expect(panelOfPath("/admin/somewhere-new", "platform")).toBe("admin");
    expect(panelOfPath("/admin/somewhere-new", "partner")).toBe("admin");
    expect(panelsOf("partner", both)).not.toContain("admin");
  });

  it("agrees with the panels each profile has: no profile is sent to a panel it lacks", () => {
    for (const [path, platform, partner] of TABLE) {
      expect(panelsOf("platform", both)).toContain(platform);
      // A partner is told Admin for the platform's paths on purpose: that panel is not theirs, so the screen denies them.
      if (partner !== "admin") expect(panelsOf("partner", both), path).toContain(partner);
    }
  });

  it("answers without a profile (the app has not loaded who the person is): the table of the platform", () => {
    expect(panelOfPath("/dashboard")).toBe("visits");
    expect(panelOfPath("/admin", null)).toBe("admin");
  });
});

describe("panelHome", () => {
  it("starts Admin on Today, Production on its board and Visits on the dashboard", () => {
    expect(panelHome("admin", "platform")).toBe("/admin");
    expect(panelHome("production", "platform")).toBe("/admin/tags/production");
    expect(panelHome("production", "partner")).toBe("/admin/tags/production");
    expect(panelHome("visits", "member")).toBe("/dashboard");
  });

  it("starts every panel on a path that belongs to it (for a partner, a production path)", () => {
    expect(panelOfPath(panelHome("admin", "platform"), "platform")).toBe("admin");
    expect(panelOfPath(panelHome("production", "platform"), "platform")).toBe("production");
    expect(panelOfPath(panelHome("production", "partner"), "partner")).toBe("production");
    expect(panelOfPath(panelHome("visits", "partner"), "partner")).toBe("visits");
  });
});
