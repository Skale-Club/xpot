// The piece pills are one template (TagModelChips): the same look everywhere, and each place picks how much they write.
// (The tests run without JSX, so the last one reads the sources.)

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shortModelText, shortSizeText, themeChipLook } from "../client/src/components/xpot/tagChips";

describe("the piece pills", () => {
  it("shortens a size to a letter and a model to two, so a Stand never reads as Small", () => {
    expect(shortSizeText("Large")).toBe("L");
    expect(shortSizeText("Small")).toBe("S");
    expect(shortModelText("Stand")).toBe("St");
    expect(shortModelText("Display")).toBe("Di");
    expect(shortModelText("Stand")).not.toBe(shortSizeText("Small"));
  });

  it("gives black and white their own look, however the colour was typed, and any other colour a neutral one", () => {
    expect(themeChipLook("black")).toBe("black");
    expect(themeChipLook(" White ")).toBe("white");
    expect(themeChipLook("mixed")).toBe("mixed");
    expect(themeChipLook("navy")).toBe("neutral");
  });

  it("leaves no hand-drawn colour pill on the production identity", () => {
    const source = readFileSync("client/src/pages/admin/tags/production-identity.tsx", "utf8");
    expect(source).not.toContain("themeName(model.theme)");
    expect(source).toContain("theme={model.theme}");
  });
});
