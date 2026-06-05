import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { storage } from "../../storage.js";
import { requireXpotManager } from "./middleware.js";
import { getSupabaseAdmin } from "../../lib/supabase.js";

const DEFAULT_FAVICON = "/favicon.png";

// ── Public branding endpoints (no auth) — mounted at /api/branding ──
// These feed the browser's favicon, the PWA manifest, apple-touch-icon and OG
// image. index.html points its <link>/<meta> tags here so the admin-uploaded
// icon takes effect without rebuilding the static HTML.
export function createBrandingPublicRouter() {
  const router = Router();

  async function redirectToIcon(res: Response) {
    const b = await storage.getAppBranding();
    res.set("Cache-Control", "public, max-age=300");
    res.redirect(302, b.faviconUrl || DEFAULT_FAVICON);
  }

  router.get("/favicon", (_req, res) => redirectToIcon(res));
  router.get("/favicon.ico", (_req, res) => redirectToIcon(res));
  router.get("/icon-192.png", (_req, res) => redirectToIcon(res));
  router.get("/icon-512.png", (_req, res) => redirectToIcon(res));
  router.get("/apple-touch-icon.png", (_req, res) => redirectToIcon(res));

  router.get("/manifest.webmanifest", async (_req, res) => {
    const b = await storage.getAppBranding();
    const isSvg = b.faviconContentType === "image/svg+xml";
    const icons = isSvg
      ? [{ src: "/api/branding/icon-512.png", sizes: "any", type: "image/svg+xml", purpose: "any" }]
      : [
          { src: "/api/branding/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/api/branding/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/api/branding/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ];

    res.set("Content-Type", "application/manifest+json; charset=utf-8");
    res.set("Cache-Control", "public, max-age=300");
    res.json({
      name: b.appName || "Xpot",
      short_name: b.shortName || b.appName || "Xpot",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: b.backgroundColor || "#0a0f1e",
      theme_color: b.themeColor || "#09090b",
      icons,
    });
  });

  return router;
}

// ── Admin branding endpoints — mounted at /api/xpot, manager/admin only ──
export function createBrandingAdminRouter() {
  const router = Router();
  router.use(requireXpotManager);

  const present = (b: Awaited<ReturnType<typeof storage.getAppBranding>>) => ({
    faviconUrl: b.faviconUrl ?? null,
    faviconContentType: b.faviconContentType ?? null,
    appName: b.appName ?? "Xpot",
    shortName: b.shortName ?? "Xpot",
    themeColor: b.themeColor ?? "#09090b",
    backgroundColor: b.backgroundColor ?? "#0a0f1e",
    updatedAt: b.updatedAt ? new Date(b.updatedAt).toISOString() : null,
  });

  router.get("/admin/branding", async (_req, res) => {
    res.json(present(await storage.getAppBranding()));
  });

  const ALLOWED: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
  };

  // Upload a new favicon/icon (base64 data URL, same shape as avatar upload).
  router.post("/admin/branding/favicon", async (req, res) => {
    try {
      const { imageData } = req.body as { imageData?: string };
      if (!imageData) return res.status(400).json({ message: "imageData is required" });

      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(503).json({ message: "Storage not configured" });
      }

      const match = imageData.match(/^data:([\w/+.-]+);base64,(.+)$/);
      if (!match) return res.status(400).json({ message: "Invalid image format" });
      const mimeType = match[1];
      const ext = ALLOWED[mimeType];
      if (!ext) return res.status(400).json({ message: `Tipo não suportado: ${mimeType}. Use PNG, SVG, ICO, JPG ou WEBP.` });

      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > 2 * 1024 * 1024) {
        return res.status(400).json({ message: "Imagem muito grande (máx 2MB)." });
      }

      const supabase = getSupabaseAdmin();
      const filename = `branding/favicon-${Date.now()}_${randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(filename);
      const saved = await storage.upsertAppBranding({
        faviconUrl: urlData.publicUrl,
        faviconContentType: mimeType,
      });
      res.json(present(saved));
    } catch (err) {
      console.error("[POST /admin/branding/favicon]", err);
      res.status(500).json({ message: (err as Error).message || "Falha no upload" });
    }
  });

  router.put("/admin/branding", async (req, res) => {
    const input = z
      .object({
        appName: z.string().trim().min(1).max(60).optional(),
        shortName: z.string().trim().min(1).max(30).optional(),
        themeColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        backgroundColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      })
      .safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ message: "Invalid input", errors: input.error.flatten() });
    }
    const saved = await storage.upsertAppBranding(input.data);
    res.json(present(saved));
  });

  return router;
}
