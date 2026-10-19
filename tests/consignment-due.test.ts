import { describe, expect, it } from "vitest";
import { consignmentDue } from "../client/src/pages/xpot/components/sales/consignmentDue";

const now = new Date("2026-10-18T12:00:00Z").getTime();
const day = 24 * 60 * 60 * 1000;

describe("consignmentDue", () => {
  it("flags an open agreement past its settlement date", () => {
    expect(consignmentDue({ status: "active", nextVisitDueAt: new Date(now - 3 * day) }, now))
      .toEqual({ closed: false, overdue: true, daysOverdue: 3, dueInDays: null });
    // A few hours late still reads as one day overdue, never "0 days".
    expect(consignmentDue({ status: "active", nextVisitDueAt: new Date(now - 3_600_000) }, now).daysOverdue).toBe(1);
  });

  it("never flags a closed agreement, whatever its date", () => {
    expect(consignmentDue({ status: "closed", nextVisitDueAt: new Date(now - 30 * day) }, now))
      .toEqual({ closed: true, overdue: false, daysOverdue: 0, dueInDays: null });
  });

  it("reports the days left within the next week", () => {
    expect(consignmentDue({ status: "active", nextVisitDueAt: new Date(now + 2 * day) }, now).dueInDays).toBe(2);
    expect(consignmentDue({ status: "active", nextVisitDueAt: new Date(now + 3_600_000) }, now).dueInDays).toBe(0);
    expect(consignmentDue({ status: "active", nextVisitDueAt: new Date(now + 20 * day) }, now).dueInDays).toBeNull();
    expect(consignmentDue({ status: "active", nextVisitDueAt: null }, now).overdue).toBe(false);
  });
});
