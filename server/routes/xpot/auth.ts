import { Router } from "express";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { storage, type SalesRepProfilePatch } from "../../storage.js";
import { requireXpotUser, ensureXpotRep } from "./middleware.js";
import { getSupabaseAdmin } from "../../lib/supabase.js";
import { discardFiles, isRepAvatarUrl } from "../../lib/files.js";
import { randomUUID } from "crypto";
import { listOrganizations, membershipsForRep } from "../../organizations/service.js";
import { eq } from "drizzle-orm";
import { db } from "../../db.js";
import { users } from "#shared/schema.js";

export function createAuthRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/me", async (req, res) => {
    try {
      const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
      const [activeVisit, organizations, organizationMemberships, appSettings, [account]] = await Promise.all([
        storage.getActiveSalesVisitForRep(actor!.rep.id),
        listOrganizations(actor!),
        membershipsForRep(actor!.rep.id),
        storage.getSalesAppSettings(),
        db.select({ phone: users.phone }).from(users).where(eq(users.id, actor!.user.userId)).limit(1),
      ]);
      const enrichedVisit = activeVisit
        ? {
            ...activeVisit,
            lead: await storage.getSalesLead(activeVisit.leadId),
            note: await storage.getSalesVisitNote(activeVisit.id),
          }
        : null;
      res.json({
        // The sign-in phone (users.phone) is not the profile's contact phone (rep.phone); Settings shows both.
        user: { ...actor!.user, phone: account?.phone ?? null },
        rep: actor!.rep,
        organizations,
        organizationMemberships,
        activeVisit: enrichedVisit,
        // What the check-in screen needs to know before it asks for a reason.
        checkInRules: {
          requiresGps: appSettings.checkInRequiresGps,
          allowManualOverride: appSettings.allowManualOverride,
          defaultGeofenceRadiusMeters: appSettings.defaultGeofenceRadiusMeters,
        },
      });
    } catch (err) {
      console.error("[GET /api/xpot/me]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).optional().nullable(),
    avatarUrl: z.string().url().optional().nullable(),
    firstName: z.string().max(100).optional().nullable(),
    lastName: z.string().max(100).optional().nullable(),
    // Where the prospecting day ends. The address comes from a place search, so
    // it always travels with its coordinates; null clears all three. No screen
    // sets home or routeReturnHome any more (Settings › Route was removed); the
    // fields stay so existing values and API clients keep working.
    home: z.object({
      address: z.string().trim().min(3).max(500),
      lat: z.number().finite().min(-90).max(90),
      lng: z.number().finite().min(-180).max(180),
    }).nullable().optional(),
    routeReturnHome: z.boolean().optional(),
  });

  router.patch("/me", async (req, res) => {
    try {
      const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      }
      const { firstName, lastName, home, routeReturnHome, ...repData } = parsed.data;
      const repPatch: SalesRepProfilePatch = {};
      if (home !== undefined) {
        repPatch.homeAddress = home?.address ?? null;
        repPatch.homeLat = home ? String(home.lat) : null;
        repPatch.homeLng = home ? String(home.lng) : null;
        // Without a home there is nowhere to return to.
        if (!home) repPatch.routeReturnHome = false;
      }
      if (routeReturnHome !== undefined && home !== null) {
        const hasHome = home !== undefined || Boolean(actor!.rep.homeLat && actor!.rep.homeLng);
        if (routeReturnHome && !hasHome) {
          return res.status(400).json({ message: "Save your home address before ending routes there." });
        }
        repPatch.routeReturnHome = routeReturnHome;
      }
      if (repData.displayName !== undefined) repPatch.displayName = repData.displayName;
      if (repData.phone !== undefined) repPatch.phone = repData.phone ?? undefined;
      if (repData.avatarUrl !== undefined) {
        // Only clearing it, or the rep's own uploaded picture (POST /me/avatar
        // sets it): the value is what a later replacement or account deletion
        // removes from storage.
        if (repData.avatarUrl !== null && !isRepAvatarUrl(repData.avatarUrl, actor!.rep.id)) {
          return res.status(400).json({ code: "avatar_not_uploaded", message: "Upload the picture through /me/avatar." });
        }
        repPatch.avatarUrl = repData.avatarUrl ?? undefined;
      }

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
      res.status(500).json({ message: "Internal server error" });
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

      const previous = actor!.rep.avatarUrl;
      const [updated] = await Promise.all([
        storage.updateSalesRepProfile(actor!.rep.id, { avatarUrl }),
        storage.updateUserProfile(actor!.user.userId, { profileImageUrl: avatarUrl }),
      ]);
      res.json({ avatarUrl, rep: updated });
      // The replaced picture would otherwise stay in the public bucket for good.
      if (previous && previous !== avatarUrl && isRepAvatarUrl(previous, actor!.rep.id)) {
        void discardFiles([previous], `avatar of rep #${actor!.rep.id}`);
      }
    } catch (err) {
      console.error("[POST /api/xpot/me/avatar]", err);
      res.status(500).json({ message: "Failed to upload avatar" });
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
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return router;
}
