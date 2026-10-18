// The landing editor labels every field in the admin's language (no raw keys),
// and a refused publish names the field the server pointed at.

import { describe, expect, it } from "vitest";
import { interpolate, LANGS } from "../client/src/i18n";
import { landingAdminMessages } from "../client/src/i18n/messages/landingAdmin";
import { defaultLandingContent } from "../client/src/lib/landingContent";
import { landingField, landingFieldLabel } from "../client/src/pages/admin/landingFields";
import { landingPageContentSchema } from "../shared/landingContent";
import { fieldErrors } from "../server/lib/validation";

const tFor = (lang: (typeof LANGS)[number]) => (key: string, vars?: Record<string, string | number>) =>
  interpolate((landingAdminMessages[lang] as Record<string, string>)[key] ?? key, vars);

/** Every editable text's path in the content, e.g. "tools.cards.1.items.3". */
function stringPaths(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (Array.isArray(node)) return node.flatMap((item, i) => stringPaths(item, `${prefix}.${i}`));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => (key === "id" ? [] : stringPaths(value, prefix ? `${prefix}.${key}` : key)));
  }
  return [];
}

describe("landing editor labels", () => {
  const paths = stringPaths(defaultLandingContent("en"));

  it("cover every field, in every language", () => {
    expect(paths.length).toBeGreaterThan(60);
    for (const lang of LANGS) {
      const t = tFor(lang);
      const missing = paths.filter((path) => {
        const found = landingField(path, t as never);
        // A raw key ("hero_badge") or an unfilled placeholder; {year} is meant literally (the copyright line).
        return !found || /[a-z]+_[a-zA-Z]+/.test(found.field) || /\{(?!year\})/.test(found.field);
      });
      expect(missing, lang).toEqual([]);
    }
  });

  it("number cards, points and questions from 1", () => {
    const t = tFor("en") as never;
    expect(landingField("tools.cards.1.items.3", t)).toEqual({ section: "Selling tools", field: "Card 2: point 4" });
    expect(landingField("faq.items.0.answer", t)?.field).toBe("Answer 1");
    expect(landingField("mockup.atDoor", t)?.section).toBe("Top section and phone preview");
    expect(landingField("nonsense.x", t)).toBeNull();
    expect(landingField("hero.unknown", t)).toBeNull();
  });

  it("name the field a refused publish points at", () => {
    const content = structuredClone(defaultLandingContent("pt"));
    content.faq.items[2].answer = "   ";
    content.hero.titleLine1 = "x".repeat(200);
    const result = landingPageContentSchema.safeParse(content);
    expect(result.success).toBe(false);
    const errors = fieldErrors((result as { error: any }).error);
    const t = tFor("pt") as never;
    expect(errors.map((e) => landingFieldLabel(e.path, t))).toEqual([
      "Seção do topo e prévia no celular › Título, primeira linha",
      "Perguntas frequentes › Resposta 3",
    ]);
    expect(errors.map((e) => e.code)).toEqual(["too_long", "required"]);
  });
});
