// MCP access (server/mcp). Two ways in, both stored as SHA-256 hashes only:
//   - mcp_tokens: static tokens an admin creates and pastes into a client
//     (migrations/0015_mcp_tokens.sql); the secret is shown once.
//   - mcp_oauth_*: OAuth 2.1 for hosts that connect themselves (Claude,
//     ChatGPT), bound to the admin who approved (migrations/0018_mcp_oauth.sql).

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const mcpTokens = pgTable("mcp_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => ({
  hashIdx: uniqueIndex("mcp_tokens_token_hash_unique").on(table.tokenHash),
}));

export type McpToken = typeof mcpTokens.$inferSelect;

export const mcpOauthClients = pgTable("mcp_oauth_clients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id").notNull(),
  clientSecretHash: text("client_secret_hash"),
  clientName: text("client_name"),
  clientUri: text("client_uri"),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull().default([]),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientIdIdx: uniqueIndex("mcp_oauth_clients_client_id_unique").on(table.clientId),
}));

export type McpOauthClient = typeof mcpOauthClients.$inferSelect;

export const mcpOauthCodes = pgTable("mcp_oauth_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  codeHash: text("code_hash").notNull(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  scope: text("scope").notNull(),
  resource: text("resource"),
  codeChallenge: text("code_challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  hashIdx: uniqueIndex("mcp_oauth_codes_code_hash_unique").on(table.codeHash),
  expiresIdx: index("mcp_oauth_codes_expires_idx").on(table.expiresAt),
}));

export type McpOauthCode = typeof mcpOauthCodes.$inferSelect;

export type McpOauthTokenKind = "access" | "refresh";

export const mcpOauthTokens = pgTable("mcp_oauth_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text("token_hash").notNull(),
  kind: text("kind").$type<McpOauthTokenKind>().notNull(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  scope: text("scope").notNull(),
  resource: text("resource"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  hashIdx: uniqueIndex("mcp_oauth_tokens_token_hash_unique").on(table.tokenHash),
  clientUserIdx: index("mcp_oauth_tokens_client_user_idx").on(table.clientId, table.userId),
  expiresIdx: index("mcp_oauth_tokens_expires_idx").on(table.expiresAt),
}));

export type McpOauthToken = typeof mcpOauthTokens.$inferSelect;
