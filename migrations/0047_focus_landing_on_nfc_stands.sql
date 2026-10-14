-- Show the physical stand that sellers offer and remove keychain/display copy
-- from the public landing-page workflow.

UPDATE "landing_page_contents"
SET
  "content" = jsonb_set(
    "content",
    '{tools,cards,3}',
    '{"title":"Offer QR and NFC stands","items":["Counter stands and table plaques with QR and NFC","Point each stand to Google reviews, Instagram or any link","Write and verify the NFC chip from the phone","Track scans by stand and by customer"]}'::jsonb,
    true
  ),
  "updated_at" = NOW()
WHERE "locale" = 'en';

UPDATE "landing_page_contents"
SET
  "content" = jsonb_set(
    "content",
    '{tools,cards,3}',
    '{"title":"Ofereça stands com QR e NFC","items":["Stands de balcão e placas de mesa com QR e NFC","Direcione cada stand para avaliações no Google, Instagram ou qualquer link","Grave e confira o chip NFC pelo próprio celular","Acompanhe as leituras por stand e por cliente"]}'::jsonb,
    true
  ),
  "updated_at" = NOW()
WHERE "locale" = 'pt';

UPDATE "landing_page_contents"
SET
  "content" = jsonb_set(
    "content",
    '{tools,cards,3}',
    '{"title":"Ofrece soportes con QR y NFC","items":["Soportes de mostrador y placas de mesa con QR y NFC","Dirige cada soporte a reseñas de Google, Instagram o cualquier enlace","Graba y verifica el chip NFC desde el teléfono","Sigue las lecturas por soporte y por cliente"]}'::jsonb,
    true
  ),
  "updated_at" = NOW()
WHERE "locale" = 'es';
