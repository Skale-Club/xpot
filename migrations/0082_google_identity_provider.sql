-- Google and phone sign in on their own; Settings shows which Google account is linked.
-- Rows written before this migration have no provider; the next sign-in fills it.
ALTER TABLE auth_google_identities ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE auth_google_identities ADD COLUMN IF NOT EXISTS email text;
