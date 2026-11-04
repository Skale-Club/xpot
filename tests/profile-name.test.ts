import { describe, expect, it } from "vitest";
import { profileNameParts } from "../shared/profileName";

describe("profile name", () => {
  it("shows the name the app greets the person by, not an old sign-in record", () => {
    expect(profileNameParts("Vanildo Jr", "Skale", "Club")).toEqual({ firstName: "Vanildo", lastName: "Jr" });
  });
  it("keeps first and last as written when they already make that name", () => {
    expect(profileNameParts("Ana Maria Silva", "Ana Maria", "Silva")).toEqual({ firstName: "Ana Maria", lastName: "Silva" });
  });
  it("handles one word, extra spaces and no name at all", () => {
    expect(profileNameParts("Leila", null, null)).toEqual({ firstName: "Leila", lastName: "" });
    expect(profileNameParts("  Vanildo   de  Souza ", null, null)).toEqual({ firstName: "Vanildo", lastName: "de Souza" });
    expect(profileNameParts("", "Skale", "Club")).toEqual({ firstName: "Skale", lastName: "Club" });
  });
});
