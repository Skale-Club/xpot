-- Provider IDs are independent from existing application user IDs.
CREATE TABLE IF NOT EXISTS auth_google_identities (
  project_id text NOT NULL,
  subject text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, subject)
);
CREATE INDEX IF NOT EXISTS auth_google_identities_user ON auth_google_identities(user_id);
