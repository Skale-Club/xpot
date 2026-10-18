-- A refused sign-up is blocked like an ended partnership; People told the two
-- apart by the block reason ("Sign-up refused: ..."), so a refusal whose text
-- did not start with it was listed as Blocked. refused_at marks a refusal
-- explicitly (server/routes/xpot/resellerAccounts.ts sets it on refuse and
-- clears it on unblock).
ALTER TABLE sales_reps ADD COLUMN IF NOT EXISTS refused_at TIMESTAMPTZ;

-- Refusals made before the marker: their reason starts with one of the default
-- refusal texts the screen stored, in the admin's language (shared/repAccess.ts).
-- blocked_at is a UTC timestamp without a zone.
UPDATE sales_reps
SET refused_at = blocked_at AT TIME ZONE 'UTC'
WHERE refused_at IS NULL
  AND blocked_at IS NOT NULL
  AND (
    btrim(blocked_reason) IN ('Sign-up refused', 'Cadastro recusado', 'Registro rechazado')
    OR btrim(blocked_reason) LIKE 'Sign-up refused:%'
    OR btrim(blocked_reason) LIKE 'Cadastro recusado:%'
    OR btrim(blocked_reason) LIKE 'Registro rechazado:%'
  );
