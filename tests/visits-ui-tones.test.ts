// Colour rules of the Visits screens (docs/UI_KIT.md): every status pill takes
// its tone from a map, green is money only and violet is Tags only.

import { describe, expect, it } from "vitest";
import { LEAD_STATE_TONE } from "../client/src/pages/xpot/components/leads/LeadStatePill";
import { VISIT_STATUSES, visitStatusTone } from "../client/src/pages/xpot/components/VisitStatus";
import { PILL_DOTS, VISIT_OUTCOME_TONE } from "../client/src/components/xpot/StatusPill";

describe("company state pill", () => {
  it("never paints a company green or violet", () => {
    expect(Object.values(LEAD_STATE_TONE)).not.toContain("green");
    expect(Object.values(LEAD_STATE_TONE)).not.toContain("violet");
  });

  it("tells a prospect, a lead and a customer apart", () => {
    const tones = new Set([LEAD_STATE_TONE.prospect, LEAD_STATE_TONE.lead, LEAD_STATE_TONE.customer]);
    expect(tones.size).toBe(3);
  });

  it("paints \"active\" like the Customer it reads as", () => {
    expect(LEAD_STATE_TONE.active).toBe(LEAD_STATE_TONE.customer);
  });
});

describe("visit status badge and filter", () => {
  it("take the colour of every status from VISIT_OUTCOME_TONE", () => {
    for (const { value } of VISIT_STATUSES) {
      expect(visitStatusTone(value)).toBe(VISIT_OUTCOME_TONE[value]);
      expect(PILL_DOTS[visitStatusTone(value)]).toBeTruthy();
    }
  });

  it("fall back to slate for a status the map does not know", () => {
    expect(visitStatusTone("mystery")).toBe("slate");
  });
});
