-- Groq (voice) and Gemini (AI text) used to run whenever a key was saved,
-- whatever their switch in Admin › Integrations said. The switch is honoured
-- now (server/lib/providerChoice.ts); turn it on where a key is saved so
-- nothing that worked yesterday stops today. The panel then tells the truth.
UPDATE chat_integrations
SET enabled = true,
    updated_at = NOW()
WHERE provider IN ('groq', 'gemini')
  AND api_key IS NOT NULL
  AND btrim(api_key) <> ''
  AND enabled IS DISTINCT FROM true;
