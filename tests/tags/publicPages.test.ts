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
  const html = renderTagPage("inactive", { code: "A7K3P9X2", configureUrl: "/tags/t/A7K3P9X2", lang: "pt" });
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /Esta tag ainda não foi ativada\./);
  assert.match(html, /Configurar esta tag/);
  assert.match(html, /<div class="brand">Xpot<\/div>/);
  assert.match(renderTagPage("not_found", { lang: "es" }), /Etiqueta no encontrada\./);
  assert.match(renderTagPage("inactive", { code: "<b>" }), /&lt;b&gt;/);
});
