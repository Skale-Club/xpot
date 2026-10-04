-- OAuth 2.1 for the MCP endpoint (server/mcp/oauth.ts), next to the static
-- admin tokens of 0015. Claude, ChatGPT and other remote MCP hosts cannot
-- take a pasted bearer token: they discover /.well-known/*, register
-- themselves (RFC 7591), send the user through a consent screen and get an
-- access + refresh token pair bound to that user.
--
--   mcp_oauth_clients — one row per self-registered client. Registration on
--     its own grants nothing; access starts when a signed-in admin approves.
--   mcp_oauth_codes   — single-use PKCE authorization codes, 1 minute.
--   mcp_oauth_tokens  — access (1 hour) and refresh (90 days) tokens.
--
-- Codes, tokens and client secrets are stored as SHA-256 hashes only.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" text NOT NULL,
  -- NULL for public clients (PKCE, token_endpoint_auth_method 'none'): what
  -- Claude and ChatGPT register as.
  "client_secret_hash" text,
  "client_name" text,
  "client_uri" text,
  "redirect_uris" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "token_endpoint_auth_method" text NOT NULL DEFAULT 'none',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_clients_client_id_unique" ON "mcp_oauth_clients" ("client_id");

CREATE TABLE IF NOT EXISTS "mcp_oauth_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code_hash" text NOT NULL,
  "client_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redirect_uri" text NOT NULL,
  "scope" text NOT NULL,
  -- RFC 8707 resource the code was requested for; its tokens are bound to it.
  "resource" text,
  "code_challenge" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_codes_code_hash_unique" ON "mcp_oauth_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "mcp_oauth_codes_expires_idx" ON "mcp_oauth_codes" ("expires_at");

CREATE TABLE IF NOT EXISTS "mcp_oauth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash" text NOT NULL,
  -- 'access' | 'refresh'
  "kind" text NOT NULL,
  "client_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scope" text NOT NULL,
  "resource" text,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "last_used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_tokens_token_hash_unique" ON "mcp_oauth_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "mcp_oauth_tokens_client_user_idx" ON "mcp_oauth_tokens" ("client_id", "user_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_tokens_expires_idx" ON "mcp_oauth_tokens" ("expires_at");

-- Same lockdown as the other tables (0009): RLS on with no policies blocks
-- direct anon access; the app connects as the owner and is unaffected.
ALTER TABLE "mcp_oauth_clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_oauth_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_oauth_tokens" ENABLE ROW LEVEL SECURITY;
