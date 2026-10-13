import { describe, expect, it } from "vitest";
import { defaultLandingContent } from "../client/src/lib/landingContent";
import { LANDING_LOCALES, landingPageContentSchema } from "../shared/landingContent";

describe("landing page content", () => {
  it("ships a complete, publishable fallback for every supported language", () => {
    for (const locale of LANDING_LOCALES) {
      const content = defaultLandingContent(locale);
      expect(landingPageContentSchema.safeParse(content).success, locale).toBe(true);
      expect(content.audience.cards).toHaveLength(3);
      expect(content.tools.cards).toHaveLength(4);
      expect(content.footer.tagline).not.toMatch(/^Xpot\b/i);
      expect(content.account.welcomeTitle).toBe("Xpot");
      expect(content.faq.items.length).toBeGreaterThanOrEqual(5);
      expect(new Set(content.faq.items.map((item) => item.id)).size).toBe(content.faq.items.length);
      expect(JSON.stringify(content)).not.toMatch(/\b(?:Skale|CRM|Xphere|GoHighLevel|manager|managers|gestor|gestores|gerente|gerentes|distributor|distributors|distribuidor|distribuidores)\b/i);
    }
  });
});
