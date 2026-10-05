// TypeScript already makes every dictionary carry the same keys in EN/PT/ES. What it cannot see
// is the text inside: a translation that drops or renames a {placeholder} shows the raw "{name}"
// on screen, and a plural with only one of its _one/_other forms prints the key itself.

import { describe, expect, it } from "vitest";

type Dict = { en: Record<string, string>; pt: Record<string, string>; es: Record<string, string> };

const modules = import.meta.glob<Record<string, unknown>>("../client/src/i18n/messages/*.ts", { eager: true });

const dictionaries = Object.entries(modules).flatMap(([path, mod]) =>
  Object.entries(mod)
    .filter(([name, value]) => name.endsWith("Messages") && value && typeof value === "object" && "en" in value)
    .map(([name, value]) => ({ file: path.split("/").pop()!, name, dict: value as Dict })),
);

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n dictionaries", () => {
  it("are all found", () => {
    expect(dictionaries.length).toBeGreaterThan(10);
  });

  for (const { file, name, dict } of dictionaries) {
    describe(`${file} › ${name}`, () => {
      it("keeps the same placeholders in every language", () => {
        const mismatches: string[] = [];
        for (const [key, en] of Object.entries(dict.en)) {
          for (const lang of ["pt", "es"] as const) {
            const other = dict[lang][key];
            if (other === undefined) continue; // TypeScript reports missing keys
            if (placeholders(other).join() !== placeholders(en).join()) mismatches.push(`${lang}.${key}: "${other}"`);
          }
        }
        expect(mismatches).toEqual([]);
      });

      it("has both forms of every plural", () => {
        const keys = new Set(Object.keys(dict.en));
        const orphans = [...keys]
          .filter((k) => /_(one|other)$/.test(k))
          .filter((k) => !keys.has(k.replace(/_(one|other)$/, k.endsWith("_one") ? "_other" : "_one")));
        expect(orphans).toEqual([]);
      });

      it("has no empty translations", () => {
        const empty = (["en", "pt", "es"] as const).flatMap((lang) =>
          Object.entries(dict[lang])
            .filter(([, v]) => typeof v !== "string" || v.trim() === "")
            .map(([k]) => `${lang}.${k}`),
        );
        expect(empty).toEqual([]);
      });
    });
  }
});
