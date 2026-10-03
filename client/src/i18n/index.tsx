// Tiny i18n for the Xpot app: English, Portuguese and Spanish.
//
// Messages live in one file per area (messages/<area>.ts), each exporting
// `{ en, pt, es }`. `en` is the source of truth; `pt` and `es` are typed as
// `Messages<typeof en>`, so TypeScript fails the build if a translation is
// missing or has a stray key. The language is chosen per device (Settings or
// the sign-in screen) and defaults to the phone's language.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const LANGS = ["en", "pt", "es"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = { en: "English", pt: "Português", es: "Español" };
export const LANG_SHORT: Record<Lang, string> = { en: "EN", pt: "PT", es: "ES" };

/** BCP 47 locale for dates, numbers and currency in each language. */
export const LOCALES: Record<Lang, string> = { en: "en-US", pt: "pt-BR", es: "es-US" };

/** Same keys as the English dictionary, every value a string. */
export type Messages<T> = { [K in keyof T]: string };
export type Dictionary<T extends Record<string, string>> = { en: T; pt: Messages<T>; es: Messages<T> };

const STORAGE_KEY = "xpot.lang";

function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/** The saved choice, else the first supported language the phone prefers, else English. */
export function detectLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Private mode / blocked storage: fall through to the phone's language.
  }
  const preferred = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const tag of preferred) {
    const base = tag?.toLowerCase().split("-")[0];
    if (isLang(base)) return base;
  }
  return "en";
}

/** Replaces {name} placeholders. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

interface I18nState {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = LOCALES[lang];
  }, [lang]);

  const value = useMemo(() => ({ lang, locale: LOCALES[lang], setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export interface Translate<T extends Record<string, string>> {
  (key: keyof T & string, vars?: Record<string, string | number>): string;
  /** `${key}_one` when count is 1, `${key}_other` otherwise; {count} is filled in. */
  plural(key: string, count: number, vars?: Record<string, string | number>): string;
  lang: Lang;
  locale: string;
}

/** `const t = useT(tagsMessages); t("save")`. */
export function useT<T extends Record<string, string>>(dict: Dictionary<T>): Translate<T> {
  const { lang, locale } = useI18n();
  return useMemo(() => {
    const table = dict[lang] as Record<string, string>;
    const fallback = dict.en as Record<string, string>;
    const lookup = (key: string) => table[key] ?? fallback[key] ?? key;
    const t = ((key: string, vars?: Record<string, string | number>) => interpolate(lookup(key), vars)) as Translate<T>;
    t.plural = (key, count, vars) => interpolate(lookup(`${key}_${count === 1 ? "one" : "other"}`), { count, ...vars });
    t.lang = lang;
    t.locale = locale;
    return t;
  }, [dict, lang, locale]);
}
