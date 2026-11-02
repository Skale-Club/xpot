/** A forgotten check-out must never keep a field visit running for days. */
export const VISIT_MAX_SECONDS = 4 * 60 * 60;
export const VISIT_MAX_HOURS = VISIT_MAX_SECONDS / 3600;

export function visitDeadline(checkedInAt: string | Date): Date {
  return new Date(new Date(checkedInAt).getTime() + VISIT_MAX_SECONDS * 1000);
}

export function visitTimeLimitReached(checkedInAt: string | Date | null | undefined, now = Date.now()): boolean {
  return checkedInAt != null && visitDeadline(checkedInAt).getTime() <= now;
}
