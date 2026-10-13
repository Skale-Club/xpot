import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep, isManagerOrAdmin, loadAccessibleLead, listsEveryone } from "./middleware.js";
import type { SalesVisitStatus } from "#shared/schema/sales.js";
import { getDistanceMeters, syncTaskToGhl, syncVisitToGhl, syncVisitToXphere } from "./helpers.js";
import { xpotCheckInSchema, xpotCheckOutSchema, xpotVisitNoteUpsertSchema, xpotVisitSummarySchema } from "#shared/xpot.js";
import { salesStorage } from "../../storage-sales.js";
import { activeStore, discardFiles, putPrivateFile } from "../../lib/files.js";
import { DailyRouteError, finishVisitTransaction, getRouteStopForCheckIn, startRouteVisit } from "../../daily-routes.js";
import { saveVisitSummaryTransaction } from "../../visit-summary.js";

export function createVisitsRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/visits", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = typeof req.query.leadId === "string" ? Number(req.query.leadId) : undefined;
    const visits = await storage.listSalesVisits({
      repId: listsEveryone(req, actor!) ? (req.query.repId ? Number(req.query.repId) : undefined) : actor!.rep.id,
      leadId,
    });
    const visitSalesById = await salesStorage.visitSalesBatch(visits.map((visit) => visit.id));
    const result = await Promise.all(visits.map(async (visit) => {
      const lead = await storage.getSalesLead(visit.leadId);
      const locations = lead ? await storage.listSalesLeadLocations(visit.leadId) : [];
      return {
        ...visit,
        lead: lead ? { ...lead, locations } : undefined,
        note: await storage.getSalesVisitNote(visit.id),
        visitSales: visitSalesById.get(visit.id) ?? { transactions: 0, pieces: 0, totalCents: 0 },
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

    const routeContext = input.routeStopId
      ? await getRouteStopForCheckIn(actor!.rep.id, input.routeStopId, input.leadId)
      : undefined;
    if (input.routeStopId && !routeContext) {
      return res.status(404).json({ code: "route_stop_not_found", message: "Route stop not found" });
    }
    if (routeContext && routeContext.stop.status !== "planned") {
      return res.status(409).json({ code: "route_stop_unavailable", message: "This route stop is no longer available for check-in" });
    }

    const appSettings = await storage.getSalesAppSettings();
    // SEG-05: this only checked that the lead existed, not that it belonged to
    // the rep checking in. Beyond the visit itself the handler promotes the
    // lead and overwrites lastVisitAt/nextVisitDueAt — another rep's pipeline.
    const lead = await loadAccessibleLead(req, res, input.leadId);
    if (!lead) return;

    const locations = await storage.listSalesLeadLocations(input.leadId);
    const requestedLocationId = routeContext?.stop.locationId ?? input.locationId;
    const selectedLocation = requestedLocationId
      ? locations.find((location) => location.id === requestedLocationId)
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

    const visitInput = {
      repId: actor!.rep.id,
      leadId: lead.id,
      locationId: selectedLocation?.id,
      checkedInAt: new Date(),
      lat: input.lat,
      lng: input.lng,
      distanceFromTargetMeters: distanceFromTargetMeters ?? null,
      gpsAccuracyMeters: input.gpsAccuracyMeters ?? null,
      validationStatus,
      manualOverrideReason: input.manualOverrideReason,
    };
    let visit;
    if (routeContext) {
      try {
        visit = await startRouteVisit({ ...visitInput, stopId: routeContext.stop.id });
      } catch (error) {
        if (error instanceof DailyRouteError) return res.status(error.code === "route_stop_not_found" ? 404 : 409).json({ code: error.code, message: error.message });
        throw error;
      }
    } else {
      visit = await storage.createSalesVisit({
        repId: visitInput.repId,
        leadId: visitInput.leadId,
        locationId: visitInput.locationId,
        status: "in_progress",
        scheduledAt: null,
        checkedInAt: visitInput.checkedInAt,
        checkedOutAt: null,
        durationSeconds: null,
        checkInLat: visitInput.lat?.toString(),
        checkInLng: visitInput.lng?.toString(),
        checkOutLat: null,
        checkOutLng: null,
        distanceFromTargetMeters: visitInput.distanceFromTargetMeters,
        gpsAccuracyMeters: visitInput.gpsAccuracyMeters,
        validationStatus,
        manualOverrideReason: visitInput.manualOverrideReason,
        source: "field-mobile",
      });
      await storage.updateSalesLead(lead.id, {
        ...(lead.status === "prospect" ? { status: "lead" as const } : {}),
        lastVisitAt: visit.checkedInAt,
        nextVisitDueAt: null,
      });
    }

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

    const updated = await finishVisitTransaction({
      visitId: visit.id,
      leadId: visit.leadId,
      status: (input.status as SalesVisitStatus) || "completed",
      checkedOutAt,
      durationSeconds,
      checkOutLat: input.lat,
      checkOutLng: input.lng,
      routeStopStatus: "summary_pending",
      updateLeadLastVisit: true,
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

    const updated = await finishVisitTransaction({
      visitId: visit.id,
      leadId: visit.leadId,
      status: "cancelled",
      checkedOutAt,
      durationSeconds,
      routeStopStatus: "planned",
      updateLeadLastVisit: false,
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
    const files = await storage.deleteSalesVisit(visitId);
    res.status(204).end();
    void discardFiles(files, `visit #${visitId} deleted`);
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

  router.post("/visits/:id/summary", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const visitId = Number(req.params.id);
    const input = xpotVisitSummarySchema.parse(req.body);
    const visit = await storage.getSalesVisit(visitId);
    if (!visit || visit.repId !== actor!.rep.id) return res.status(404).json({ message: "Visit not found" });
    if (!visit.checkedOutAt) return res.status(409).json({ code: "visit_still_active", message: "Finish the visit before saving its summary" });

    const { note, task } = await saveVisitSummaryTransaction({
      repId: actor!.rep.id,
      visitId,
      leadId: visit.leadId,
      input,
    });
    res.json({ note, task });
    if (task) syncTaskToGhl(task.id).then(async (result) => {
      if (result.synced && result.ghlTaskId) await storage.updateSalesTask(task!.id, { ghlTaskId: result.ghlTaskId });
    }).catch((error) => console.error("[visit summary] task sync failed:", error));
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

    if (!activeStore()) {
      return res.status(503).json({ message: "Storage not configured" });
    }

    try {
      const base64Data = audioData.replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const filename = `visit_${visitId}_${Date.now()}.webm`;
      // Private: the note keeps a storage reference, read through GET /files.
      const audioUrl = await putPrivateFile(`audio/${actor!.rep.id}/${filename}`, buffer, "audio/webm");
      const previousAudio = (await storage.getSalesVisitNote(visitId))?.audioUrl;

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
      // A re-recording replaces the note's audio; the old file goes with it.
      if (previousAudio && previousAudio !== audioUrl) void discardFiles([previousAudio], `voice note of visit #${visitId} replaced`);
      return res.json({
        note,
        transcriptionAvailable: Boolean(audioTranscription),
        // The client chains straight into /analyze when this is true.
        readyToAnalyze: Boolean(audioTranscription),
      });
    } catch (error: any) {
      console.error("Audio upload error:", error);
      res.status(500).json({ message: "Failed to upload audio" });
    }
  });

  return router;
}
