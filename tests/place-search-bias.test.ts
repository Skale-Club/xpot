import { describe, expect, it } from "vitest";
import { roundSearchBias } from "../client/src/pages/xpot/usePlaceSearch";

// The rounded bias is what goes into the react-query key. If GPS jitter can
// change it, every watchPosition tick becomes a refetch and a billed Places
// call — the "search blinking every 2s" bug this pins against.

describe("roundSearchBias", () => {
  it("absorbs GPS jitter — a few metres of drift keeps the same key", () => {
    // ~5m of drift at the equator is ~0.000045°; jitter around a fix must
    // collapse to one value.
    const fix = -23.5613;
    expect(roundSearchBias(fix + 0.00004)).toBe(roundSearchBias(fix));
    expect(roundSearchBias(fix - 0.00004)).toBe(roundSearchBias(fix));
  });

  it("still tracks real movement — a ~200m walk lands on a new value", () => {
    expect(roundSearchBias(-23.5613)).not.toBe(roundSearchBias(-23.5633));
  });

  it("keeps ~110m granularity", () => {
    expect(roundSearchBias(-23.56149)).toBe(-23.561);
    expect(roundSearchBias(-23.56151)).toBe(-23.562);
    expect(roundSearchBias(46.6339)).toBe(46.634);
  });
});
