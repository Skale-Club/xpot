-- Position Xpot for independent sellers at any commitment level: a few
-- flexible hours, a growing sales routine, or full-time work. Update only the
-- affected marketing fields so unrelated copy edited in Admin stays intact.

UPDATE "landing_page_contents"
SET
  "content" = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    "content",
                    '{hero,badge}',
                    to_jsonb('Independent selling, organized by Xpot.'::text),
                    true
                  ),
                  '{hero,titleLine1}',
                  to_jsonb('Sell on your schedule.'::text),
                  true
                ),
                '{hero,titleLine2}',
                to_jsonb('Grow on your terms.'::text),
                true
              ),
              '{audience,subtitle}',
              to_jsonb('Sell a few hours a week or make it your full-time work — you choose how far you want to take it.'::text),
              true
            ),
            '{audience,cards,0,title}',
            to_jsonb('Build income your way'::text),
            true
          ),
          '{audience,cards,0,body}',
          to_jsonb('Start with the hours you have and grow your selling routine at the pace that works for you.'::text),
          true
        ),
        '{faq,items,0,answer}',
        to_jsonb('Xpot is for independent sellers who want flexible income, whether they sell a few hours a week or build a full-time sales business.'::text),
        true
      ),
      '{cta,title}',
      to_jsonb('Ready to build your sales business your way?'::text),
      true
    ),
    '{footer,tagline}',
    to_jsonb('Your route. Your business. Your way.'::text),
    true
  ),
  "updated_at" = NOW()
WHERE "locale" = 'en';

UPDATE "landing_page_contents"
SET
  "content" = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    "content",
                    '{hero,badge}',
                    to_jsonb('Vendas independentes, organizadas pelo Xpot.'::text),
                    true
                  ),
                  '{hero,titleLine1}',
                  to_jsonb('Venda no seu ritmo.'::text),
                  true
                ),
                '{hero,titleLine2}',
                to_jsonb('Cresça do seu jeito.'::text),
                true
              ),
              '{audience,subtitle}',
              to_jsonb('Venda algumas horas por semana ou faça disso sua atividade principal — você escolhe até onde quer chegar.'::text),
              true
            ),
            '{audience,cards,0,title}',
            to_jsonb('Construa sua renda do seu jeito'::text),
            true
          ),
          '{audience,cards,0,body}',
          to_jsonb('Comece com as horas que você tem e amplie sua rotina de vendas no ritmo que fizer sentido para você.'::text),
          true
        ),
        '{faq,items,0,answer}',
        to_jsonb('O Xpot é para vendedores independentes que buscam uma renda flexível, seja vendendo algumas horas por semana ou construindo um negócio em tempo integral.'::text),
        true
      ),
      '{cta,title}',
      to_jsonb('Pronto para construir seu negócio de vendas do seu jeito?'::text),
      true
    ),
    '{footer,tagline}',
    to_jsonb('Sua rota. Seu negócio. Seu ritmo.'::text),
    true
  ),
  "updated_at" = NOW()
WHERE "locale" = 'pt';

UPDATE "landing_page_contents"
SET
  "content" = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    "content",
                    '{hero,badge}',
                    to_jsonb('Ventas independientes, organizadas por Xpot.'::text),
                    true
                  ),
                  '{hero,titleLine1}',
                  to_jsonb('Vende a tu ritmo.'::text),
                  true
                ),
                '{hero,titleLine2}',
                to_jsonb('Crece a tu manera.'::text),
                true
              ),
              '{audience,subtitle}',
              to_jsonb('Vende unas horas por semana o haz de esto tu actividad principal: tú eliges hasta dónde quieres llegar.'::text),
              true
            ),
            '{audience,cards,0,title}',
            to_jsonb('Construye tus ingresos a tu manera'::text),
            true
          ),
          '{audience,cards,0,body}',
          to_jsonb('Empieza con las horas que tengas y amplía tu rutina de ventas al ritmo que tenga sentido para ti.'::text),
          true
        ),
        '{faq,items,0,answer}',
        to_jsonb('Xpot es para vendedores independientes que buscan ingresos flexibles, ya sea vendiendo unas horas por semana o construyendo un negocio a tiempo completo.'::text),
        true
      ),
      '{cta,title}',
      to_jsonb('¿Listo para construir tu negocio de ventas a tu manera?'::text),
      true
    ),
    '{footer,tagline}',
    to_jsonb('Tu ruta. Tu negocio. Tu ritmo.'::text),
    true
  ),
  "updated_at" = NOW()
WHERE "locale" = 'es';
