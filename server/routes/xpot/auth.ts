import { Router } from "express";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
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
    firstName: z.string().max(100).optional().nullable(),
    lastName: z.string().max(100).optional().nullable(),
  });

  router.patch("/me", async (req, res) => {
    try {
      const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      }
      const { firstName, lastName, ...repData } = parsed.data;
      const repPatch: { displayName?: string; phone?: string; avatarUrl?: string } = {};
      if (repData.displayName !== undefined) repPatch.displayName = repData.displayName;
      if (repData.phone !== undefined) repPatch.phone = repData.phone ?? undefined;
      if (repData.avatarUrl !== undefined) repPatch.avatarUrl = repData.avatarUrl ?? undefined;

      const userPatch: { firstName?: string | null; lastName?: string | null } = {};
      if (firstName !== undefined) userPatch.firstName = firstName;
      if (lastName !== undefined) userPatch.lastName = lastName;

      // Auto-update rep.displayName from firstName/lastName when displayName isn't explicitly sent.
      if (repData.displayName === undefined && (firstName !== undefined || lastName !== undefined)) {
        const fullName = [firstName ?? actor!.user.firstName, lastName ?? actor!.user.lastName]
          .filter(Boolean).join(" ").trim() || actor!.rep.displayName;
        if (fullName) repPatch.displayName = fullName;
      }

      const [updatedRep, _updatedUser] = await Promise.all([
        Object.keys(repPatch).length ? storage.updateSalesRepProfile(actor!.rep.id, repPatch) : Promise.resolve(actor!.rep),
        Object.keys(userPatch).length ? storage.updateUserProfile(actor!.user.userId, userPatch) : Promise.resolve(actor!.user),
      ]);

      if (Object.keys(userPatch).length) {
        const sess = req.session as any;
        if (firstName !== undefined) sess.firstName = firstName;
        if (lastName !== undefined) sess.lastName = lastName;
      }

      res.json({ rep: updatedRep, user: { ...actor!.user, ...userPatch } });
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

      const [updated] = await Promise.all([
        storage.updateSalesRepProfile(actor!.rep.id, { avatarUrl }),
        storage.updateUserProfile(actor!.user.userId, { profileImageUrl: avatarUrl }),
      ]);
      res.json({ avatarUrl, rep: updated });
    } catch (err) {
      console.error("[POST /api/xpot/me/avatar]", err);
      res.status(500).json({ message: (err as Error).message || "Failed to upload avatar" });
    }
  });

  router.post("/me/change-password", async (req, res) => {
    try {
      const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
      const parsed = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
      }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      }
      const { currentPassword, newPassword } = parsed.data;

      if (!actor!.user.email) {
        return res.status(400).json({ message: "No email on file for password reset" });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({ message: "New password must differ from current password" });
      }

      const anonClient = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );

      const { error: signInError } = await anonClient.auth.signInWithPassword({
        email: actor!.user.email,
        password: currentPassword,
      });

      if (signInError) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const admin = getSupabaseAdmin();
      const { error: updateError } = await admin.auth.admin.updateUserById(actor!.user.userId, { password: newPassword });

      if (updateError) {
        return res.status(500).json({ message: "Failed to update password" });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("[POST /api/xpot/me/change-password]", err);
      res.status(500).json({ message: (err as Error).message || "Internal server error" });
    }
  });

  return router;
}
