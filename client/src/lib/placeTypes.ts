import type { Lang } from "@/i18n";
import { placeTypeMessages } from "@/i18n/messages/placeTypes";

const PLACE_TYPE_CODE = /^[a-z0-9]+(?:_+[a-z0-9]+)*$/;

/** "dental_clinic" → "Dental clinic", for a Google type the table does not know. */
export function humanizePlaceType(code: string): string {
  const words = code.trim().replace(/_+/g, " ").replace(/\s+/g, " ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/**
 * A Google Places type as a label in the app's language. `code` is the Table A
 * type ("dental_clinic"); `googleName` is Google's own display name, used for a
 * type the table does not know before falling back to humanising the code.
 * A value that is already a display name ("Dental Clinic") is kept as it is.
 */
export function placeTypeLabel(code: string | null | undefined, lang: Lang, googleName?: string | null): string {
  const value = code?.trim() ?? "";
  const name = googleName?.trim() ?? "";
  if (!value) return name;
  if (!PLACE_TYPE_CODE.test(value)) return value;
  const table = placeTypeMessages[lang] as Record<string, string>;
  const known = table[`place_${value}`];
  if (known) return known;
  if (name) return name;
  return humanizePlaceType(value);
}
