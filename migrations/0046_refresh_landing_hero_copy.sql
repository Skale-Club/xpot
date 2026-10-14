-- Lead the hero with seller autonomy and earnings. Product purchasing is an
-- operational detail, not the primary value proposition.

UPDATE "landing_page_contents"
SET
  "content" = jsonb_set(
    jsonb_set(
      jsonb_set(
        "content",
        '{hero,badge}',
        to_jsonb('Sell on your time. Earn on your terms.'::text),
        true
      ),
      '{hero,body}',
      to_jsonb('Choose when and where to sell. Xpot helps you find nearby businesses, plan efficient routes, manage every visit and keep track of your sales and earnings.'::text),
      true
    ),
    '{hero,accessNote}',
    to_jsonb('Create your account today. Once approved, you can start selling on your schedule.'::text),
    true
  ),
  "updated_at" = NOW()
WHERE "locale" = 'en';

UPDATE "landing_page_contents"
SET
  "content" = jsonb_set(
    jsonb_set(
      jsonb_set(
        "content",
        '{hero,badge}',
        to_jsonb('Venda no seu tempo. Ganhe do seu jeito.'::text),
        true
      ),
      '{hero,body}',
      to_jsonb('Escolha quando e onde vender. O Xpot ajuda você a encontrar comércios próximos, planejar rotas eficientes, organizar cada visita e acompanhar suas vendas e ganhos.'::text),
      true
    ),
    '{hero,accessNote}',
    to_jsonb('Crie sua conta hoje. Depois da aprovação, você pode começar a vender no seu ritmo.'::text),
    true
  ),
  "updated_at" = NOW()
WHERE "locale" = 'pt';

UPDATE "landing_page_contents"
SET
  "content" = jsonb_set(
    jsonb_set(
      jsonb_set(
        "content",
        '{hero,badge}',
        to_jsonb('Vende a tu ritmo. Gana a tu manera.'::text),
        true
      ),
      '{hero,body}',
      to_jsonb('Elige cuándo y dónde vender. Xpot te ayuda a encontrar comercios cercanos, planificar rutas eficientes, organizar cada visita y seguir tus ventas y ganancias.'::text),
      true
    ),
    '{hero,accessNote}',
    to_jsonb('Crea tu cuenta hoy. Después de la aprobación, puedes empezar a vender a tu ritmo.'::text),
    true
  ),
  "updated_at" = NOW()
WHERE "locale" = 'es';
