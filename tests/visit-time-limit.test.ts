import { expect, test } from "vitest";
import { VISIT_MAX_HOURS, visitDeadline, visitTimeLimitReached } from "../shared/visit-time-limit.js";

test("a visit has a four-hour deadline independent of the date or daylight-saving offset", () => {
  expect(VISIT_MAX_HOURS).toBe(4);
  expect(visitDeadline("2026-11-01T00:30:00-04:00").toISOString()).toBe("2026-11-01T08:30:00.000Z");
});

test("the deadline is inclusive and a planned visit has no running timer", () => {
  const start = "2026-11-02T12:00:00Z";
  expect(visitTimeLimitReached(start, Date.parse("2026-11-02T15:59:59.999Z"))).toBe(false);
  expect(visitTimeLimitReached(start, Date.parse("2026-11-02T16:00:00Z"))).toBe(true);
  expect(visitTimeLimitReached(null)).toBe(false);
});
