-- Foundational tables required by the rest of Xpot.
-- These mirror the corresponding tables in skaleclub so the same Supabase Auth
-- flow (signInWithPassword / signInWithOAuth) can be reused.
--
-- `users` is the destination-side mirror of Supabase Auth's `auth.users`.
-- On every server-side login, /api/auth/login upserts a row here keyed by the
-- Supabase user UUID. `salesReps.user_id` FK points at this table.
--
-- `sessions` is the Express session store consumed by connect-pg-simple.

-- Sessions table for connect-pg-simple
CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" TEXT PRIMARY KEY,
  "sess" JSONB NOT NULL,
  "expire" TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");

-- Users table (mirrored on every login from Supabase Auth)
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT UNIQUE,
  "first_name" TEXT,
  "last_name" TEXT,
  "profile_image_url" TEXT,
  "is_admin" BOOLEAN DEFAULT false,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- chat_integrations + integration_settings — kept compatible with the shape
-- skaleclub uses so the GHL helpers (which read these tables) work identically.
CREATE TABLE IF NOT EXISTS "chat_integrations" (
  "id" SERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL DEFAULT 'openai',
  "enabled" BOOLEAN DEFAULT false,
  "model" TEXT DEFAULT 'gpt-4o-mini',
  "presentation_model" TEXT,
  "api_key" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "integration_settings" (
  "id" SERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL DEFAULT 'gohighlevel',
  "api_key" TEXT,
  "location_id" TEXT,
  "calendar_id" TEXT DEFAULT '2irhr47AR6K0AQkFqEQl',
  "is_enabled" BOOLEAN DEFAULT false,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);
