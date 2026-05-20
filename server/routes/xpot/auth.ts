import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep } from "./middleware.js";
import { getSupabaseAdmin } from "../../lib/supabase.js";
import { randomUUID } from "crypto";

export function createAuthRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/me", async (req, res) => {
    try {
      const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
      const activeVisit = await storage.getActiveSalesVisitForRep(actor!.rep.id);
      const enrichedVisit = activeVisit
        ? {
            ...activeVisit,
            lead: await storage.getSalesLead(activeVisit.leadId),
            note: await storage.getSalesVisitNote(activeVisit.id),
          }
        : null;
      res.json({
        user: actor!.user,
        rep: actor!.rep,
        activeVisit: enrichedVisit,
      });
    } catch (err) {
      console.error("[GET /api/xpot/me]", err);
      res.status(500).json({ message: (err as Error).message || "Internal server error" });
    }
  });

  const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).optional().nullable(),
    avatarUrl: z.string().url().optional().nullable(),
  });

  router.patch("/me", async (req, res) => {
    try {
      const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      }
      const data: { displayName?: string; phone?: string; avatarUrl?: string } = {};
      if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
      if (parsed.data.phone !== undefined) data.phone = parsed.data.phone ?? undefined;
      if (parsed.data.avatarUrl !== undefined) data.avatarUrl = parsed.data.avatarUrl ?? undefined;

      const updated = await storage.updateSalesRepProfile(actor!.rep.id, data);
      res.json({ rep: updated });
    } catch (err) {
      console.error("[PATCH /api/xpot/me]", err);
      res.status(500).json({ message: (err as Error).message || "Internal server error" });
    }
  });

  router.post("/me/avatar", async (req, res) => {
    try {
      const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
      const { imageData } = req.body as { imageData?: string };

      if (!imageData) {
        return res.status(400).json({ message: "imageData is required" });
      }

      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(503).json({ message: "Storage not configured" });
      }

      // Strip base64 prefix (data:image/jpeg;base64,...)
      const match = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ message: "Invalid image format" });
      }
      const mimeType = match[1];
      const ext = mimeType.split("/")[1] || "jpg";
      const buffer = Buffer.from(match[2], "base64");

      const supabase = getSupabaseAdmin();
      const filename = `avatars/${actor!.rep.id}/${Date.now()}_${randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(filename);
      const avatarUrl = urlData.publicUrl;

      const updated = await storage.updateSalesRepProfile(actor!.rep.id, { avatarUrl });
      res.json({ avatarUrl, rep: updated });
    } catch (err) {
      console.error("[POST /api/xpot/me/avatar]", err);
      res.status(500).json({ message: (err as Error).message || "Failed to upload avatar" });
    }
  });

  return router;
}
