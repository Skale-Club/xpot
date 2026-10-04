-- Xpot MCP access tokens: bearer tokens an AI session (Claude Code, Cowork)
-- uses on POST /mcp to read and write the Tags Journey. Only the SHA-256 hash
-- of a token is stored; the secret (xpot_mcp_...) is shown once, when an admin
-- creates it. token_prefix is the first characters, for recognising a token
-- in the admin list. Revoking sets revoked_at; the row stays for the record.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS "mcp_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "token_prefix" text NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz,
  "revoked_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tokens_token_hash_unique" ON "mcp_tokens" ("token_hash");

-- Same lockdown as the other tables (0009): RLS on with no policies blocks
-- direct anon access; the app connects as the owner and is unaffected.
ALTER TABLE "mcp_tokens" ENABLE ROW LEVEL SECURITY;
