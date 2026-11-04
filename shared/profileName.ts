/**
 * The first and last name to show in a person's profile. The name the app greets them by is the one that counts
 * (`sales_reps.display_name`): when the sign-in record says something else, the form shows that name split in two
 * rather than a name the person never sees anywhere else. Saving writes both back, in step.
 */
export function profileNameParts(
  displayName: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): { firstName: string; lastName: string } {
  const first = firstName?.trim() ?? "";
  const last = lastName?.trim() ?? "";
  const shown = displayName?.trim().replace(/\s+/g, " ") ?? "";
  if (!shown || shown === [first, last].filter(Boolean).join(" ")) return { firstName: first, lastName: last };
  const [head, ...rest] = shown.split(" ");
  return { firstName: head, lastName: rest.join(" ") };
}
