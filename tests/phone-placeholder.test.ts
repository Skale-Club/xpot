import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHONE_COUNTRIES, phonePlaceholderFor } from "../shared/phone";

// The empty phone field shows zeros in the selected country's format, never a real
// number or area code. Placeholder only: validation and sending are untouched.
describe("phone placeholder", () => {
  it("follows the selected country with zeros", () => {
    expect(phonePlaceholderFor("1")).toBe("(000) 000-0000");
    expect(phonePlaceholderFor("55")).toBe("(00) 00000-0000");
    for (const c of PHONE_COUNTRIES) expect(phonePlaceholderFor(c.code)).toMatch(/^[0() -]+$/);
  });

  it("is what the sign-in screens use, with no specific number left in them", () => {
    const signIn = readFileSync("client/src/components/PhoneSignIn.tsx", "utf8");
    expect(signIn).toContain("phonePlaceholderFor(countryCode)");
    for (const f of ["client/src/components/PhoneSignIn.tsx", "client/src/pages/my/SignIn.tsx", "client/src/pages/xpot/XpotSettings.tsx", "client/src/i18n/messages/signin.ts", "client/src/i18n/messages/myPlates.ts", "client/src/i18n/messages/common.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\(508\) 555|555-0142|98765-4321|\(555\) 000/);
    }
  });

  it("keeps the mobile phone field attributes", () => {
    const signIn = readFileSync("client/src/components/PhoneSignIn.tsx", "utf8");
    expect(signIn).toContain('type="tel"');
    expect(signIn).toContain('autoComplete="tel-national"');
    expect(signIn).toContain('autoComplete="one-time-code"');
    expect(signIn).not.toContain("min-h-10");
  });
});
