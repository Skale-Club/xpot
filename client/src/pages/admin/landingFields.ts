// The label of every editable landing-page field, from its path in
// LandingPageContent ("faq.items.2.answer"). The editor shows `field` inside its
// section; a refused publish names `section › field` (the server's error paths
// are the same paths).

import type { landingAdminMessages } from "@/i18n/messages/landingAdmin";

type Key = keyof typeof landingAdminMessages.en;
type T = (key: Key, vars?: Record<string, string | number>) => string;

export const LANDING_SECTIONS = ["navigation", "hero", "audience", "how", "tools", "faq", "cta", "footer"] as const;
export type LandingSection = (typeof LANDING_SECTIONS)[number];

/** Which editor section a top-level key is shown in (account sits with the menu, mockup with the hero). */
const SECTION_OF: Record<string, LandingSection> = {
  navigation: "navigation",
  account: "navigation",
  hero: "hero",
  mockup: "hero",
  audience: "audience",
  how: "how",
  tools: "tools",
  faq: "faq",
  cta: "cta",
  footer: "footer",
};

const CARD_FIELD: Record<string, Key> = { title: "cardTitle", body: "cardText", imageUrl: "cardImage" };
const CTA_FIELD: Record<string, Key> = { title: "ctaTitle", body: "ctaText", button: "ctaButton" };

export function landingField(path: string, t: T): { section: string; field: string } | null {
  const parts = path.split(".");
  const [group, key] = parts;
  const section = SECTION_OF[group];
  if (!section) return null;
  const n = (index: string | undefined) => Number(index) + 1;
  let field: string | null = null;

  if (group === "navigation" || group === "account" || group === "hero" || group === "mockup" || group === "footer") {
    const flat = `${group}_${key}` as Key;
    field = key ? t(flat) : null;
    if (field === flat) field = null;
  } else if ((group === "audience" || group === "how" || group === "faq") && (key === "title" || key === "subtitle")) {
    field = t(key === "title" ? "sectionTitle" : "sectionText");
  } else if (group === "audience" && key === "cards" && parts[3] && CARD_FIELD[parts[3]]) {
    field = t(CARD_FIELD[parts[3]], { number: n(parts[2]) });
  } else if (group === "tools" && key === "cards" && parts[3] === "title") {
    field = t("cardTitle", { number: n(parts[2]) });
  } else if (group === "tools" && key === "cards" && parts[3] === "items" && parts[4] !== undefined) {
    field = t("cardPoint", { number: n(parts[2]), point: n(parts[4]) });
  } else if (group === "faq" && key === "items" && (parts[3] === "question" || parts[3] === "answer")) {
    field = t(parts[3] === "question" ? "faqQuestion" : "faqAnswer", { number: n(parts[2]) });
  } else if (group === "cta" && CTA_FIELD[key]) {
    field = t(CTA_FIELD[key]);
  }

  return field ? { section: t(`section_${section}`), field } : null;
}

/** "Section › Field", for an error that points at a field. */
export function landingFieldLabel(path: string, t: T): string | null {
  const found = landingField(path, t);
  return found ? `${found.section} › ${found.field}` : null;
}
