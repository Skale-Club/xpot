import crypto from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db.js";
import { mcpTokens, type McpToken } from "#shared/schema.js";
import type { McpTokenItem } from "#shared/tagsApi.js";
import { TagError } from "../tags/errors.js";

// MCP access tokens. The secret is "xpot_mcp_" + 32 random bytes (base64url);
// only its SHA-256 hash is stored, so a database leak does not leak access.

export const MCP_TOKEN_PREFIX = "xpot_mcp_";
/** Characters kept to recognise a token in the admin list ("xpot_mcp_" + 4). */
const SHOWN_PREFIX_LENGTH = MCP_TOKEN_PREFIX.length + 4;

export function generateMcpSecret(): string {
  return MCP_TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
}

export function hashMcpSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/**
 * Cheap shape check (prefix + 43 base64url chars), so a malformed or
 * foreign bearer is refused without a database lookup.
 */
export function looksLikeMcpSecret(value: string): boolean {
  return value.startsWith(MCP_TOKEN_PREFIX) && /^[A-Za-z0-9_-]{43}$/.test(value.slice(MCP_TOKEN_PREFIX.length));
}

/** The secret from an `Authorization: Bearer <secret>` header, or null. */
export function bearerSecret(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return match ? match[1] : null;
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

export function toMcpTokenItem(row: McpToken): McpTokenItem {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: iso(row.lastUsedAt),
    revokedAt: iso(row.revokedAt),
  };
}

export async function listMcpTokens(): Promise<McpTokenItem[]> {
  const list = await db.select().from(mcpTokens).orderBy(desc(mcpTokens.createdAt));
  return list.map(toMcpTokenItem);
}

/** Creates a token; the secret is returned here once and never stored. */
export async function createMcpToken(name: string, userId: string | null): Promise<{ token: McpTokenItem; secret: string }> {
  const secret = generateMcpSecret();
  const [row] = await db
    .insert(mcpTokens)
    .values({
      name,
      tokenHash: hashMcpSecret(secret),
      tokenPrefix: secret.slice(0, SHOWN_PREFIX_LENGTH),
      createdByUserId: userId,
    })
    .returning();
  return { token: toMcpTokenItem(row), secret };
}

export async function revokeMcpToken(id: string): Promise<McpTokenItem> {
  const [revoked] = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpTokens.id, id), isNull(mcpTokens.revokedAt)))
    .returning();
  if (revoked) return toMcpTokenItem(revoked);
  // Already revoked is not an error (idempotent); unknown id is.
  const [existing] = await db.select().from(mcpTokens).where(eq(mcpTokens.id, id)).limit(1);
  if (!existing) throw new TagError("Token not found", 404);
  return toMcpTokenItem(existing);
}

/** The live (not revoked) token behind a secret, or null. */
export async function findActiveMcpToken(secret: string): Promise<{ id: string; name: string; tokenPrefix: string } | null> {
  const [row] = await db
    .select({ id: mcpTokens.id, name: mcpTokens.name, tokenPrefix: mcpTokens.tokenPrefix })
    .from(mcpTokens)
    .where(and(eq(mcpTokens.tokenHash, hashMcpSecret(secret)), isNull(mcpTokens.revokedAt)))
    .limit(1);
  return row ?? null;
}

export async function touchMcpToken(id: string): Promise<void> {
  await db.update(mcpTokens).set({ lastUsedAt: new Date() }).where(eq(mcpTokens.id, id));
}
