/**
 * A 4xx the routes pass straight to the client. `message` stays a readable
 * English sentence; `code` (with `params`) lets the client word it in the
 * user's language (client/src/lib/apiErrors.ts, srv_<code>).
 */
export class TagError extends Error {
  constructor(message: string, public status = 400, public code?: string, public params?: Record<string, string | number>) {
    super(message);
  }
}

/** The JSON body for a TagError: { message, code?, params? }. */
export function tagErrorBody(err: TagError) {
  return { message: err.message, ...(err.code ? { code: err.code } : {}), ...(err.params ? { params: err.params } : {}) };
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
