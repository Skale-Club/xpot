// Photos and voice notes are private (server/lib/files.ts): the API returns a
// storage reference ("r2:photos/12/…"), and the browser loads it through
// GET /api/xpot/files, which checks access and redirects to a short-lived
// signed URL. Values from before the move are still full https:// URLs and
// are used as they are until the migration rewrites them.

export function fileSrc(ref: string | null | undefined): string | undefined {
  if (!ref) return undefined;
  if (/^https?:\/\//i.test(ref)) return ref;
  return `/api/xpot/files?ref=${encodeURIComponent(ref)}`;
}
