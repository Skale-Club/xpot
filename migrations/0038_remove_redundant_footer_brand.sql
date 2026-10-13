-- The footer now renders the Xpot mark and wordmark separately, so saved
-- landing copy should contain only the localized tagline.

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{footer,tagline}', '"Your route to extra income."'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" = 'en';

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{footer,tagline}', '"Sua rota para uma renda extra."'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" = 'pt';

UPDATE "landing_page_contents"
SET "content" = jsonb_set("content", '{footer,tagline}', '"Tu ruta hacia ingresos extra."'::jsonb, true),
    "updated_at" = NOW()
WHERE "locale" = 'es';
