// Phone numbers as sign-in identity, stored in E.164 ("+15085550100").
// Resellers are mostly in the US, so a bare 10-digit number is read as +1;
// anything else must carry its country code.

export const DEFAULT_COUNTRY_CODE = "1";

/** Country codes offered in the sign-in screen (the rest can be typed with +). */
export const PHONE_COUNTRIES = [
  { code: "1", label: "US/CA", flag: "🇺🇸" },
  { code: "55", label: "BR", flag: "🇧🇷" },
  { code: "52", label: "MX", flag: "🇲🇽" },
  { code: "57", label: "CO", flag: "🇨🇴" },
  { code: "351", label: "PT", flag: "🇵🇹" },
  { code: "34", label: "ES", flag: "🇪🇸" },
] as const;

/**
 * E.164 from what a person types, or null when it can't be a phone number.
 * `countryCode` is used when the input has no leading "+" (digits only).
 */
export function normalizePhone(input: string | null | undefined, countryCode: string = DEFAULT_COUNTRY_CODE): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  // Only digits, spaces and the usual separators; no letters.
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  const cc = countryCode.replace(/\D/g, "");
  let e164: string;
  if (raw.startsWith("+")) e164 = `+${digits}`;
  else if (raw.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (cc === "1" && digits.length === 11 && digits.startsWith("1")) e164 = `+${digits}`;
  else e164 = `+${cc}${digits}`;
  // E.164: up to 15 digits; nothing real is shorter than 8.
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  // North American numbers are exactly +1 and 10 digits.
  if (e164.startsWith("+1") && e164.length !== 12) return null;
  return e164;
}

/** "+15085550100" → "+1 (508) 555-0100"; other countries: "+55 11 98765 4321"-ish grouping. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  const br = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`;
  return e164;
}

/** "+15085550100" → "+1 •••• 0100", for messages that shouldn't show the whole number. */
export function maskPhone(e164: string): string {
  if (e164.length <= 6) return e164;
  const country = e164.startsWith("+1") ? "+1" : e164.slice(0, 3);
  return `${country} •••• ${e164.slice(-4)}`;
}
