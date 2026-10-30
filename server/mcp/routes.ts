import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { PRINT_PREVIEW_CONTENT_TYPE, PRINT_PREVIEW_MAX_BYTES } from "#shared/printProduction.js";
import { requireTagAdmin } from "../tags/access.js";
import { TagError } from "../tags/errors.js";
import * as production from "../tags/production.js";
import { authenticateOauthAccess, createMcpOauthRouter, protectedResourceMetadataUrl } from "./oauth.js";
import { listConnections, looksLikeOauthAccessToken, revokeClientTokens } from "./oauthStore.js";
import { handleMcpRequest, type McpCaller } from "./server.js";
import { MCP_TOKEN_SCOPES } from "#shared/tagsApi.js";
import { bearerSecret, createMcpToken, findActiveMcpToken, looksLikeMcpSecret, listMcpTokens, revokeMcpToken, touchMcpToken } from "./tokens.js";

// POST /mcp (the MCP endpoint), the OAuth server that lets hosts connect to it
// (/.well-known/*, /oauth/*), and the admin API for both kinds of access:
// static tokens (/api/xpot/admin/mcp-tokens*) and OAuth connections
// (/api/xpot/admin/mcp-connections*). Registered before the Xpot routers (see
// server/routes.ts), whose admin router guards every path it sees.

const tokenCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
}).strict();

function userIdOf(req: Request): string | null {
  return (req.session as { userId?: string } | undefined)?.userId ?? null;
}

function fail(res: Response, err: unknown, fallback: string) {
  if (err instanceof TagError) return res.status(err.status).json({ message: err.message });
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: err.issues[0]?.message ?? "Validation error", errors: err.errors });
  }
  console.error(`[mcp] ${fallback}:`, err);
  return res.status(500).json({ message: fallback });
}

/**
 * Permissive CORS on /mcp. Claude and ChatGPT call from their backends, but
 * browser clients (MCP Inspector) preflight and need the challenge header
 * exposed to start the OAuth flow. Credentials are bearer tokens, never cookies.
 */
function mcpCors(req: Request, res: Response, next: NextFunction) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Protocol-Version, Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  });
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

const clientIdParam = z.string().regex(/^xpot_client_[A-Za-z0-9_-]{43}$/);

export function registerMcpRoutes(app: Express) {
  app.use(createMcpOauthRouter());

  const tokens = "/api/xpot/admin/mcp-tokens";

  app.get(tokens, requireTagAdmin, async (_req, res) => {
    try {
      res.json(await listMcpTokens());
    } catch (err) {
      fail(res, err, "Failed to load tokens");
    }
  });

  // The secret is in this response only; the database keeps its hash.
  app.post(tokens, requireTagAdmin, async (req, res) => {
    try {
      const { name } = tokenCreateSchema.parse(req.body);
      res.status(201).json(await createMcpToken(name, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to create token");
    }
  });

  app.post(`${tokens}/:id/revoke`, requireTagAdmin, async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ message: "Not found" });
    try {
      res.json(await revokeMcpToken(id.data));
    } catch (err) {
      fail(res, err, "Failed to revoke token");
    }
  });

  // OAuth connections: apps that connected themselves, one row per client
  // and approving admin. Revoking cuts every token the client holds.
  const connections = "/api/xpot/admin/mcp-connections";

  app.get(connections, requireTagAdmin, async (_req, res) => {
    try {
      res.json(await listConnections());
    } catch (err) {
      fail(res, err, "Failed to load connections");
    }
  });

  app.post(`${connections}/:clientId/revoke`, requireTagAdmin, async (req, res) => {
    const clientId = clientIdParam.safeParse(req.params.clientId);
    if (!clientId.success) return res.status(404).json({ message: "Not found" });
    try {
      res.json({ revoked: await revokeClientTokens(clientId.data) });
    } catch (err) {
      fail(res, err, "Failed to revoke connection");
    }
  });

  // ─── MCP endpoint ───────────────────────────────────────────────────────────
  // Stateless: only POST carries a conversation. GET (a standalone SSE stream)
  // and DELETE (ending a session) have nothing to serve, so they answer 405.
  // A 401 carries resource_metadata (RFC 9728): that pointer is what makes
  // Claude / ChatGPT start the OAuth flow instead of failing.
  const unauthorized = (req: Request, res: Response, error: "invalid_request" | "invalid_token", message: string) =>
    res
      .set("WWW-Authenticate", `Bearer resource_metadata="${protectedResourceMetadataUrl(req)}", error="${error}"`)
      .status(401)
      .json({ message });

  /** The caller behind the request's bearer token (a static MCP token or an OAuth access token); null once answered. */
  async function callerOf(req: Request, res: Response): Promise<McpCaller | null> {
    const secret = bearerSecret(req.headers.authorization);
    if (!secret) {
      unauthorized(req, res, "invalid_request", "Authorization: Bearer <token> required");
      return null;
    }
    let caller: McpCaller | null = null;
    try {
      if (looksLikeMcpSecret(secret)) {
        const token = await findActiveMcpToken(secret);
        if (token) {
          caller = {
            kind: "token",
            id: token.id,
            label: token.tokenPrefix,
            userId: token.createdByUserId,
            scopes: [...MCP_TOKEN_SCOPES],
          };
          // Fire-and-forget: a failed timestamp must not fail the call.
          touchMcpToken(token.id).catch((err) => console.error("[mcp] touch token:", err instanceof Error ? err.message : err));
        }
      } else if (looksLikeOauthAccessToken(secret)) {
        const result = await authenticateOauthAccess(secret);
        if (result && "denied" in result) {
          res.status(403).json({ message: result.denied });
          return null;
        }
        caller = result?.caller ?? null;
      }
    } catch (err) {
      fail(res, err, "Failed to verify token");
      return null;
    }
    if (!caller) unauthorized(req, res, "invalid_token", "Invalid, expired or revoked MCP token");
    return caller;
  }

  // A version's 3D preview (print-pipeline/preview.py --upload): the one file that comes in with an MCP token,
  // as raw bytes over HTTP, because a GLB is far too big to pass inside a tool call. Print files still go up through
  // the bench only. ?version= picks a version (default the current one).
  app.post(
    "/mcp/print-preview/:model",
    express.raw({ type: ["application/octet-stream", PRINT_PREVIEW_CONTENT_TYPE], limit: PRINT_PREVIEW_MAX_BYTES }),
    async (req, res) => {
      const caller = await callerOf(req, res);
      if (!caller) return;
      try {
        if (!Buffer.isBuffer(req.body)) throw new TagError("Send the .glb as application/octet-stream", 415);
        const query = z.object({ version: z.string().uuid().optional() }).strict().parse(req.query);
        const model = req.params.model;
        const versionId = query.version ?? (await production.getModel(model)).currentVersion?.id;
        if (!versionId) throw new TagError("This model has no current version", 409);
        const body = new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength);
        const updated = await production.attachVersionPreview(model, versionId, `${model}-preview.glb`, body, caller.userId);
        console.log(`[mcp] print-preview caller=${caller.label} ${model} v${updated.version} ${body.byteLength} B`);
        res.status(201).json({ model, version: updated.version, versionId: updated.id, preview: updated.preview });
      } catch (err) {
        fail(res, err, "Failed to upload the 3D preview");
      }
    },
  );

  app.options("/mcp", mcpCors);

  app.post("/mcp", mcpCors, async (req, res) => {
    const caller = await callerOf(req, res);
    if (!caller) return;

    try {
      await handleMcpRequest(req, res, caller);
    } catch (err) {
      console.error("[mcp] request failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  app.all("/mcp", mcpCors, (_req, res) => {
    res.set("Allow", "POST").status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed: use POST" },
      id: null,
    });
  });
}
