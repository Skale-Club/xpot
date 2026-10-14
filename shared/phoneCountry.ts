import { DEFAULT_COUNTRY_CODE } from "./phone";

const COUNTRY_DIAL_CODES: Record<string, string> = {
  US: "1",
  CA: "1",
  BR: "55",
  MX: "52",
  CO: "57",
  PT: "351",
  ES: "34",
};

const LANGUAGE_DEFAULT_COUNTRIES: Record<string, string> = {
  en: "US",
  pt: "BR",
  es: "ES",
};

/** Returns a dial code when the detected country is offered by the sign-in picker. */
export function phoneCountryCodeFromIso(countryIso: string | null | undefined): string | null {
  if (!countryIso) return null;
  return COUNTRY_DIAL_CODES[countryIso.trim().toUpperCase()] ?? null;
}

/** Picks a dial code from the browser's BCP 47 language preferences. */
export function phoneCountryCodeFromLocales(locales: readonly string[]): string {
  for (const locale of locales) {
    const normalized = locale?.trim().replace("_", "-");
    if (!normalized) continue;
    try {
      const region = new Intl.Locale(normalized).region;
      const code = phoneCountryCodeFromIso(region);
      if (code) return code;
    } catch {
      // Ignore malformed browser locale entries and try the next preference.
    }
  }

  for (const locale of locales) {
    const language = locale?.trim().toLowerCase().split(/[-_]/)[0];
    const code = phoneCountryCodeFromIso(LANGUAGE_DEFAULT_COUNTRIES[language]);
    if (code) return code;
  }

  return DEFAULT_COUNTRY_CODE;
}

/** Reads common CDN geo headers. This only personalizes the harmless UI default. */
export function countryIsoFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  for (const name of ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country"]) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && /^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  }
  return null;
}
