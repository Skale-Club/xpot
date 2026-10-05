import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { users } from "#shared/schema.js";
import { db } from "../db.js";
import { accessDenial, ensureXpotRep } from "../routes/xpot/middleware.js";
import { storage } from "../storage.js";
import { normalizeIpKey, rateLimit } from "../tags/rateLimit.js";
import { renderConsentPage, renderErrorPage } from "./consentPage.js";
import {
  ACCESS_TOKEN_TTL_MS,
  SUPPORTED_SCOPES,
  clientSecretMatches,
  consumeAuthCode,
  createAuthCode,
  findLiveToken,
  getClient,
  issueTokens,
  normalizeScope,
  pruneExpired,
  registerClient,
  revokeToken,
  rotateRefreshToken,
  touchToken,
  verifyPkce,
} from "./oauthStore.js";
import type { McpCaller } from "./server.js";

// OAuth 2.1 authorization server for /mcp, for hosts that connect themselves
// (Claude, ChatGPT) instead of taking a pasted token:
//   RFC 9728 protected resource metadata, RFC 8414 server metadata,
//   RFC 7591 dynamic client registration, RFC 7636 PKCE (S256 only),
//   RFC 8707 resource indicators, RFC 7009 revocation.
// The human gate is the consent screen, shown to a signed-in Xpot admin: the
// journey tools are admin-only, so a token can never do more than the admin
// who approved it, and losing admin (or being blocked) cuts it off at once.

/**
 * Public origin: PUBLIC_BASE_URL when set, else the request's own (trust proxy
 * is on, so X-Forwarded-Proto is honoured; the host is the Host the proxy
 * routed on, never X-Forwarded-Host). Per request by default because
 * production answers on more than one domain, and a client must see the
 * origin it connected to.
 */
export function getBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

/** The MCP endpoint, also the OAuth resource identifier (RFC 8707). */
export function getMcpResourceUrl(req: Request): string {
  return `${getBaseUrl(req)}/mcp`;
}

export function protectedResourceMetadataUrl(req: Request): string {
  return `${getBaseUrl(req)}/.well-known/oauth-protected-resource`;
}

type OauthSession = { userId?: string; email?: string | null; mcpConsentState?: string };
const sessionOf = (req: Request) => (req.session ?? {}) as unknown as OauthSession;

function noStore(res: Response) {
  res.set("Cache-Control", "no-store").set("Pragma", "no-cache");
}

function oauthError(res: Response, status: number, error: string, description: string) {
  noStore(res);
  return res.status(status).json({ error, error_description: description });
}

function htmlPage(res: Response, status: number, html: string) {
  noStore(res);
  return res.status(status).type("html").send(html);
}

function tooMany(req: Request, bucket: string, limit: number, windowMs: number): boolean {
  return rateLimit(`mcp-oauth:${bucket}:${normalizeIpKey(req.ip)}`, { limit, windowMs });
}

/** The canonical /mcp URL (trailing slash tolerated) or the bare origin. */
function isAcceptableResource(resource: string, req: Request): boolean {
  const normalized = resource.replace(/\/+$/, "");
  return normalized === getMcpResourceUrl(req) || normalized === getBaseUrl(req);
}

/** https anywhere, http only on loopback (RFC 8252 native clients, MCP Inspector). */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/**
 * Whether this user may hold journey access right now: an active, unblocked
 * global Xpot admin (users.is_admin), as requireTagAdmin.
 */
export async function journeyAdminDenial(userId: string): Promise<string | null> {
  const [user] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return "The account that approved this connection no longer exists.";
  const rep = await storage.getSalesRepByUserId(userId);
  if (!rep) return "This account has no Xpot profile.";
  const denial = accessDenial(rep);
  if (denial) return denial.message;
  if (!user.isAdmin) return "Only Xpot admins can connect AI apps to the journey.";
  return null;
}

/** Resolves an OAuth access token on /mcp. `denied` means a real token whose owner lost access. */
export async function authenticateOauthAccess(secret: string): Promise<{ caller: McpCaller } | { denied: string } | null> {
  const row = await findLiveToken(secret, "access");
  if (!row) return null;
  const denial = await journeyAdminDenial(row.userId);
  if (denial) return { denied: denial };
  touchToken(row.id).catch((err) => console.error("[mcp] touch oauth token:", err instanceof Error ? err.message : err));
  const client = await getClient(row.clientId);
  return {
    caller: {
      kind: "oauth",
      id: row.id,
      label: `oauth:${(client?.clientName ?? row.clientId.slice(0, 16)).replace(/\s+/g, "_")}/user:${row.userId}`,
    },
  };
}

const registrationSchema = z.object({
  client_name: z.string().max(200).optional(),
  client_uri: z.string().url().max(500).optional(),
  redirect_uris: z.array(z.string().max(500)).min(1).max(10),
  grant_types: z.array(z.string().max(60)).max(10).optional(),
  response_types: z.array(z.string().max(60)).max(10).optional(),
  scope: z.string().max(300).optional(),
  token_endpoint_auth_method: z.enum(["none", "client_secret_post", "client_secret_basic"]).optional(),
});

/** Client credentials from HTTP Basic or the form body. */
function clientAuthOf(req: Request): { clientId?: string; clientSecret?: string } {
  const header = req.headers.authorization;
  if (header?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep > -1) {
      try {
        return { clientId: decodeURIComponent(decoded.slice(0, sep)), clientSecret: decodeURIComponent(decoded.slice(sep + 1)) };
      } catch {
        return {};
      }
    }
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return { clientId: str(body.client_id), clientSecret: str(body.client_secret) };
}

export function createMcpOauthRouter(): Router {
  const router = Router();

  // ─── Discovery ──────────────────────────────────────────────────────────────
  // Fetched cross-origin before any token exists, so readable from anywhere.
  // Hosts probe both the bare and the /mcp-suffixed paths.
  const publicJson = (res: Response, body: unknown) =>
    res.set("Access-Control-Allow-Origin", "*").set("Cache-Control", "public, max-age=300").json(body);

  const resourceMetadata = (req: Request, res: Response) =>
    publicJson(res, {
      resource: getMcpResourceUrl(req),
      authorization_servers: [getBaseUrl(req)],
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "Xpot",
    });
  router.get("/.well-known/oauth-protected-resource", resourceMetadata);
  router.get("/.well-known/oauth-protected-resource/mcp", resourceMetadata);

  const serverMetadata = (req: Request, res: Response) => {
    const base = getBaseUrl(req);
    publicJson(res, {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      revocation_endpoint: `${base}/oauth/revoke`,
      scopes_supported: [...SUPPORTED_SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    });
  };
  router.get("/.well-known/oauth-authorization-server", serverMetadata);
  router.get("/.well-known/oauth-authorization-server/mcp", serverMetadata);

  // ─── Dynamic client registration (RFC 7591) ─────────────────────────────────
  // Open by necessity (hosts register before any user is involved). A
  // registration grants nothing until an admin approves the consent screen,
  // and its redirect URIs are pinned here and matched exactly later.
  router.post("/oauth/register", async (req, res) => {
    if (tooMany(req, "register", 20, 60 * 60_000)) return oauthError(res, 429, "slow_down", "Too many registrations; try again later");
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return oauthError(res, 400, "invalid_client_metadata", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const meta = parsed.data;
    const bad = meta.redirect_uris.find((uri) => !isAllowedRedirectUri(uri));
    if (bad) return oauthError(res, 400, "invalid_redirect_uri", `redirect_uri must be https (or http on loopback): ${bad}`);
    if (meta.grant_types?.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
      return oauthError(res, 400, "invalid_client_metadata", "Only authorization_code and refresh_token grants are supported");
    }

    const { client, clientSecret } = await registerClient({
      clientName: meta.client_name,
      clientUri: meta.client_uri,
      redirectUris: meta.redirect_uris,
      tokenEndpointAuthMethod: meta.token_endpoint_auth_method,
    });
    noStore(res);
    res.status(201).json({
      client_id: client.clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: normalizeScope(meta.scope),
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    });
  });

  // ─── Authorization ──────────────────────────────────────────────────────────
  router.get("/oauth/authorize", async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const clientId = str(q.client_id);
    const redirectUri = str(q.redirect_uri);
    const state = str(q.state);

    if (!clientId || !redirectUri) {
      return htmlPage(res, 400, renderErrorPage("Invalid request", "The authorization request is missing client_id or redirect_uri."));
    }
    // Until redirect_uri is proven registered, never redirect: that is how
    // this endpoint would become an open redirector.
    const client = await getClient(clientId);
    if (!client || !client.redirectUris.includes(redirectUri)) {
      return htmlPage(
        res,
        400,
        renderErrorPage(
          "App not recognised",
          "That client_id does not exist, or the redirect URL is not registered for it.",
          "Remove the Xpot connector in the AI app and add it again.",
        ),
      );
    }

    const back = (error: string, description: string) => {
      const url = new URL(redirectUri);
      url.searchParams.set("error", error);
      url.searchParams.set("error_description", description);
      if (state) url.searchParams.set("state", state);
      noStore(res);
      return res.redirect(url.toString());
    };
    if ((str(q.response_type) ?? "code") !== "code") return back("unsupported_response_type", "Only the authorization code flow is supported");
    const codeChallenge = str(q.code_challenge);
    if (!codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) return back("invalid_request", "A PKCE S256 code_challenge is required");
    if ((str(q.code_challenge_method) ?? "plain") !== "S256") return back("invalid_request", "code_challenge_method must be S256");
    const resource = str(q.resource);
    if (resource && !isAcceptableResource(resource, req)) return back("invalid_target", "resource must be this server's MCP endpoint");

    // Not signed in: through the app's sign-in, then back to this exact URL.
    // The landing page only honours same-origin paths for `next`.
    if (!sessionOf(req).userId) {
      noStore(res);
      return res.redirect(`/?next=${encodeURIComponent(req.originalUrl)}`);
    }

    // Same identity as the admin pages (creates a global admin's rep profile
    // on first use); a non-admin learns why instead of bouncing back silently.
    const found = await ensureXpotRep(req);
    const denial = found ? await journeyAdminDenial(found.user.userId) : "Sign in again.";
    if (denial) return htmlPage(res, 403, renderErrorPage("Access not allowed", denial));

    // CSRF guard for the consent POST: one-time value kept in the session.
    const consentState = randomBytes(16).toString("base64url");
    (req.session as unknown as OauthSession).mcpConsentState = consentState;

    const scope = normalizeScope(str(q.scope));
    return htmlPage(
      res,
      200,
      renderConsentPage({
        clientName: client.clientName || "An MCP app",
        redirectHost: new URL(redirectUri).host || redirectUri,
        userLabel: found!.user.email || found!.rep.displayName || "your account",
        scopes: scope.split(" "),
        fields: {
          consent_state: consentState,
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state: state ?? "",
          code_challenge: codeChallenge,
          resource: resource ?? "",
        },
      }),
    );
  });

  router.post("/oauth/authorize", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const field = (name: string) => (typeof body[name] === "string" ? (body[name] as string) : "");
    const sess = sessionOf(req);
    if (!sess.userId) return htmlPage(res, 401, renderErrorPage("Session expired", "Sign in to Xpot again and restart the connection."));
    if (!field("consent_state") || field("consent_state") !== sess.mcpConsentState) {
      return htmlPage(res, 400, renderErrorPage("Request expired", "This authorization form is no longer valid. Restart the connection."));
    }
    // One-shot, whatever the decision.
    (req.session as unknown as OauthSession).mcpConsentState = undefined;

    const clientId = field("client_id");
    const redirectUri = field("redirect_uri");
    const client = clientId ? await getClient(clientId) : undefined;
    if (!client || !client.redirectUris.includes(redirectUri)) {
      return htmlPage(res, 400, renderErrorPage("App not recognised", "The redirect URL does not match the registered app."));
    }

    const url = new URL(redirectUri);
    if (field("state")) url.searchParams.set("state", field("state"));
    noStore(res);
    if (field("decision") !== "allow") {
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("error_description", "The user denied the request");
      return res.redirect(url.toString());
    }
    const denial = await journeyAdminDenial(sess.userId);
    if (denial) return htmlPage(res, 403, renderErrorPage("Access not allowed", denial));
    // The hidden fields were checked on GET, but the form is the browser's to edit.
    const failBack = (error: string, description: string) => {
      url.searchParams.set("error", error);
      url.searchParams.set("error_description", description);
      return res.redirect(url.toString());
    };
    if (!/^[A-Za-z0-9_-]{43}$/.test(field("code_challenge"))) return failBack("invalid_request", "A PKCE S256 code_challenge is required");
    if (field("resource") && !isAcceptableResource(field("resource"), req)) return failBack("invalid_target", "resource must be this server's MCP endpoint");

    const code = await createAuthCode({
      clientId,
      userId: sess.userId,
      redirectUri,
      scope: normalizeScope(field("scope")),
      resource: field("resource") || getMcpResourceUrl(req),
      codeChallenge: field("code_challenge"),
    });
    url.searchParams.set("code", code);
    return res.redirect(url.toString());
  });

  // ─── Token ──────────────────────────────────────────────────────────────────
  router.post("/oauth/token", async (req, res) => {
    if (tooMany(req, "token", 60, 60_000)) return oauthError(res, 429, "slow_down", "Too many requests; try again shortly");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const field = (name: string) => (typeof body[name] === "string" ? (body[name] as string) : undefined);
    const { clientId, clientSecret } = clientAuthOf(req);
    if (!clientId) return oauthError(res, 400, "invalid_client", "client_id is required");
    const client = await getClient(clientId);
    if (!client) return oauthError(res, 401, "invalid_client", "Unknown client");
    if (!clientSecretMatches(client, clientSecret)) return oauthError(res, 401, "invalid_client", "Client authentication failed");

    const grantType = field("grant_type");
    if (grantType === "authorization_code") {
      const code = field("code");
      const verifier = field("code_verifier");
      if (!code) return oauthError(res, 400, "invalid_request", "code is required");
      if (!verifier) return oauthError(res, 400, "invalid_request", "code_verifier is required");
      const authCode = await consumeAuthCode(code);
      if (!authCode) return oauthError(res, 400, "invalid_grant", "Authorization code is invalid or already used");
      if (authCode.expiresAt.getTime() <= Date.now()) return oauthError(res, 400, "invalid_grant", "Authorization code expired");
      if (authCode.clientId !== clientId) return oauthError(res, 400, "invalid_grant", "Authorization code was issued to another client");
      if (field("redirect_uri") && field("redirect_uri") !== authCode.redirectUri) {
        return oauthError(res, 400, "invalid_grant", "redirect_uri does not match the authorization request");
      }
      if (!verifyPkce(verifier, authCode.codeChallenge)) return oauthError(res, 400, "invalid_grant", "PKCE verification failed");
      const resource = field("resource");
      if (resource && !isAcceptableResource(resource, req)) return oauthError(res, 400, "invalid_target", "resource does not match this MCP server");

      const tokens = await issueTokens({ clientId, userId: authCode.userId, scope: authCode.scope, resource: authCode.resource });
      pruneExpired().catch((err) => console.error("[mcp] oauth prune:", err instanceof Error ? err.message : err));
      noStore(res);
      return res.json({
        access_token: tokens.accessToken,
        token_type: "Bearer",
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        scope: tokens.scope,
      });
    }

    if (grantType === "refresh_token") {
      const refresh = field("refresh_token");
      if (!refresh) return oauthError(res, 400, "invalid_request", "refresh_token is required");
      const existing = await findLiveToken(refresh, "refresh");
      if (!existing) return oauthError(res, 400, "invalid_grant", "Refresh token is invalid, expired or revoked");
      if (existing.clientId !== clientId) return oauthError(res, 400, "invalid_grant", "Refresh token was issued to another client");
      const denial = await journeyAdminDenial(existing.userId);
      if (denial) return oauthError(res, 400, "invalid_grant", denial);
      const tokens = await rotateRefreshToken(existing);
      if (!tokens) return oauthError(res, 400, "invalid_grant", "Refresh token was already used");
      noStore(res);
      return res.json({
        access_token: tokens.accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        refresh_token: tokens.refreshToken,
        scope: tokens.scope,
      });
    }

    return oauthError(res, 400, "unsupported_grant_type", `grant_type ${grantType ?? "(missing)"} is not supported`);
  });

  // RFC 7009: revoking an unknown token is a success.
  router.post("/oauth/revoke", async (req, res) => {
    const token = (req.body as Record<string, unknown> | undefined)?.token;
    if (typeof token === "string" && token) await revokeToken(token);
    noStore(res);
    res.status(200).json({});
  });

  return router;
}
