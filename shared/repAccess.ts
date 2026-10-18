// Refusing a sign-up blocks the account the way ending a partnership does
// (resellerAccounts.ts); what tells the two apart in People is the block
// reason, which starts with "Sign-up refused". Refusals made before this
// marker stored the screen's default text in the admin's language, so those
// prefixes count too.

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
