/**
 * The phone field of "new business" at check-in, formatted while the rep types.
 *
 * - A US number gets the "(407) 555-1234" mask as it is typed.
 * - An 11-digit number starting with 1 and then a valid US area code (2-9 first:
 *   US area codes never start with 0 or 1) is that same US number with its
 *   country code, typed or pasted: the 1 is dropped and the rest masked. That
 *   rule is what tells "1 407 …" from São Paulo's "11 9…", which also starts with 1.
 * - Anything else longer (a Brazilian mobile from Google Places has 11 digits,
 *   not starting with 1) or written with "+" is international: it is kept as
 *   typed, never cut. The old mask cut every number to 10 digits.
 */
export function maskUsPhoneInput(value: string): string {
  if (value.trim().startsWith("+")) return value;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && /^1[2-9]/.test(digits)) digits = digits.slice(1);
  else if (digits.length > 10) return digits;
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
