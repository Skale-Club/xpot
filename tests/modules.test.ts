import { describe, expect, it } from "vitest";
import { repModules } from "../shared/modules";

describe("repModules", () => {
  it("gives managers and admins every module", () => {
    expect(repModules({ role: "manager", modules: [] })).toEqual(["visits", "tags"]);
    expect(repModules({ role: "admin", modules: ["visits"] })).toEqual(["visits", "tags"]);
  });

  it("limits reps to their enabled modules", () => {
    expect(repModules({ role: "rep", modules: ["tags"] })).toEqual(["tags"]);
    expect(repModules({ role: "rep", modules: [] })).toEqual([]);
  });

  it("defaults to both when the rep row predates modules", () => {
    expect(repModules({ role: "rep" })).toEqual(["visits", "tags"]);
    expect(repModules({ role: "rep", modules: null })).toEqual(["visits", "tags"]);
  });

  it("drops unknown module names", () => {
    expect(repModules({ role: "rep", modules: ["tags", "billing"] })).toEqual(["tags"]);
  });
});
