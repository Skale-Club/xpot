import type { QueryClient } from "@tanstack/react-query";

/** A cached team list must never be reused as the person's own list (or vice versa). */
export async function clearWorkspaceQueries(client: QueryClient): Promise<void> {
  const scoped = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "/api/xpot/me" };
  await client.cancelQueries(scoped);
  client.removeQueries(scoped);
}
