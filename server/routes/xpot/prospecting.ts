import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { storage } from "../../storage.js";
import {
  prospectingJobs,
  prospectingCandidates,
  prospectingRoutes,
  prospectingRouteStops,
  salesLeads,
  salesLeadLocations,
  salesVisits,
} from "#shared/schema.js";
import {
  prospectingJobCreateSchema,
  prospectingRouteCreateSchema,
  prospectingRouteStatusUpdateSchema,
  prospectingStopUpdateSchema,
} from "#shared/prospecting.js";
import { ensureXpotRep, requireXpotUser } from "./middleware.js";
import { retryFailedProspectingRuns, tickProspectingQueueSafely } from "../../prospecting/queue.js";
import { isEngineConfigured } from "../../prospecting/google-maps-engine.js";
import type { RouteCandidate } from "../../prospecting/route-optimizer.js";
import {
  GoogleRouteOptimizationError,
  optimizeRouteWithGoogle,
} from "../../prospecting/google-route-optimizer.js";
import { organizationIdForRep } from "../../organizations/service.js";
import {
  createProspectingJobForRep,
  prospectingJobDetails,
  ProspectingServiceError,
} from "../../prospecting/service.js";

function lifecycleScore(lead: Awaited<ReturnType<typeof storage.getSalesLead>>): { score: number; reasons: string[] } {
  if (!lead) return { score: 0, reasons: [] };
  const reasons: string[] = [];
  let score = lead.status === "prospect" ? 80 : lead.status === "lead" ? 65 : lead.status === "active" ? 45 : 10;
  reasons.push(`${lead.status} lifecycle`);
  if (!lead.lastVisitAt) {
    score += 10;
    reasons.push("never visited");
  } else {
    const days = (Date.now() - new Date(lead.lastVisitAt).getTime()) / 86_400_000;
    if (days < 30) {
      score -= 30;
      reasons.push("visited in the last 30 days");
    }
  }
  if (lead.phone) { score += 5; reasons.push("phone available"); }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

class NoProspectingStopFitsError extends Error {}

export function createProspectingRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/prospecting/jobs", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    res.json(await db.select().from(prospectingJobs)
      .where(eq(prospectingJobs.repId, actor.rep.id))
      .orderBy(desc(prospectingJobs.createdAt)));
  });

  router.post("/prospecting/jobs", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = prospectingJobCreateSchema.parse(req.body);

    if (input.idempotencyKey) {
      const [existing] = await db.select().from(prospectingJobs).where(and(
        eq(prospectingJobs.repId, actor.rep.id),
        eq(prospectingJobs.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (existing) return res.status(200).json(await prospectingJobDetails(existing.id, actor.rep.id));
    }
    try {
      const result = await createProspectingJobForRep(actor.rep.id, input);
      return res.status(result.reused ? 200 : 202).json(result.details);
    } catch (error) {
      if (error instanceof ProspectingServiceError) return res.status(error.status).json({ message: error.message });
      throw error;
    }
  });

  router.get("/prospecting/jobs/:id", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const details = await prospectingJobDetails(Number(req.params.id), actor.rep.id);
    if (!details) return res.status(404).json({ message: "Prospecting job not found" });
    res.json(details);
  });

  router.post("/prospecting/jobs/:id/refresh", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const jobId = Number(req.params.id);
    if (!(await prospectingJobDetails(jobId, actor.rep.id))) return res.status(404).json({ message: "Prospecting job not found" });
    await tickProspectingQueueSafely();
    res.json(await prospectingJobDetails(jobId, actor.rep.id));
  });

  router.post("/prospecting/jobs/:id/retry", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const jobId = Number(req.params.id);
    const details = await prospectingJobDetails(jobId, actor.rep.id);
    if (!details) return res.status(404).json({ message: "Prospecting job not found" });
    if (!isEngineConfigured()) {
      return res.status(503).json({ message: "The prospecting engine is not configured." });
    }
    const retried = await retryFailedProspectingRuns(jobId, actor.rep.id);
    if (!retried) {
      return res.status(409).json({ message: "This prospecting job has no failed search to retry." });
    }
    void tickProspectingQueueSafely();
    return res.status(202).json(await prospectingJobDetails(jobId, actor.rep.id));
  });

  router.get("/prospecting/routes", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    res.json(await db.select().from(prospectingRoutes)
      .where(eq(prospectingRoutes.repId, actor.rep.id))
      .orderBy(desc(prospectingRoutes.routeDate), desc(prospectingRoutes.createdAt)));
  });

  router.post("/prospecting/routes", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = prospectingRouteCreateSchema.parse(req.body);
    if (input.jobId !== undefined) {
      const [ownedJob] = await db.select({ id: prospectingJobs.id, status: prospectingJobs.status })
        .from(prospectingJobs).where(and(
          eq(prospectingJobs.id, input.jobId),
          eq(prospectingJobs.repId, actor.rep.id),
        )).limit(1);
      if (!ownedJob) return res.status(404).json({ message: "Prospecting job not found" });
      if (["draft", "queued", "running"].includes(ownedJob.status)) {
        return res.status(409).json({ message: "Wait for prospecting discovery to finish before building the route." });
      }
    }
    // A seller gets exactly one paid optimization per calendar day. Reusing the
    // persisted route also makes retries, double-clicks and a second scrape free.
    const [existingRoute] = await db.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.repId, actor.rep.id),
      eq(prospectingRoutes.routeDate, input.routeDate),
    )).orderBy(desc(prospectingRoutes.createdAt)).limit(1);
    if (existingRoute) {
      const existingStops = await db.select().from(prospectingRouteStops)
        .where(eq(prospectingRouteStops.routeId, existingRoute.id))
        .orderBy(asc(prospectingRouteStops.position));
      return res.status(200).json({ route: existingRoute, stops: existingStops, reused: true });
    }
    const uniqueLeadIds = Array.from(new Set(input.leadIds));
    const leads = (await storage.listSalesLeads({ ownerRepId: actor.rep.id }))
      .filter((lead) => uniqueLeadIds.includes(lead.id) && !["customer", "inactive"].includes(lead.status));
    const locations = await storage.listSalesLeadLocationsBatch(leads.map((lead) => lead.id));
    const locationByLead = new Map<number, (typeof locations)[number]>();
    for (const location of locations) {
      if (location.isPrimary || !locationByLead.has(location.leadId)) locationByLead.set(location.leadId, location);
    }

    const missingCoordinates: number[] = [];
    const candidates: RouteCandidate[] = [];
    for (const lead of leads) {
      const location = locationByLead.get(lead.id);
      const lat = location?.lat == null ? NaN : Number(location.lat);
      const lng = location?.lng == null ? NaN : Number(location.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        missingCoordinates.push(lead.id);
        continue;
      }
      const score = lifecycleScore(lead);
      candidates.push({
        id: lead.id,
        leadId: lead.id,
        candidateId: null,
        name: lead.name,
        address: location ? [location.addressLine1, location.city, location.state].filter(Boolean).join(", ") : null,
        lat,
        lng,
        score: score.score,
        scoreReasons: score.reasons,
        serviceDurationSeconds: input.defaultVisitMinutes * 60,
      });
    }

    let discovered = await db.select().from(prospectingCandidates)
      .where(eq(prospectingCandidates.repId, actor.rep.id));
    if (input.jobId !== undefined) {
      discovered = discovered.filter((candidate) => candidate.jobId === input.jobId);
    }
    if (input.candidateIds.length) {
      const selected = new Set(input.candidateIds);
      discovered = discovered.filter((candidate) => selected.has(candidate.id));
    } else if (input.jobId === undefined) {
      discovered = [];
    }
    discovered = discovered.filter((candidate) => candidate.status !== "discarded");
    for (const candidate of discovered) {
      const lat = candidate.lat == null ? NaN : Number(candidate.lat);
      const lng = candidate.lng == null ? NaN : Number(candidate.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        missingCoordinates.push(-candidate.id);
        continue;
      }
      candidates.push({
        id: -candidate.id,
        leadId: candidate.leadId,
        candidateId: candidate.id,
        name: candidate.name,
        address: candidate.address,
        lat,
        lng,
        score: candidate.score,
        scoreReasons: candidate.scoreReasons,
        serviceDurationSeconds: input.defaultVisitMinutes * 60,
      });
    }
    if (!candidates.length) {
      return res.status(400).json({ message: "None of the selected prospects has usable coordinates.", missingCoordinates });
    }

    const plannedStartAt = new Date(input.plannedStartAt);
    let result;
    try {
      result = await db.transaction(async (tx) => {
        // The database lock covers the external request. Without it, two
        // simultaneous clicks could both be billed before the unique insert.
        await tx.execute(sql`select pg_advisory_xact_lock(${actor.rep.id}, hashtext(${input.routeDate}))`);
        const [lockedExisting] = await tx.select().from(prospectingRoutes).where(and(
          eq(prospectingRoutes.repId, actor.rep.id),
          eq(prospectingRoutes.routeDate, input.routeDate),
        )).limit(1);
        if (lockedExisting) {
          const existingStops = await tx.select().from(prospectingRouteStops)
            .where(eq(prospectingRouteStops.routeId, lockedExisting.id))
            .orderBy(asc(prospectingRouteStops.position));
          return { route: lockedExisting, stops: existingStops, reused: true as const };
        }

        const optimized = await optimizeRouteWithGoogle({
          start: input.start,
          end: input.end,
          plannedStartAt,
          shiftDurationSeconds: input.shiftDurationMinutes * 60,
          maxStops: input.maxStops,
          candidates,
        });
        if (!optimized.stops.length) throw new NoProspectingStopFitsError();

        const [route] = await tx.insert(prospectingRoutes).values({
          repId: actor.rep.id,
          jobId: input.jobId ?? discovered[0]?.jobId ?? null,
          name: input.name ?? `Prospecting — ${input.routeDate}`,
          routeDate: input.routeDate,
          plannedStartAt,
          plannedEndAt: new Date(plannedStartAt.getTime() + optimized.totalDurationSeconds * 1000),
          startAddress: input.start.address ?? null,
          startLat: String(input.start.lat),
          startLng: String(input.start.lng),
          endAddress: input.end?.address ?? input.start.address ?? null,
          endLat: String(input.end?.lat ?? input.start.lat),
          endLng: String(input.end?.lng ?? input.start.lng),
          maxStops: input.maxStops,
          defaultVisitMinutes: input.defaultVisitMinutes,
          optimizer: optimized.optimizer,
          totalDistanceMeters: optimized.totalDistanceMeters,
          totalDurationSeconds: optimized.totalDurationSeconds,
          optimizationMeta: {
            shiftDurationMinutes: input.shiftDurationMinutes,
            returnDistanceMeters: optimized.returnDistanceMeters,
            returnDurationSeconds: optimized.returnDurationSeconds,
            missingCoordinates,
            excludedByBudget: optimized.excludedCandidateIds,
            distanceModel: optimized.optimizer === "google_route_optimization_v1" ? "google_road_network" : "haversine",
            trafficAware: optimized.trafficAware ?? false,
            encodedPolyline: optimized.encodedPolyline,
          },
        }).returning();
        const stops = await tx.insert(prospectingRouteStops).values(optimized.stops.map((stop) => ({
          routeId: route.id,
          candidateId: stop.candidateId ?? null,
          leadId: stop.leadId,
          position: stop.position,
          name: stop.name,
          address: stop.address,
          lat: String(stop.lat),
          lng: String(stop.lng),
          score: stop.score,
          scoreReasons: stop.scoreReasons,
          serviceDurationSeconds: stop.serviceDurationSeconds,
          travelDistanceMeters: stop.travelDistanceMeters,
          travelDurationSeconds: stop.travelDurationSeconds,
          estimatedArrivalAt: stop.estimatedArrivalAt,
        }))).returning();
        return { route, stops, optimized };
      });
    } catch (error) {
      if (error instanceof GoogleRouteOptimizationError) {
        return res.status(502).json({ message: error.message });
      }
      if (error instanceof NoProspectingStopFitsError) {
        return res.status(400).json({ message: "No selected prospect fits in the route's time budget." });
      }
      throw error;
    }
    if ("reused" in result) return res.status(200).json(result);
    const { optimized, ...payload } = result;
    res.status(201).json({ ...payload, excluded: { missingCoordinates, budget: optimized.excludedCandidateIds } });
  });

  router.get("/prospecting/routes/:id", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const [route] = await db.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.id, Number(req.params.id)),
      eq(prospectingRoutes.repId, actor.rep.id),
    )).limit(1);
    if (!route) return res.status(404).json({ message: "Route not found" });
    const stops = await db.select().from(prospectingRouteStops)
      .where(eq(prospectingRouteStops.routeId, route.id))
      .orderBy(asc(prospectingRouteStops.position));
    res.json({ route, stops });
  });

  router.patch("/prospecting/routes/:id/status", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = prospectingRouteStatusUpdateSchema.parse(req.body);
    const [route] = await db.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.id, Number(req.params.id)),
      eq(prospectingRoutes.repId, actor.rep.id),
    )).limit(1);
    if (!route) return res.status(404).json({ message: "Route not found" });

    const allowed: Record<string, string[]> = {
      draft: ["published", "cancelled"],
      published: ["in_progress", "cancelled"],
      in_progress: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!allowed[route.status]?.includes(input.status)) {
      return res.status(409).json({ message: `Cannot move route from ${route.status} to ${input.status}.` });
    }
    const organizationId = input.status === "published"
      ? await organizationIdForRep(actor.rep.id)
      : null;
    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      if (input.status === "published") {
        const stops = await tx.select().from(prospectingRouteStops)
          .where(eq(prospectingRouteStops.routeId, route.id))
          .orderBy(asc(prospectingRouteStops.position));
        for (const stop of stops) {
          if (stop.visitId) continue;
          const [candidate] = stop.candidateId
            ? await tx.select().from(prospectingCandidates).where(and(
                eq(prospectingCandidates.id, stop.candidateId),
                eq(prospectingCandidates.repId, actor.rep.id),
              )).limit(1)
            : [undefined];
          let leadId = stop.leadId ?? candidate?.leadId ?? null;
          let locationId: number | null = null;

          if (!leadId && candidate?.googlePlaceId) {
            const [existing] = await tx.select({ id: salesLeads.id }).from(salesLeads).where(and(
              eq(salesLeads.ownerRepId, actor.rep.id),
              eq(salesLeads.googlePlaceId, candidate.googlePlaceId),
            )).limit(1);
            leadId = existing?.id ?? null;
          }
          if (!leadId && candidate) {
            const [lead] = await tx.insert(salesLeads).values({
              organizationId: organizationId!,
              name: candidate.name,
              website: candidate.website,
              phone: candidate.phone,
              email: candidate.email,
              industry: candidate.industry,
              source: "prospecting",
              status: "prospect",
              ownerRepId: actor.rep.id,
              territoryName: route.name,
              googlePlaceId: candidate.googlePlaceId,
            }).returning({ id: salesLeads.id });
            leadId = lead.id;
            const [location] = await tx.insert(salesLeadLocations).values({
              leadId,
              addressLine1: candidate.address || "Prospecting location",
              city: candidate.city,
              state: candidate.state,
              postalCode: candidate.postalCode,
              country: candidate.country || "US",
              lat: candidate.lat,
              lng: candidate.lng,
              isPrimary: true,
            }).returning({ id: salesLeadLocations.id });
            locationId = location.id;
          }

          if (!leadId) continue;
          if (!locationId) {
            const [location] = await tx.select({ id: salesLeadLocations.id })
              .from(salesLeadLocations)
              .where(eq(salesLeadLocations.leadId, leadId))
              .orderBy(desc(salesLeadLocations.isPrimary), asc(salesLeadLocations.id))
              .limit(1);
            locationId = location?.id ?? null;
          }

          const [visit] = await tx.insert(salesVisits).values({
            repId: actor.rep.id,
            leadId,
            locationId,
            status: "planned",
            scheduledAt: stop.estimatedArrivalAt,
            source: "prospecting-route",
          }).returning({ id: salesVisits.id });

          if (candidate) {
            await tx.update(prospectingCandidates).set({ leadId, status: "scheduled", updatedAt: now })
              .where(eq(prospectingCandidates.id, candidate.id));
          }
          await tx.update(prospectingRouteStops).set({ leadId, visitId: visit.id, updatedAt: now })
            .where(eq(prospectingRouteStops.id, stop.id));
        }
      }
      const [changed] = await tx.update(prospectingRoutes).set({
        status: input.status,
        publishedAt: input.status === "published" ? now : route.publishedAt,
        startedAt: input.status === "in_progress" ? now : route.startedAt,
        completedAt: input.status === "completed" ? now : route.completedAt,
        updatedAt: now,
      }).where(and(eq(prospectingRoutes.id, route.id), eq(prospectingRoutes.status, route.status))).returning();
      if (!changed) throw new Error("Route status changed concurrently. Reload and try again.");
      return changed;
    });
    res.json(updated);
  });

  router.patch("/prospecting/routes/:routeId/stops/:stopId", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = prospectingStopUpdateSchema.parse(req.body);
    const [route] = await db.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.id, Number(req.params.routeId)),
      eq(prospectingRoutes.repId, actor.rep.id),
    )).limit(1);
    if (!route) return res.status(404).json({ message: "Route not found" });
    const [stop] = await db.select().from(prospectingRouteStops).where(and(
      eq(prospectingRouteStops.id, Number(req.params.stopId)),
      eq(prospectingRouteStops.routeId, route.id),
    )).limit(1);
    if (!stop) return res.status(404).json({ message: "Route stop not found" });
    if (input.status === "skipped" && !input.skipReason) {
      return res.status(400).json({ message: "A skip reason is required." });
    }
    if (input.visitId) {
      const [visit] = await db.select({ id: salesVisits.id })
        .from(salesVisits)
        .where(and(
          eq(salesVisits.id, input.visitId),
          eq(salesVisits.repId, actor.rep.id),
        )).limit(1);
      if (!visit) return res.status(400).json({ message: "Visit does not belong to this representative." });
    }
    const [updated] = await db.update(prospectingRouteStops).set({
      status: input.status,
      skipReason: input.status === "skipped" ? input.skipReason ?? null : null,
      visitId: input.visitId === undefined ? stop.visitId : input.visitId,
      completedAt: ["completed", "skipped"].includes(input.status) ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(prospectingRouteStops.id, stop.id)).returning();
    res.json(updated);
  });

  return router;
}
