import { describe, expect, it } from "vitest";
import { repModules } from "../shared/modules";

describe("repModules", () => {
  it("gives admins every module", () => {
    expect(repModules({ role: "admin", modules: [] })).toEqual(["visits", "tags"]);
    expect(repModules({ role: "admin", modules: ["visits"] })).toEqual(["visits", "tags"]);
  });

  it("treats a leftover role=manager row as a rep: the column rules", () => {
    expect(repModules({ role: "manager", modules: ["tags"] })).toEqual(["tags"]);
    expect(repModules({ role: "manager", modules: [] })).toEqual([]);
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
