// Pure rules behind People, Organizations and the Visits overview.

import { describe, expect, it } from "vitest";
import { isPersonalOrganization } from "../shared/organizations";
import { inTeamTable, teamActivitySince, teamPeriodSince } from "../shared/teamActivity";

describe("isPersonalOrganization", () => {
  it("is the automatic rep-<id> workspace while only that person (or nobody) is in it", () => {
    expect(isPersonalOrganization({ slug: "rep-12", memberCount: 1, soleMemberRepId: 12 })).toBe(true);
    expect(isPersonalOrganization({ slug: "rep-12", memberCount: 0 })).toBe(true);
    expect(isPersonalOrganization({ slug: "rep-12", memberCount: 2, soleMemberRepId: null })).toBe(false);
    // Someone else alone in it: it was reorganised, so it is shown.
    expect(isPersonalOrganization({ slug: "rep-12", memberCount: 1, soleMemberRepId: 7 })).toBe(false);
    expect(isPersonalOrganization({ slug: "north-a1b2c3", memberCount: 1, soleMemberRepId: 12 })).toBe(false);
    expect(isPersonalOrganization({ slug: "xpot-company", memberCount: 0 })).toBe(false);
  });
});

describe("teamActivitySince", () => {
  const now = new Date("2026-10-18T15:00:00Z");
  it("takes the viewer's start of period, else N days, else 30 days", () => {
    expect(teamActivitySince({ since: "2026-10-18T03:00:00.000Z" }, now)?.toISOString()).toBe("2026-10-18T03:00:00.000Z");
    expect(teamActivitySince({ days: "7" }, now)?.toISOString()).toBe("2026-10-11T15:00:00.000Z");
    expect(teamActivitySince({}, now)?.toISOString()).toBe("2026-09-18T15:00:00.000Z");
  });
  it("refuses what is not a period", () => {
    expect(teamActivitySince({ since: "soon" }, now)).toBeNull();
    expect(teamActivitySince({ since: "2026-10-19T00:00:00Z" }, now)).toBeNull();
    expect(teamActivitySince({ since: "2024-01-01T00:00:00Z" }, now)).toBeNull();
    expect(teamActivitySince({ days: "0" }, now)).toBeNull();
    expect(teamActivitySince({ days: "1.5" }, now)).toBeNull();
    expect(teamActivitySince({ days: "401" }, now)).toBeNull();
  });
});

describe("teamPeriodSince", () => {
  it("starts today at the viewer's midnight and the others N days back", () => {
    const now = new Date(2026, 9, 18, 15, 30);
    expect(teamPeriodSince("today", now).getTime()).toBe(new Date(2026, 9, 18).getTime());
    expect(now.getTime() - teamPeriodSince("7", now).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(now.getTime() - teamPeriodSince("90", now).getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });
});

describe("inTeamTable", () => {
  const person = (over: Record<string, unknown> = {}) =>
    ({ id: 1, role: "rep", modules: ["visits"], isActive: true, blockedAt: null, deletedAt: null, ...over }) as Parameters<typeof inTeamTable>[0];
  it("lists every active field rep with Visits, and managers only when they did something", () => {
    expect(inTeamTable(person(), false)).toBe(true);
    expect(inTeamTable(person({ modules: ["tags"] }), true)).toBe(false);
    expect(inTeamTable(person({ isActive: false }), true)).toBe(false);
    expect(inTeamTable(person({ blockedAt: new Date() }), true)).toBe(false);
    expect(inTeamTable(person({ deletedAt: new Date() }), true)).toBe(false);
    expect(inTeamTable(person({ role: "manager", modules: ["tags"] }), false)).toBe(false);
    expect(inTeamTable(person({ role: "manager", modules: ["tags"] }), true)).toBe(true);
  });
});
