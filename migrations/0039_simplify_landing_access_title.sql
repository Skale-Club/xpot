-- Keep the sign-in dialog direct and consistent with the public landing.

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{account,welcomeTitle}', '"Access Xpot"'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" = 'en';

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{account,welcomeTitle}', '"Acesse o Xpot"'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" = 'pt';

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{account,welcomeTitle}', '"Accede a Xpot"'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" = 'es';
