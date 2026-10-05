// The check-in "new business" phone field: a US number is masked as typed, and
// no number is ever cut or left half-masked.
import { describe, expect, it } from "vitest";
import { maskUsPhoneInput } from "../client/src/pages/xpot/phoneInput";

describe("maskUsPhoneInput", () => {
  it("masks a US number as it is typed", () => {
    expect(maskUsPhoneInput("407")).toBe("407");
    expect(maskUsPhoneInput("4075")).toBe("(407) 5");
    expect(maskUsPhoneInput("4075551234")).toBe("(407) 555-1234");
  });

  it("drops a leading country code 1, typed key by key or pasted", () => {
    // Key by key: at 10 digits the field reads "(140) 755-5123"; the 11th must not leave "(140) 755-51234".
    expect(maskUsPhoneInput("(140) 755-51234")).toBe("(407) 555-1234");
    expect(maskUsPhoneInput("14075551234")).toBe("(407) 555-1234");
    expect(maskUsPhoneInput("1 407 555 1234")).toBe("(407) 555-1234");
  });

  it("keeps international numbers whole", () => {
    expect(maskUsPhoneInput("+55 11 98765-4321")).toBe("+55 11 98765-4321");
    expect(maskUsPhoneInput("+1 (407) 555-1234")).toBe("+1 (407) 555-1234");
    // A Brazilian mobile from Google Places' national format: 11 digits, not starting with 1.
    expect(maskUsPhoneInput("(11) 98765-4321")).toBe("11987654321");
  });
});
