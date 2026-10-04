// MCP access tokens (server/mcp). SQL: migrations/0015_mcp_tokens.sql.
// Only the SHA-256 hash of a token is stored; the secret is shown once.

import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
