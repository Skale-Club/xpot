import { Router } from "express";
import {
  LANDING_LOCALES,
  landingLocaleSchema,
  landingPageContentSchema,
  type LandingContentResponse,
} from "#shared/landingContent.js";
import { storage } from "../../storage.js";
import { requireSuperAdmin, requireXpotManager } from "./middleware.js";

function present(locale: (typeof LANDING_LOCALES)[number], row: Awaited<ReturnType<typeof storage.getLandingPageContent>>): LandingContentResponse {
  return {
    locale,
    content: row?.content ?? null,
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

/** Public read API. An empty locale falls back to the copy bundled with the client. */
export function createLandingContentPublicRouter() {
  const router = Router();

  router.get("/:locale", async (req, res) => {
    const locale = landingLocaleSchema.safeParse(req.params.locale);
    if (!locale.success) return res.status(404).json({ message: "Unsupported locale" });

    const row = await storage.getLandingPageContent(locale.data);
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(present(locale.data, row));
  });

  return router;
}

/** Global-admin publishing API. Managers cannot read drafts or overwrite copy. */
export function createLandingContentAdminRouter() {
  const router = Router();
  router.use("/admin/landing-content", requireXpotManager, requireSuperAdmin);

  router.get("/admin/landing-content", async (_req, res) => {
    const rows = await storage.listLandingPageContents();
    const byLocale = new Map(rows.map((row) => [row.locale, row]));
    res.json(LANDING_LOCALES.map((locale) => present(locale, byLocale.get(locale))));
  });

  router.put("/admin/landing-content/:locale", async (req, res) => {
    const locale = landingLocaleSchema.safeParse(req.params.locale);
    if (!locale.success) return res.status(404).json({ message: "Unsupported locale" });

    const content = landingPageContentSchema.safeParse(req.body);
    if (!content.success) {
      return res.status(400).json({ message: "Invalid landing-page content", errors: content.error.flatten() });
    }

    const saved = await storage.upsertLandingPageContent({ locale: locale.data, content: content.data });
    res.json(present(locale.data, saved));
  });

  return router;
}

