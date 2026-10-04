/** A 4xx the routes pass straight to the client. */
export class TagError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * The Postgres error behind a failed query. Drizzle wraps driver errors (the
 * SQLSTATE lives on `cause`), so checking `err.code` directly never matches.
 */
export function pgError(err: unknown): { code?: string; constraint?: string } {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null;
  if (!e) return {};
  return e.code ? e : e.cause ?? {};
}
