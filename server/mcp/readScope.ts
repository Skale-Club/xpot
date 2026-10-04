import { z } from "zod";

// Read tools take their scope inside `filters`, but clients also send it at the top level
// ({ batch: "REV-2026-001" }). Those keys used to be stripped silently and the call came back
// unscoped; now both shapes work (keys inside `filters` win).
const READ_SCOPE_KEYS = [
  "batch", "tag", "kitId", "leadId", "repId", "planId", "kind", "includeArchived", "limit", "before",
  "order", "planStatus", "status",
] as const;

export const readScopeParams = Object.fromEntries(READ_SCOPE_KEYS.map((k) => [k, z.unknown().optional()])) as Record<
  (typeof READ_SCOPE_KEYS)[number],
  z.ZodOptional<z.ZodUnknown>
>;

export function mergeReadScope(args: Record<string, unknown>): Record<string, unknown> {
  const { filters, ...top } = args;
  const merged: Record<string, unknown> = {};
  for (const k of READ_SCOPE_KEYS) if (top[k] !== undefined) merged[k] = top[k];
  return { ...merged, ...((filters as Record<string, unknown> | undefined) ?? {}) };
}
