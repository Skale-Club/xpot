import { describe, expect, it } from "vitest";
import {
  xpotCheckInSchema,
  xpotDailyRouteCreateSchema,
  xpotDailyRouteRegenerateSchema,
  xpotDailyRouteStopUpdateSchema,
  xpotPushSubscriptionSchema,
  xpotVisitSummarySchema,
} from "../shared/xpot";
import { dailyRouteDate, manualCheckInLeadId, parseGoogleRoutePlan } from "../shared/daily-route";

describe("daily prospecting route contracts", () => {
  const validRoute = {
    industry: "Barbershops",
    city: "Framingham, MA",
    startTime: "09:30",
    durationMinutes: 240,
    routeDate: "2026-10-12",
    timezone: "America/New_York",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
  };

  it("recognizes a manual check-in deep link", () => {
    expect(manualCheckInLeadId("/leads/prospecting?leadId=42")).toBe(42);
    expect(manualCheckInLeadId("/leads/prospecting")).toBeNull();
    expect(manualCheckInLeadId("/leads/prospecting?leadId=invalid")).toBeNull();
  });

  it("validates a browser push subscription", () => {
    expect(xpotPushSubscriptionSchema.parse({
      endpoint: "https://push.example.test/subscription/1",
      keys: { p256dh: "public-key", auth: "auth-secret" },
    }).endpoint).toContain("push.example.test");
  });

  it("accepts the complete one-day planning payload", () => {
    expect(xpotDailyRouteCreateSchema.parse(validRoute)).toEqual(validRoute);
  });

  it("uses the server operational timezone for the daily quota", () => {
    const instant = new Date("2026-10-12T16:00:00.000Z");
    expect(dailyRouteDate(instant, "America/New_York")).toEqual({
      routeDate: "2026-10-12",
      timezone: "America/New_York",
    });
  });

  it("uses the optimized Google waypoint order and real leg durations", () => {
    const plan = parseGoogleRoutePlan(["first", "middle-a", "middle-b", "last"], {
      optimizedIntermediateWaypointIndex: [1, 0],
      legs: [{ duration: "120s" }, { duration: "300s" }, { duration: "60s" }],
      polyline: { encodedPolyline: "encoded-road-line" },
    });
    expect(plan).toEqual({
      orderedKeys: ["first", "middle-b", "middle-a", "last"],
      driveMinutes: [0, 2, 5, 1],
      polyline: "encoded-road-line",
    });
  });

  it("rejects invalid work windows before a paid job can start", () => {
    expect(() => xpotDailyRouteCreateSchema.parse({ ...validRoute, durationMinutes: 30 })).toThrow();
    expect(() => xpotDailyRouteCreateSchema.parse({ ...validRoute, durationMinutes: 900 })).toThrow();
    expect(() => xpotDailyRouteCreateSchema.parse({ ...validRoute, startTime: "tomorrow" })).toThrow();
  });

  it("carries the route stop into the existing check-in contract", () => {
    const parsed = xpotCheckInSchema.parse({ leadId: 18, locationId: 22, routeStopId: 7, lat: 42.2, lng: -71.4 });
    expect(parsed.routeStopId).toBe(7);
  });

  it("requires an actual stop change and a meaningful admin reason", () => {
    expect(() => xpotDailyRouteStopUpdateSchema.parse({})).toThrow();
    expect(xpotDailyRouteStopUpdateSchema.parse({ status: "skipped", skipReason: "Closed" }).status).toBe("skipped");
    expect(() => xpotDailyRouteRegenerateSchema.parse({ reason: "no", idempotencyKey: validRoute.idempotencyKey })).toThrow();
  });

  it("accepts the post-visit contact, note and quick task together", () => {
    const summary = xpotVisitSummarySchema.parse({
      attendeeName: "Anthony",
      outcome: "Interested",
      summary: "Asked for a proposal",
      nextStep: "Return Friday",
      quickTask: {
        title: "Bring proposal",
        dueAt: "2026-10-16T14:00:00.000Z",
        priority: "high",
        type: "return_visit",
      },
    });
    expect(summary.quickTask?.type).toBe("return_visit");
  });
});
