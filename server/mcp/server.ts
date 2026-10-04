import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { registerTagJourneyTools } from "./tools/tagJourney.js";

/** What a request was authorised with, for the call log. */
export interface McpCaller {
  /** A static admin token (mcp_tokens) or an OAuth access token (mcp_oauth_tokens). */
  kind: "token" | "oauth";
  id: string;
  /** Token prefix, or "oauth:<client>/user:<id>"; never the secret. */
  label: string;
}

function buildMcpServer(caller: McpCaller): McpServer {
  const server = new McpServer({ name: "xpot", version: "1.0.0" });
  registerTagJourneyTools(server, caller);
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
