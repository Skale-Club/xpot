// Tone maps of the Tags admin (components/xpot/StatusPill.tsx): one word, one colour.

import { describe, expect, it } from "vitest";
import {
  JOURNEY_ENTRY_STATUS_TONE,
  JOURNEY_KIND_TONE,
  PLAN_STATUS_TONE,
  PROVISIONER_STATUS_TONE,
  PROVISIONING_JOB_TONE,
} from "../client/src/components/xpot/StatusPill";
import { JOURNEY_ENTRY_KINDS, JOURNEY_ENTRY_STATUSES, PLAN_STATUSES } from "../shared/tagJourney";

describe("Tags admin tone maps", () => {
  it("paint 'active' the same in journey entries and plans", () => {
    expect(JOURNEY_ENTRY_STATUS_TONE.active).toBe(PLAN_STATUS_TONE.active);
  });

  it("show revoked and cancelled as finished (muted)", () => {
    expect(PROVISIONER_STATUS_TONE.revoked).toBe("muted");
    expect(PROVISIONING_JOB_TONE.cancelled).toBe("muted");
    expect(PLAN_STATUS_TONE.cancelled).toBe("muted");
    expect(PROVISIONER_STATUS_TONE.active).toBe("green");
  });

  it("cover every journey kind, entry status and plan status", () => {
    expect(Object.keys(JOURNEY_KIND_TONE).sort()).toEqual([...JOURNEY_ENTRY_KINDS].sort());
    expect(Object.keys(JOURNEY_ENTRY_STATUS_TONE).sort()).toEqual([...JOURNEY_ENTRY_STATUSES].sort());
    expect(Object.keys(PLAN_STATUS_TONE).sort()).toEqual([...PLAN_STATUSES].sort());
  });
});
