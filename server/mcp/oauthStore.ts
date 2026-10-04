import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import { mcpOauthClients, mcpOauthCodes, mcpOauthTokens, users, type McpOauthClient, type McpOauthCode, type McpOauthToken } from "#shared/schema.js";
import type { McpConnectionItem } from "#shared/tagsApi.js";

// Persistence and crypto for the MCP OAuth 2.1 server (oauth.ts). Client
// secrets, codes and tokens are stored as SHA-256 hashes: the plaintext only
// exists in the response that hands it to the client.

export const AUTH_CODE_TTL_MS = 60_000; // hosts redeem the code at once
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour; hosts refresh transparently
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** One scope for now: the journey tools, read and write, like a static token. */
export const SUPPORTED_SCOPES = ["xpot:journey"] as const;
export const DEFAULT_SCOPE = SUPPORTED_SCOPES.join(" ");

export const OAUTH_ACCESS_PREFIX = "xpot_at_";
const OAUTH_REFRESH_PREFIX = "xpot_rt_";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomSecret(prefix: string): string {
  return prefix + randomBytes(32).toString("base64url");
}

/** Shape check (prefix + 43 base64url chars), so a foreign bearer costs no query. */
export function looksLikeOauthAccessToken(value: string): boolean {
  return value.startsWith(OAUTH_ACCESS_PREFIX) && /^[A-Za-z0-9_-]{43}$/.test(value.slice(OAUTH_ACCESS_PREFIX.length));
}

/** Constant-time compare that tolerates different lengths. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** PKCE (RFC 7636), S256 only: OAuth 2.1 forbids "plain". */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  return safeEqual(createHash("sha256").update(codeVerifier).digest("base64url"), codeChallenge);
}

/**
 * What of the requested scope this server grants. Unknown scopes are dropped
 * rather than refused: hosts copy scopes from other servers, and failing the
 * whole connection over one stray value is a bad trade.
 */
export function normalizeScope(requested: string | undefined | null): string {
  const granted = (requested ?? "").split(/\s+/).filter((s) => (SUPPORTED_SCOPES as readonly string[]).includes(s));
  return granted.length ? Array.from(new Set(granted)).join(" ") : DEFAULT_SCOPE;
}

// ─── Clients (RFC 7591 dynamic registration) ─────────────────────────────────

export async function registerClient(input: {
  clientName?: string;
  clientUri?: string;
  redirectUris: string[];
  tokenEndpointAuthMethod?: string;
}): Promise<{ client: McpOauthClient; clientSecret: string | null }> {
  const confidential = input.tokenEndpointAuthMethod === "client_secret_post" || input.tokenEndpointAuthMethod === "client_secret_basic";
  const clientSecret = confidential ? randomSecret("xpot_cs_") : null;
  const [client] = await db
    .insert(mcpOauthClients)
    .values({
      clientId: randomSecret("xpot_client_"),
      clientSecretHash: clientSecret ? sha256(clientSecret) : null,
      clientName: input.clientName ?? null,
      clientUri: input.clientUri ?? null,
      redirectUris: input.redirectUris,
      tokenEndpointAuthMethod: confidential ? input.tokenEndpointAuthMethod! : "none",
    })
    .returning();
  return { client, clientSecret };
}

export async function getClient(clientId: string): Promise<McpOauthClient | undefined> {
  const [client] = await db.select().from(mcpOauthClients).where(eq(mcpOauthClients.clientId, clientId)).limit(1);
  return client;
}

export function clientSecretMatches(client: McpOauthClient, presented: string | undefined): boolean {
  if (client.tokenEndpointAuthMethod === "none") return true;
  if (!client.clientSecretHash || !presented) return false;
  return safeEqual(sha256(presented), client.clientSecretHash);
}

// ─── Authorization codes ─────────────────────────────────────────────────────

export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  resource: string;
  codeChallenge: string;
}): Promise<string> {
  const code = randomSecret("xpot_code_");
  await db.insert(mcpOauthCodes).values({
    codeHash: sha256(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scope: input.scope,
    resource: input.resource,
    codeChallenge: input.codeChallenge,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return code;
}

/**
 * Marks a code consumed and returns it. `consumed_at IS NULL` is the replay
 * guard: a second redemption, even a concurrent one, updates nothing.
 */
export async function consumeAuthCode(code: string): Promise<McpOauthCode | undefined> {
  const [consumed] = await db
    .update(mcpOauthCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(mcpOauthCodes.codeHash, sha256(code)), isNull(mcpOauthCodes.consumedAt)))
    .returning();
  return consumed;
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export async function issueTokens(input: { clientId: string; userId: string; scope: string; resource: string | null }): Promise<IssuedTokens> {
  const accessToken = randomSecret(OAUTH_ACCESS_PREFIX);
  const refreshToken = randomSecret(OAUTH_REFRESH_PREFIX);
  const now = Date.now();
  const common = { clientId: input.clientId, userId: input.userId, scope: input.scope, resource: input.resource };
  await db.insert(mcpOauthTokens).values([
    { ...common, tokenHash: sha256(accessToken), kind: "access", expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS) },
    { ...common, tokenHash: sha256(refreshToken), kind: "refresh", expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS) },
  ]);
  return { accessToken, refreshToken, expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000), scope: input.scope };
}

/** A live (not revoked, not expired) token of that kind, or undefined. */
export async function findLiveToken(token: string, kind: "access" | "refresh"): Promise<McpOauthToken | undefined> {
  const [row] = await db
    .select()
    .from(mcpOauthTokens)
    .where(and(eq(mcpOauthTokens.tokenHash, sha256(token)), eq(mcpOauthTokens.kind, kind)))
    .limit(1);
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return undefined;
  return row;
}

export async function touchToken(id: string): Promise<void> {
  await db.update(mcpOauthTokens).set({ lastUsedAt: new Date() }).where(eq(mcpOauthTokens.id, id));
}

/**
 * Refresh-token rotation: the presented token dies with the exchange. The
 * revoke is conditional, so two concurrent refreshes with one token cannot
 * both mint a pair.
 */
export async function rotateRefreshToken(row: McpOauthToken): Promise<IssuedTokens | null> {
  const revoked = await db
    .update(mcpOauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpOauthTokens.id, row.id), isNull(mcpOauthTokens.revokedAt)))
    .returning({ id: mcpOauthTokens.id });
  if (!revoked.length) return null;
  return issueTokens({ clientId: row.clientId, userId: row.userId, scope: row.scope, resource: row.resource });
}

/** RFC 7009: revokes one token by its value; unknown tokens are a no-op. */
export async function revokeToken(token: string): Promise<void> {
  await db
    .update(mcpOauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpOauthTokens.tokenHash, sha256(token)), isNull(mcpOauthTokens.revokedAt)));
}

/** Cuts a connection: every live token one client holds. Returns how many. */
export async function revokeClientTokens(clientId: string): Promise<number> {
  const revoked = await db
    .update(mcpOauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpOauthTokens.clientId, clientId), isNull(mcpOauthTokens.revokedAt)))
    .returning({ id: mcpOauthTokens.id });
  return revoked.length;
}

function hostOf(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

/** One row per client and user with a live token: the admin's "connected apps". */
export async function listConnections(): Promise<McpConnectionItem[]> {
  const rows = await db
    .select({
      clientId: mcpOauthTokens.clientId,
      userId: mcpOauthTokens.userId,
      clientName: mcpOauthClients.clientName,
      redirectUris: mcpOauthClients.redirectUris,
      userLabel: sql<string | null>`coalesce(${users.email}, ${users.phone})`,
      connectedAt: sql<string>`min(${mcpOauthTokens.createdAt})`,
      lastUsedAt: sql<string | null>`max(${mcpOauthTokens.lastUsedAt})`,
    })
    .from(mcpOauthTokens)
    .leftJoin(mcpOauthClients, eq(mcpOauthClients.clientId, mcpOauthTokens.clientId))
    .leftJoin(users, eq(users.id, mcpOauthTokens.userId))
    .where(and(isNull(mcpOauthTokens.revokedAt), gt(mcpOauthTokens.expiresAt, new Date())))
    .groupBy(mcpOauthTokens.clientId, mcpOauthTokens.userId, mcpOauthClients.clientName, mcpOauthClients.redirectUris, users.email, users.phone)
    .orderBy(desc(sql`max(${mcpOauthTokens.createdAt})`));
  const iso = (value: string | Date | null) => (value ? new Date(value).toISOString() : null);
  return rows.map((r) => ({
    clientId: r.clientId,
    clientName: r.clientName,
    redirectHost: hostOf(r.redirectUris?.[0]),
    userId: r.userId,
    userLabel: r.userLabel,
    connectedAt: iso(r.connectedAt)!,
    lastUsedAt: iso(r.lastUsedAt),
  }));
}

/**
 * Housekeeping, called opportunistically from the token endpoint (failures
 * ignored): used codes and dead tokens would otherwise pile up.
 */
export async function pruneExpired(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(mcpOauthCodes).where(lt(mcpOauthCodes.expiresAt, cutoff));
  await db.delete(mcpOauthTokens).where(or(lt(mcpOauthTokens.expiresAt, cutoff), lt(mcpOauthTokens.revokedAt, cutoff)));
}
