import { describe, expect, it } from "vitest";
import { defaultLandingContent } from "../client/src/lib/landingContent";
import { LANDING_LOCALES, landingPageContentSchema } from "../shared/landingContent";

describe("landing page content", () => {
  it("ships a complete, publishable fallback for every supported language", () => {
    for (const locale of LANDING_LOCALES) {
      const content = defaultLandingContent(locale);
      expect(landingPageContentSchema.safeParse(content).success, locale).toBe(true);
      expect(content.audience.cards).toHaveLength(4);
      expect(content.how.steps).toHaveLength(3);
      expect(content.tools.cards).toHaveLength(3);
      expect(content.faq.items.length).toBeGreaterThanOrEqual(5);
      expect(new Set(content.faq.items.map((item) => item.id)).size).toBe(content.faq.items.length);
    }
  });
});
