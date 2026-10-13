-- The access dialog uses the Xpot mark and wordmark as its only visible title.

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{account,welcomeTitle}', '"Xpot"'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" IN ('en', 'pt', 'es');
