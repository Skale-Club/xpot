import { describe, expect, it } from "vitest";
import { findUsStateCode, US_STATE_CODES } from "../client/src/lib/usStates";

describe("state selector", () => {
  it("contains all states plus Washington DC and Puerto Rico", () => {
    expect(US_STATE_CODES).toHaveLength(52);
    expect(US_STATE_CODES).toContain("MA");
    expect(US_STATE_CODES).toContain("DC");
    expect(US_STATE_CODES).toContain("PR");
  });

  it("normalizes codes, localized names and postal address fragments", () => {
    expect(findUsStateCode("ma")).toBe("MA");
    expect(findUsStateCode("Nova York")).toBe("NY");
    expect(findUsStateCode("Nueva Jersey")).toBe("NJ");
    expect(findUsStateCode("MA 01702")).toBe("MA");
  });

  it("preserves unknown regions for legacy data", () => {
    expect(findUsStateCode("Ontario")).toBeNull();
  });
});
