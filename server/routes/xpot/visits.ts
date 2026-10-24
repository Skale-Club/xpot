import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep, loadAccessibleLead, listScope, visitsInOrganizations, type XpotActor } from "./middleware.js";
import type { SalesVisitStatus } from "#shared/schema/sales.js";
import { getDistanceMeters, syncTaskToGhl, syncVisitToGhl, syncVisitToXphere } from "./helpers.js";
import { xpotCheckInSchema, xpotCheckOutSchema, xpotVisitNoteUpsertSchema, xpotVisitSummarySchema } from "#shared/xpot.js";
import { salesStorage } from "../../storage-sales.js";
import { activeStore, discardFiles, putPrivateFile } from "../../lib/files.js";
import { finishVisitTransaction, startVisitTransaction } from "../../visit-workflow.js";
import { saveVisitSummaryTransaction } from "../../visit-summary.js";
import { evaluateCheckInGeofence } from "../../check-in-geofence.js";
import { transcriptionProviders } from "../../lib/providerChoice.js";

export function createVisitsRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/visits", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = typeof req.query.leadId === "string" ? Number(req.query.leadId) : undefined;
    // ?repId= narrows the list to one person (the history's "Seller" filter,
    // People's "Their visits", Organizations › a person). A manager in
    // management mode ("everyone") may ask for anyone. Visits have no
    // organization of their own, so a Rep Admin asking for a teammate gets
    // that person's visits to companies in the organizations they run
    // (visitsInOrganizations below); anyone else gets their own visits.
    const repFilter = Number(req.query.repId);
    const requested = Number.isInteger(repFilter) && repFilter > 0 ? repFilter : undefined;
    const scope = await listScope(req, actor as XpotActor);
    const teammate = scope.kind === "organizations" && requested && requested !== actor!.rep.id ? requested : undefined;
    const listed = await storage.listSalesVisits({
      repId: scope.kind === "everyone" ? requested : teammate ?? actor!.rep.id,
      leadId,
    });
    const visits = teammate && scope.kind === "organizations"
      ? visitsInOrganizations(listed, await storage.getSalesLeadsByIds(Array.from(new Set(listed.map((visit) => visit.leadId)))), scope.organizationIds)
      : listed;
    // Four queries for the whole list. This used to read the lead, its
    // locations and the note one visit at a time: three round trips per visit,
    // thousands for a rep with a long history.
    const visitIds = visits.map((visit) => visit.id);
    const leadIds = Array.from(new Set(visits.map((visit) => visit.leadId)));
    const [visitSalesById, leads, locations, notes] = await Promise.all([
      salesStorage.visitSalesBatch(visitIds),
      storage.getSalesLeadsByIds(leadIds),
      storage.listSalesLeadLocationsBatch(leadIds),
      storage.listSalesVisitNotesBatch(visitIds),
    ]);
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const locationsByLead = new Map<number, typeof locations>();
    for (const location of locations) {
      if (!locationsByLead.has(location.leadId)) locationsByLead.set(location.leadId, []);
      locationsByLead.get(location.leadId)!.push(location);
    }
    const noteByVisit = new Map(notes.map((note) => [note.visitId, note]));

    res.json(visits.map((visit) => {
      const lead = leadById.get(visit.leadId);
      return {
        ...visit,
        lead: lead ? { ...lead, locations: locationsByLead.get(visit.leadId) ?? [] } : undefined,
        note: noteByVisit.get(visit.id),
        visitSales: visitSalesById.get(visit.id) ?? { transactions: 0, pieces: 0, totalCents: 0 },
      };
    }));
  });

  router.post("/visits/check-in", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const input = xpotCheckInSchema.parse(req.body);
    const activeVisit = await storage.getActiveSalesVisitForRep(actor!.rep.id);
    if (activeVisit) {
      return res.status(409).json({ code: "visit_active", message: "Rep already has an active visit" });
    }

    const appSettings = await storage.getSalesAppSettings();
    // SEG-05: this only checked that the lead existed, not that it belonged to
    // the rep checking in. Beyond the visit itself the handler promotes the
    // lead and overwrites lastVisitAt/nextVisitDueAt — another rep's pipeline.
    const lead = await loadAccessibleLead(req, res, input.leadId);
    if (!lead) return;

    const plannedVisit = input.visitId ? await storage.getSalesVisit(input.visitId) : null;
    if (input.visitId && (
      !plannedVisit ||
      plannedVisit.repId !== actor!.rep.id ||
      plannedVisit.leadId !== lead.id ||
      plannedVisit.status !== "planned"
    )) {
      return res.status(400).json({ code: "planned_visit_unavailable", message: "Planned visit is not available for this check-in" });
    }

    const locations = await storage.listSalesLeadLocations(input.leadId);
    const requestedLocationId = input.locationId;
    const selectedLocation = requestedLocationId
      ? locations.find((location) => location.id === requestedLocationId)
      : locations.find((location) => location.isPrimary) || locations[0];

    let distanceFromTargetMeters: number | undefined;
    const allowedRadiusMeters = selectedLocation?.geofenceRadiusMeters || appSettings.defaultGeofenceRadiusMeters;

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
    }

    const decision = evaluateCheckInGeofence({
      distanceMeters: distanceFromTargetMeters ?? null,
      allowedRadiusMeters,
      requiresGps: appSettings.checkInRequiresGps,
      allowManualOverride: appSettings.allowManualOverride,
      manualOverrideReason: input.manualOverrideReason,
    });

    if (!decision.ok) {
      // The client reads these fields to explain the distance and, when the
      // organization allows it, ask for a reason and retry.
      return res.status(400).json({
        code: decision.code,
        message: decision.overrideAllowed
          ? "Outside geofence. Manual override reason required."
          : "Outside geofence. Move closer to the customer to check in.",
        distanceMeters: Math.round(distanceFromTargetMeters ?? 0),
        allowedRadiusMeters,
        accuracyMeters: input.gpsAccuracyMeters ?? null,
        overrideAllowed: decision.overrideAllowed,
      });
    }
    const { validationStatus } = decision;

    const checkInValues = {
      locationId: selectedLocation?.id,
      status: "in_progress" as const,
      checkedInAt: new Date(),
      checkInLat: input.lat == null ? null : String(input.lat),
      checkInLng: input.lng == null ? null : String(input.lng),
      distanceFromTargetMeters: distanceFromTargetMeters ?? null,
      gpsAccuracyMeters: input.gpsAccuracyMeters ?? null,
      validationStatus,
      manualOverrideReason: decision.manualOverrideReason,
    };
    const visit = await startVisitTransaction({
      repId: actor!.rep.id,
      leadId: lead.id,
      plannedVisitId: plannedVisit?.id,
      values: checkInValues,
    });
    if (!visit) {
      return res.status(409).json({ code: "planned_visit_changed", message: "Planned visit changed before check-in. Reload and try again." });
    }
    res.status(201).json({ visit, lead, location: selectedLocation ?? null });
  });

  router.post("/visits/:id/check-out", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const visitId = Number(req.params.id);
    const input = xpotCheckOutSchema.parse(req.body);
    const visit = await storage.getSalesVisit(visitId);

    if (!visit || visit.repId !== actor!.rep.id) {
      return res.status(404).json({ code: "visit_not_found", message: "Visit not found" });
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
      return res.status(404).json({ code: "visit_not_found", message: "Visit not found" });
    }

    if (visit.status !== "in_progress") {
      return res.status(400).json({ code: "visit_not_cancellable", message: "Only in-progress visits can be cancelled" });
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
      updateLeadLastVisit: false,
    });

    res.json(updated);
  });

  router.patch("/visits/:id", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const visitId = Number(req.params.id);
    const visit = await storage.getSalesVisit(visitId);
    if (!visit || visit.repId !== actor!.rep.id) {
      return res.status(404).json({ code: "visit_not_found", message: "Visit not found" });
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
      return res.status(404).json({ code: "visit_not_found", message: "Visit not found" });
    }
    if (visit.status === "planned") {
      await finishVisitTransaction({
        visitId: visit.id,
        leadId: visit.leadId,
        status: "cancelled",
        checkedOutAt: new Date(),
        durationSeconds: 0,
        updateLeadLastVisit: false,
      });
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
      return res.status(404).json({ code: "visit_not_found", message: "Visit not found" });
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
    if (!visit || visit.repId !== actor!.rep.id) return res.status(404).json({ code: "visit_not_found", message: "Visit not found" });
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
      return res.status(404).json({ code: "visit_not_found", message: "Visit not found" });
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

      // Transcribe (best-effort — does not block save on failure): Groq first,
      // OpenAI when Groq is off or fails; each only when switched on in the panel.
      let audioTranscription: string | null = null;
      const [groqIntegration, openaiIntegration] = await Promise.all([
        storage.getChatIntegration("groq"),
        storage.getChatIntegration("openai"),
      ]);
      for (const pick of transcriptionProviders({ groq: groqIntegration, openai: openaiIntegration })) {
        try {
          const file = new File([buffer], filename, { type: "audio/webm" });
          let transcription: unknown;
          if (pick.provider === "groq") {
            const Groq = (await import("groq-sdk")).default;
            const groq = new Groq({ apiKey: pick.apiKey });
            transcription = await groq.audio.transcriptions.create({ file, model: pick.model!, response_format: "text" });
          } else {
            const { OpenAI } = await import("openai");
            const openai = new OpenAI({ apiKey: pick.apiKey });
            transcription = await openai.audio.transcriptions.create({ file, model: pick.model!, response_format: "text" });
          }
          audioTranscription = String(transcription ?? "").trim() || null;
        } catch (transcriptionError: any) {
          console.error(`${pick.provider} transcription error:`, transcriptionError.message);
        }
        if (audioTranscription) break;
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
