-- Keep the access-dialog introduction concise in every public language.

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{account,welcomeSub}', '"Sign in or create your account with your phone number."'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" = 'en';

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{account,welcomeSub}', '"Entre ou crie sua conta com o número do seu celular."'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" = 'pt';

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{account,welcomeSub}', '"Entra o crea tu cuenta con tu número de celular."'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" = 'es';
