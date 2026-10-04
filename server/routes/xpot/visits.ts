import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep, isManagerOrAdmin, loadAccessibleLead } from "./middleware.js";
import type { SalesVisitStatus } from "#shared/schema/sales.js";
import { getDistanceMeters, syncVisitToGhl, syncVisitToXphere } from "./helpers.js";
import { xpotCheckInSchema, xpotCheckOutSchema, xpotVisitNoteUpsertSchema } from "#shared/xpot.js";

export function createVisitsRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/visits", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = typeof req.query.leadId === "string" ? Number(req.query.leadId) : undefined;
    const visits = await storage.listSalesVisits({
      repId: isManagerOrAdmin(actor!) ? (req.query.repId ? Number(req.query.repId) : undefined) : actor!.rep.id,
      leadId,
    });
    const result = await Promise.all(visits.map(async (visit) => {
      const lead = await storage.getSalesLead(visit.leadId);
      const locations = lead ? await storage.listSalesLeadLocations(visit.leadId) : [];
      return {
        ...visit,
        lead: lead ? { ...lead, locations } : undefined,
        note: await storage.getSalesVisitNote(visit.id),
      };
    }));

    res.json(result);
  });

  router.post("/visits/check-in", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const input = xpotCheckInSchema.parse(req.body);
    const activeVisit = await storage.getActiveSalesVisitForRep(actor!.rep.id);
    if (activeVisit) {
      return res.status(409).json({ message: "Rep already has an active visit" });
    }

    const appSettings = await storage.getSalesAppSettings();
    // SEG-05: this only checked that the lead existed, not that it belonged to
    // the rep checking in. Beyond the visit itself the handler promotes the
    // lead and overwrites lastVisitAt/nextVisitDueAt — another rep's pipeline.
    const lead = await loadAccessibleLead(req, res, input.leadId);
    if (!lead) return;

    const locations = await storage.listSalesLeadLocations(input.leadId);
    const selectedLocation = input.locationId
      ? locations.find((location) => location.id === input.locationId)
      : locations.find((location) => location.isPrimary) || locations[0];

    let validationStatus: "valid" | "outside_geofence" | "gps_unavailable" | "manual_override" = "gps_unavailable";
    let distanceFromTargetMeters: number | undefined;

    if (
      selectedLocation?.lat && selectedLocation?.lng &&
      typeof input.lat === "number" &&
      typeof input.lng === "number"
    ) {
      distanceFromTargetMeters = getDistanceMeters(
        Number(selectedLocation.lat),
        Number(selectedLocation.lng),
        input.lat,
        input.lng,
      );
      const allowedRadius = selectedLocation.geofenceRadiusMeters || appSettings.defaultGeofenceRadiusMeters;
      validationStatus = distanceFromTargetMeters <= allowedRadius ? "valid" : "outside_geofence";
    }

    if (input.manualOverrideReason && appSettings.allowManualOverride) {
      validationStatus = "manual_override";
    }

    if (appSettings.checkInRequiresGps && validationStatus === "outside_geofence" && !input.manualOverrideReason) {
      return res.status(400).json({ message: "Outside geofence. Manual override reason required." });
    }

    const visit = await storage.createSalesVisit({
      repId: actor!.rep.id,
      leadId: lead.id,
      locationId: selectedLocation?.id,
      status: "in_progress",
      scheduledAt: null,
      checkedInAt: new Date(),
      checkedOutAt: null,
      durationSeconds: null,
      checkInLat: input.lat?.toString(),
      checkInLng: input.lng?.toString(),
      checkOutLat: null,
      checkOutLng: null,
      distanceFromTargetMeters: distanceFromTargetMeters ?? null,
      gpsAccuracyMeters: input.gpsAccuracyMeters ?? null,
      validationStatus,
      manualOverrideReason: input.manualOverrideReason,
      source: "field-mobile",
    });

    // DAT-04: this used to be two sequential UPDATEs on the same row.
    await storage.updateSalesLead(lead.id, {
      ...(lead.status === "prospect" ? { status: "lead" as const } : {}),
      lastVisitAt: visit.checkedInAt,
      nextVisitDueAt: null,
    });

    res.status(201).json({ visit, lead, location: selectedLocation ?? null });
  });

  router.post("/visits/:id/check-out", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const visitId = Number(req.params.id);
    const input = xpotCheckOutSchema.parse(req.body);
    const visit = await storage.getSalesVisit(visitId);

    if (!visit || visit.repId !== actor!.rep.id) {
      return res.status(404).json({ message: "Visit not found" });
    }

    const checkedOutAt = new Date();
    const checkedInAt = visit.checkedInAt ? new Date(visit.checkedInAt) : checkedOutAt;
    const durationSeconds = Math.max(0, Math.round((checkedOutAt.getTime() - checkedInAt.getTime()) / 1000));

    const updated = await storage.updateSalesVisit(visit.id, {
      status: (input.status as any) || "completed",
      checkedOutAt,
      durationSeconds,
      checkOutLat: input.lat?.toString(),
      checkOutLng: input.lng?.toString(),
    });

    await storage.updateSalesLead(visit.leadId, {
      lastVisitAt: checkedOutAt,
    });

    res.json(updated);

    // Fire GHL sync after response — non-blocking, failure is logged to sync_events
    syncVisitToGhl(visit.id).catch((err) =>
      console.error("[check-out] syncVisitToGhl error:", err)
    );
    // Sync the visit back to the originating Xphere prospect (if any).
    syncVisitToXphere(visit.id).catch((err) =>
      console.error("[check-out] syncVisitToXphere error:", err)
    );
  });

  router.post("/visits/:id/cancel", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const visitId = Number(req.params.id);
    const visit = await storage.getSalesVisit(visitId);

    if (!visit || visit.repId !== actor!.rep.id) {
      return res.status(404).json({ message: "Visit not found" });
    }

    if (visit.status !== "in_progress") {
      return res.status(400).json({ message: "Only in-progress visits can be cancelled" });
    }

    const checkedOutAt = new Date();
    const checkedInAt = visit.checkedInAt ? new Date(visit.checkedInAt) : checkedOutAt;
    const durationSeconds = Math.max(0, Math.round((checkedOutAt.getTime() - checkedInAt.getTime()) / 1000));

    const updated = await storage.updateSalesVisit(visit.id, {
      status: "cancelled",
      checkedOutAt,
      durationSeconds,
    });

    res.json(updated);
  });

  router.patch("/visits/:id", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const visitId = Number(req.params.id);
    const visit = await storage.getSalesVisit(visitId);
    if (!visit || visit.repId !== actor!.rep.id) {
      return res.status(404).json({ message: "Visit not found" });
    }
    const { status } = req.body as { status?: SalesVisitStatus };
    const updated = await storage.updateSalesVisit(visitId, { ...(status ? { status } : {}) });
    res.json(updated);

    // VND-11: this used to write the status and stop, so a rep correcting
    // "Completed" to "Sale Made" after check-out never reached the CRM — the
    // note there kept whatever the status was at check-out.
    if (status && visit.checkedOutAt) {
      syncVisitToGhl(visitId).catch((err) => console.error("[visit status] syncVisitToGhl:", err));
      syncVisitToXphere(visitId).catch((err) => console.error("[visit status] syncVisitToXphere:", err));
    }
  });

  router.delete("/visits/:id", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const visitId = Number(req.params.id);
    const visit = await storage.getSalesVisit(visitId);
    if (!visit || (visit.repId !== actor!.rep.id && !actor!.user.isAdmin)) {
      return res.status(404).json({ message: "Visit not found" });
    }
    await storage.deleteSalesVisit(visitId);
    res.status(204).end();
  });

  router.patch("/visits/:id/note", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const visitId = Number(req.params.id);
    const input = xpotVisitNoteUpsertSchema.parse(req.body);
    const visit = await storage.getSalesVisit(visitId);

    if (!visit || visit.repId !== actor!.rep.id) {
      return res.status(404).json({ message: "Visit not found" });
    }

    const note = await storage.upsertSalesVisitNote({
      visitId,
      createdByRepId: actor!.rep.id,
      ...input,
    });
    res.json(note);
  });

  router.post("/visits/:id/audio", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const visitId = Number(req.params.id);
    const { audioData, durationSeconds } = req.body;

    const visit = await storage.getSalesVisit(visitId);
    if (!visit || visit.repId !== actor!.rep.id) {
      return res.status(404).json({ message: "Visit not found" });
    }

    if (!audioData) {
      return res.status(400).json({ message: "Audio data is required" });
    }

    try {
      let audioUrl = "";
      const base64Data = audioData.replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const filename = `visit_${visitId}_${Date.now()}.webm`;

      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const path = `audio/${actor!.rep.id}/${filename}`;
        const { error: uploadError } = await supabase.storage.from("uploads").upload(path, buffer, {
          contentType: "audio/webm",
          upsert: true,
        });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);
        audioUrl = urlData.publicUrl;
      } else {
        return res.status(503).json({ message: "Storage not configured" });
      }

      // Transcribe with Groq Whisper (best-effort — does not block save on failure)
      let audioTranscription: string | null = null;
      const groqIntegration = await storage.getChatIntegration("groq");
      const groqApiKey = groqIntegration?.apiKey;
      if (groqApiKey) {
        try {
          const Groq = (await import("groq-sdk")).default;
          const groq = new Groq({ apiKey: groqApiKey });
          const file = new File([buffer], filename, { type: "audio/webm" });
          const transcription = await groq.audio.transcriptions.create({
            file,
            model: "whisper-large-v3-turbo",
            response_format: "text",
          });
          audioTranscription = (transcription as unknown as string).trim() || null;
        } catch (transcriptionError: any) {
          console.error("Groq transcription error:", transcriptionError.message);
        }
      }

      // Fallback to OpenAI Whisper when Groq is unconfigured or failed.
      if (!audioTranscription) {
        const openaiIntegration = await storage.getChatIntegration("openai");
        const openaiApiKey = openaiIntegration?.apiKey;
        if (openaiApiKey && openaiIntegration?.enabled !== false) {
          try {
            const { OpenAI } = await import("openai");
            const openai = new OpenAI({ apiKey: openaiApiKey });
            const file = new File([buffer], filename, { type: "audio/webm" });
            const transcription = await openai.audio.transcriptions.create({
              file,
              model: "whisper-1",
              response_format: "text",
            });
            audioTranscription = (transcription as unknown as string).trim() || null;
          } catch (transcriptionError: any) {
            console.error("OpenAI transcription error:", transcriptionError.message);
          }
        }
      }

      // PLT-03: analysis used to run here too, inside the same request, under
      // the platform's 30s cap with recordings up to five minutes. This half
      // now stops at the transcript; the client calls POST /visits/:id/analyze
      // for the rest, which is also where sales actions are extracted.
      const note = await storage.upsertSalesVisitNote({
        visitId,
        createdByRepId: actor!.rep.id,
        audioUrl,
        audioDurationSeconds: durationSeconds || null,
        ...(audioTranscription !== null && { audioTranscription }),
      });
      return res.json({
        note,
        transcriptionAvailable: Boolean(audioTranscription),
        // The client chains straight into /analyze when this is true.
        readyToAnalyze: Boolean(audioTranscription),
      });
    } catch (error: any) {
      console.error("Audio upload error:", error);
      res.status(500).json({ message: error.message || "Failed to upload audio" });
    }
  });

  return router;
}
