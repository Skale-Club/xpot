import { describe, expect, it } from "vitest";
import { humanizePlaceType, placeTypeLabel } from "../client/src/lib/placeTypes";

describe("placeTypeLabel", () => {
  it("translates a known Google type into the app language", () => {
    expect(placeTypeLabel("dental_clinic", "en")).toBe("Dental clinic");
    expect(placeTypeLabel("dental_clinic", "pt")).toBe("Clínica odontológica");
    expect(placeTypeLabel("dental_clinic", "es")).toBe("Clínica dental");
    expect(placeTypeLabel("barber_shop", "pt", "Barber Shop")).toBe("Barbearia");
  });

  it("uses Google's display name for a type the table does not know", () => {
    expect(placeTypeLabel("hookah_bar", "pt", "Hookah Bar")).toBe("Hookah Bar");
  });

  it("humanises an unknown code with no display name, never showing snake_case", () => {
    expect(placeTypeLabel("hookah_bar", "es")).toBe("Hookah bar");
    expect(placeTypeLabel("  indoor__golf_course ", "en")).toBe("Indoor golf course");
  });

  it("keeps a value that is already a display name", () => {
    expect(placeTypeLabel("Dental Clinic", "pt")).toBe("Dental Clinic");
  });

  it("is empty when Google sent no type", () => {
    expect(placeTypeLabel("", "pt")).toBe("");
    expect(placeTypeLabel(undefined, "pt", "Bakery")).toBe("Bakery");
  });
});

describe("humanizePlaceType", () => {
  it("turns a code into a sentence-case phrase", () => {
    expect(humanizePlaceType("car_repair")).toBe("Car repair");
    expect(humanizePlaceType("gym")).toBe("Gym");
  });
});
