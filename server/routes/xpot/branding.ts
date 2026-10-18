import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { storage } from "../../storage.js";
import { requireSuperAdmin, requireXpotManager } from "./middleware.js";
import { getSupabaseAdmin } from "../../lib/supabase.js";
import { sendValidationError } from "../../lib/validation.js";

const DEFAULT_FAVICON = "/favicon.png";
const DEFAULT_LOGO = "/xpot-logo.svg";
const DEFAULT_BRANDING = {
  faviconUrl: null,
  faviconContentType: "image/png",
  logoUrl: null,
  logoContentType: "image/svg+xml",
  appName: "Xpot",
  shortName: "Xpot",
  themeColor: "#09090b",
  backgroundColor: "#0a0f1e",
};

/**
 * The manifest's icons. The icon URLs redirect to whatever was uploaded, so the
 * declared `type` must be that file's own (a JPG declared as image/png makes
 * some installers drop the icon).
 */
export function manifestIcons(contentType: string | null | undefined) {
  const type = contentType === "image/vnd.microsoft.icon" ? "image/x-icon" : contentType || "image/png";
  if (type === "image/svg+xml") return [{ src: "/api/branding/icon-512.png", sizes: "any", type, purpose: "any" }];
  return [
    { src: "/api/branding/icon-192.png", sizes: "192x192", type, purpose: "any" },
    { src: "/api/branding/icon-512.png", sizes: "512x512", type, purpose: "any" },
    { src: "/api/branding/icon-512.png", sizes: "512x512", type, purpose: "maskable" },
  ];
}

// ── Public branding endpoints (no auth) — mounted at /api/branding ──
// These feed the browser's favicon, the PWA manifest, apple-touch-icon and OG
// image. index.html points its <link>/<meta> tags here so the admin-uploaded
// icon takes effect without rebuilding the static HTML.
export function createBrandingPublicRouter() {
  const router = Router();

  async function publicBranding() {
    try {
      return await storage.getAppBranding();
    } catch (error) {
      // Branding is public chrome, so a database outage or an incomplete local
      // schema must never turn the logo, favicon or manifest into a 500.
      console.error("[GET /api/branding] using built-in fallback", error);
      return DEFAULT_BRANDING;
    }
  }

  async function redirectToIcon(res: Response) {
    const b = await publicBranding();
    res.set("Cache-Control", "public, max-age=300");
    res.redirect(302, b.faviconUrl || DEFAULT_FAVICON);
  }

  router.get("/favicon", (_req, res) => redirectToIcon(res));
  router.get("/favicon.ico", (_req, res) => redirectToIcon(res));
  router.get("/icon-192.png", (_req, res) => redirectToIcon(res));
  router.get("/icon-512.png", (_req, res) => redirectToIcon(res));
  router.get("/apple-touch-icon.png", (_req, res) => redirectToIcon(res));

  router.get("/logo", async (_req, res) => {
    const b = await publicBranding();
    res.set("Cache-Control", "public, max-age=300");
    res.redirect(302, b.logoUrl || DEFAULT_LOGO);
  });

  router.get("/manifest.webmanifest", async (_req, res) => {
    const b = await publicBranding();
    const icons = manifestIcons(b.faviconContentType);

    res.set("Content-Type", "application/manifest+json; charset=utf-8");
    res.set("Cache-Control", "public, max-age=300");
    res.json({
      name: b.appName || "Xpot",
      short_name: b.shortName || b.appName || "Xpot",
      // Pinned so the app keeps its identity (and the user's existing install)
      // even though start_url moved from "/" to "/dashboard".
      id: "/",
      // Installed app opens straight into the workspace. If there is no session
      // the dashboard bounces back to "/" (landing) on 401 — so an unauthenticated
      // launch still lands on the sign-in surface.
      start_url: "/dashboard",
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

// ── Admin branding endpoints — mounted at /api/xpot, the global admin only ──
export function createBrandingAdminRouter() {
  const router = Router();
  // Only the /admin paths: this router is mounted at /api/xpot, so a bare router.use would guard
  // every route mounted after it (sales, consignments, products...) and lock plain reps out.
  router.use("/admin", requireXpotManager);
  router.use("/admin/branding", requireSuperAdmin);

  const present = (b: Awaited<ReturnType<typeof storage.getAppBranding>>) => ({
    faviconUrl: b.faviconUrl ?? null,
    faviconContentType: b.faviconContentType ?? null,
    logoUrl: b.logoUrl ?? null,
    logoContentType: b.logoContentType ?? null,
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

  async function uploadBrandAsset(req: Request, res: Response, asset: "favicon" | "logo") {
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
      if (!ext) return res.status(400).json({ message: `Unsupported type: ${mimeType}. Use PNG, SVG, ICO, JPG or WEBP.` });

      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > 2 * 1024 * 1024) {
        return res.status(400).json({ message: "Image too large (max 2MB)." });
      }

      const supabase = getSupabaseAdmin();
      const filename = `branding/${asset}-${Date.now()}_${randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(filename);
      const saved = await storage.upsertAppBranding(
        asset === "favicon"
          ? { faviconUrl: urlData.publicUrl, faviconContentType: mimeType }
          : { logoUrl: urlData.publicUrl, logoContentType: mimeType },
      );
      res.json(present(saved));
    } catch (err) {
      console.error(`[POST /admin/branding/${asset}]`, err);
      res.status(500).json({ message: "Upload failed" });
    }
  }

  // The square app icon and horizontal wordmark are intentionally independent.
  router.post("/admin/branding/favicon", (req, res) => uploadBrandAsset(req, res, "favicon"));
  router.post("/admin/branding/logo", (req, res) => uploadBrandAsset(req, res, "logo"));

  // "Restore default": forget the uploaded asset, so the public URLs redirect to
  // the built-in /favicon.png or /xpot-logo.svg again. The uploaded file stays in
  // storage (other caches may still point at it for up to 5 minutes).
  router.delete("/admin/branding/:asset", async (req, res) => {
    const asset = req.params.asset;
    if (asset !== "favicon" && asset !== "logo") return res.status(404).json({ message: "Unknown branding asset" });
    const saved = await storage.upsertAppBranding(
      asset === "favicon" ? { faviconUrl: null, faviconContentType: null } : { logoUrl: null, logoContentType: null },
    );
    res.json(present(saved));
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
      return sendValidationError(res, input.error, "Invalid input", { themeColor: "invalid_color", backgroundColor: "invalid_color" });
    }
    const saved = await storage.upsertAppBranding(input.data);
    res.json(present(saved));
  });

  return router;
}
