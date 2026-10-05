import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser, isManagerOrAdmin, canAccessLead, type XpotActor } from "./middleware.js";
import { parseRef, resolveFileUrl, SIGNED_URL_TTL_SECONDS } from "../../lib/files.js";

// GET /files?ref=<stored reference> — the only way to read a private photo or
// voice note (server/lib/files.ts). The reference must belong to a lead or a
// visit, and the caller must be allowed to see that lead or visit; the answer
// is a redirect to a signed URL that expires in SIGNED_URL_TTL_SECONDS, so
// <img src> and <audio src> work as-is with the session cookie.
//
// Access mirrors the rest of the API: a lead's photos for its owner and for
// managers/admins (canAccessLead); a voice note for the rep who made the visit
// and for managers/admins (the rule of GET /visits).

export function createFilesRouter() {
  const router = Router();
  router.use("/files", requireXpotUser);

  router.get("/files", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const ref = typeof req.query.ref === "string" ? req.query.ref : "";
    const parsed = parseRef(ref);
    if (!parsed) return res.status(400).json({ message: "Invalid file reference" });

    const path = parsed.kind === "stored" ? parsed.key : parsed.publicPath ?? "";
    if (path.startsWith("photos/")) {
      const leadId = await storage.findLeadIdByPhoto(ref);
      const lead = leadId ? await storage.getSalesLead(leadId) : undefined;
      if (!lead) return res.status(404).json({ message: "File not found" });
      if (!canAccessLead(actor, lead)) return res.status(403).json({ message: "Access denied" });
    } else if (path.startsWith("audio/")) {
      const visitId = await storage.findVisitIdByAudio(ref);
      const visit = visitId ? await storage.getSalesVisit(visitId) : undefined;
      if (!visit) return res.status(404).json({ message: "File not found" });
      if (visit.repId !== actor.rep.id && !isManagerOrAdmin(actor)) {
        return res.status(403).json({ message: "Access denied" });
      }
    } else {
      return res.status(404).json({ message: "File not found" });
    }

    let url: string | null;
    try {
      url = await resolveFileUrl(ref);
    } catch (err) {
      console.error("[GET /files] could not sign", ref, (err as Error).message);
      return res.status(502).json({ message: "Storage unavailable" });
    }
    if (!url) return res.status(503).json({ message: "Storage not configured" });

    // The browser may reuse this redirect while the signature is still valid.
    res.set("Cache-Control", `private, max-age=${Math.max(0, SIGNED_URL_TTL_SECONDS - 60)}`);
    res.redirect(302, url);
  });

  return router;
}
