import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { registerTagJourneyTools } from "./tools/tagJourney.js";
import { registerProspectingTools } from "./tools/prospecting.js";
import { registerTaskTools } from "./tools/tasks.js";

/** What a request was authorised with, for the call log. */
export interface McpCaller {
  /** A static admin token (mcp_tokens) or an OAuth access token (mcp_oauth_tokens). */
  kind: "token" | "oauth";
  id: string;
  /** Token prefix, or "oauth:<client>/user:<id>"; never the secret. */
  label: string;
  /** Xpot user that created/authorized the credential; null only for legacy static tokens. */
  userId: string | null;
  /** Tool families granted to this credential. Static admin tokens receive both. */
  scopes: string[];
}

function buildMcpServer(caller: McpCaller): McpServer {
  const server = new McpServer({ name: "xpot", version: "1.0.0" });
  if (caller.scopes.includes("xpot:journey")) registerTagJourneyTools(server, caller);
  if (caller.scopes.includes("xpot:prospecting")) registerProspectingTools(server, caller);
  if (caller.scopes.includes("xpot:tasks")) registerTaskTools(server, caller);
  return server;
}

/**
 * Stateless Streamable HTTP: a fresh server + transport per request, nothing
 * kept between calls (no session ids), so any instance can answer any call.
 */
export async function handleMcpRequest(req: Request, res: Response, caller: McpCaller) {
  const mcpServer = buildMcpServer(caller);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    mcpServer.close();
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
