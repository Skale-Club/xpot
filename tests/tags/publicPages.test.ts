import { test } from "vitest";
import assert from "node:assert/strict";
import { pickTagPageLang, renderTagPage } from "../../server/tags/publicPages.js";

test("pickTagPageLang: follows the scanner's phone language, English otherwise", () => {
  assert.equal(pickTagPageLang("pt-BR,pt;q=0.9,en;q=0.8"), "pt");
  assert.equal(pickTagPageLang("es-US,es;q=0.9"), "es");
  assert.equal(pickTagPageLang("fr-FR,es;q=0.5"), "es");
  assert.equal(pickTagPageLang("en-US"), "en");
  assert.equal(pickTagPageLang("de-DE"), "en");
  assert.equal(pickTagPageLang(undefined), "en");
  assert.equal(pickTagPageLang("pt;q=0.2,es;q=0.8"), "es");
});

test("renderTagPage: localized copy, escaped values, Xpot brand", () => {
  const html = renderTagPage("inventory", { code: "A7K3P9X2", configureUrl: "/tags/t/A7K3P9X2", lang: "pt" });
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /Este Xpot está pronto para ganhar vida\./);
  assert.match(html, /Ativar esta peça/);
  assert.match(html, /Peça Xpot autêntica/);
  assert.match(html, /class="brand"/);
  assert.match(html, /Conhecer o Xpot/);
  assert.match(renderTagPage("assigned", { lang: "pt" }), /experiência está quase pronta/);
  assert.match(renderTagPage("not_found", { lang: "es" }), /No encontramos este Xpot\./);
  assert.match(renderTagPage("inventory", { code: "<b>" }), /&lt;b&gt;/);
});

test("renderTagPage: public inventory page is useful without exposing configuration", () => {
  const html = renderTagPage("inventory", { code: "A7K3P9X2", lang: "en" });
  assert.match(html, /Discover Xpot/);
  assert.match(html, /QR \+ NFC are ready/);
  assert.doesNotMatch(html, /Activate this piece/);
  assert.doesNotMatch(html, /\/tags\/t\/A7K3P9X2/);
});
