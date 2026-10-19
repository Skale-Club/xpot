// Refusing a sign-up blocks the account the way ending a partnership does
// (resellerAccounts.ts); sales_reps.refused_at tells the two apart in People.
// The block reason of a refusal starts with "Sign-up refused", followed by the
// admin's note. Refusals made before that prefix stored the screen's default
// text in the admin's language, so those prefixes count too: they are what
// migrations/0055_rep_refused_at.sql backfilled refused_at from.

export const REFUSED_PREFIX = "Sign-up refused";
const REFUSED_PREFIXES = [REFUSED_PREFIX, "Cadastro recusado", "Registro rechazado"];

/** The block reason stored for a refusal, with the admin's note when there is one. */
export function refusalReason(note?: string | null): string {
  const text = note?.trim();
  return text ? `${REFUSED_PREFIX}: ${text}` : REFUSED_PREFIX;
}

function matchedPrefix(blockedReason: string | null | undefined): string | null {
  const reason = blockedReason?.trim() ?? "";
  return REFUSED_PREFIXES.find((prefix) => reason === prefix || reason.startsWith(`${prefix}:`)) ?? null;
}

/** Whether a block is a refused sign-up. */
export function isRefusal(blockedReason: string | null | undefined): boolean {
  return matchedPrefix(blockedReason) !== null;
}

/** The admin's note on a refusal (after the marker), or the reason itself for a plain block. */
export function blockNote(blockedReason: string | null | undefined): string | null {
  const prefix = matchedPrefix(blockedReason);
  if (!prefix) return blockedReason?.trim() || null;
  return blockedReason!.trim().slice(prefix.length).replace(/^:\s*/, "") || null;
}
