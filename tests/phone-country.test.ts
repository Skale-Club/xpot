import { describe, expect, it } from "vitest";
import {
  countryIsoFromHeaders,
  dialCodeOf,
  phoneCountryCodeFromIso,
  phoneCountryCodeFromLocales,
} from "../shared/phoneCountry";

describe("phone country detection", () => {
  it("maps supported visitor countries to their dial codes", () => {
    expect(phoneCountryCodeFromIso("BR")).toBe("55");
    expect(phoneCountryCodeFromIso("ca")).toBe("1");
    expect(phoneCountryCodeFromIso("PT")).toBe("351");
    expect(phoneCountryCodeFromIso("GB")).toBeNull();
  });

  it("uses the region in browser language preferences", () => {
    expect(phoneCountryCodeFromLocales(["pt-BR", "en-US"])).toBe("55");
    expect(phoneCountryCodeFromLocales(["es-MX", "en-US"])).toBe("52");
    expect(phoneCountryCodeFromLocales(["es-CO"])).toBe("57");
  });

  it("falls back from a generic language and ultimately to North America", () => {
    expect(phoneCountryCodeFromLocales(["pt"])).toBe("55");
    expect(phoneCountryCodeFromLocales(["es"])).toBe("34");
    expect(phoneCountryCodeFromLocales(["fr-FR"])).toBe("1");
  });

  it("reads and validates common CDN country headers", () => {
    expect(countryIsoFromHeaders({ "cf-ipcountry": "br" })).toBe("BR");
    expect(countryIsoFromHeaders({ "x-vercel-ip-country": "MX" })).toBe("MX");
    expect(countryIsoFromHeaders({ "cf-ipcountry": "unknown" })).toBeNull();
  });
});

describe("dialCodeOf", () => {
  it("reads the country of a business phone in international form", () => {
    expect(dialCodeOf("+16175551182")).toBe("1");
    expect(dialCodeOf("+5511999998888")).toBe("55");
    expect(dialCodeOf("+351912345678")).toBe("351");
    expect(dialCodeOf("+34911222333")).toBe("34");
  });
  it("is null for a number without a country or from a country the picker lacks", () => {
    expect(dialCodeOf("6175551182")).toBeNull();
    expect(dialCodeOf("+447700900123")).toBeNull();
    expect(dialCodeOf(null)).toBeNull();
  });
});
