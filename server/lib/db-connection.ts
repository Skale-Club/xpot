/**
 * A pooled connection the database (or the network in between) has already dropped fails on its next use with one of
 * these. The pool throws that socket away, so the same query on a fresh connection normally just works.
 */
const DROPPED_CODES = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "57P01"]);
const DROPPED_MESSAGES = [/connection terminated unexpectedly/i, /connection terminated due to connection timeout/i];

/** Whether the error, or anything it wraps (drizzle wraps pg errors in `cause`), is a dropped connection. */
export function isConnectionDropped(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 4) return false;
  const { code, message, cause } = error as { code?: unknown; message?: unknown; cause?: unknown };
  if (typeof code === "string" && DROPPED_CODES.has(code)) return true;
  if (typeof message === "string" && DROPPED_MESSAGES.some((pattern) => pattern.test(message))) return true;
  return isConnectionDropped(cause, depth + 1);
}

/** Runs `work` again once when it failed only because its connection had been dropped. Use for idempotent work. */
export async function retryIfConnectionDropped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!isConnectionDropped(error)) throw error;
    return work();
  }
}
