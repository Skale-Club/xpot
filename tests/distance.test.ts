import { describe, expect, it } from "vitest";
import { formatDistanceFor, usesMiles } from "../client/src/pages/xpot/distance";

describe("formatDistanceFor", () => {
  it("uses miles in English", () => {
    expect(usesMiles("en-US")).toBe(true);
    expect(formatDistanceFor(16093.44, "en-US")).toBe("10 mi");
    expect(formatDistanceFor(2414, "en-US")).toBe("1.5 mi");
  });

  it("uses kilometres in Portuguese and Spanish, with their decimal mark", () => {
    expect(usesMiles("pt-BR")).toBe(false);
    expect(usesMiles("es-US")).toBe(false);
    expect(formatDistanceFor(1500, "pt-BR")).toBe("1,5 km");
    expect(formatDistanceFor(42_000, "es-US")).toBe("42 km");
  });

  it("never shows a negative or broken distance", () => {
    expect(formatDistanceFor(-5, "en-US")).toBe("0 mi");
    expect(formatDistanceFor(Number.NaN, "pt-BR")).toBe("0 km");
  });
});
