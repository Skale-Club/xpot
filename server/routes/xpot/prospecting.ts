import { Router } from "express";
import { refusalBody } from "../../lib/validation.js";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
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
  MAX_DAILY_PROSPECTING_SESSIONS,
  ROUTE_MAX_STOPS,
  prospectingJobCreateSchema,
  prospectingRouteCreateSchema,
  type ProspectingRouteCreateInput,
  prospectingRouteReorderSchema,
  prospectingRouteReuseSchema,
  prospectingRouteStopAddSchema,
  prospectingRouteStatusUpdateSchema,
  prospectingStopUpdateSchema,
} from "#shared/prospecting.js";
import { ensureXpotRep, requireXpotUser } from "./middleware.js";
import { cancelProspectingJob, retryFailedProspectingRuns, tickProspectingQueueSafely } from "../../prospecting/queue.js";
import { isEngineConfigured } from "../../prospecting/google-maps-engine.js";
import type { RouteCandidate } from "../../prospecting/route-optimizer.js";
import {
  GoogleRouteOptimizationError,
  optimizeRouteWithGoogle,
} from "../../prospecting/google-route-optimizer.js";
import { OrganizationError, organizationIdForRep } from "../../organizations/service.js";
import {
  createProspectingJobForRep,
  prospectingJobDetails,
  ProspectingServiceError,
} from "../../prospecting/service.js";
import { xpotPushSubscriptionSchema } from "#shared/xpot.js";
import { pushPublicKey, savePushSubscription } from "../../push-notifications.js";
import { retryAutomaticRoute } from "../../prospecting/auto-route.js";
import { openWindowsOn, secondsUntilDayEnd } from "../../prospecting/opening-hours.js";
import { ensureProspectingCandidateLead } from "../../prospecting/lead-materializer.js";
import { materializeStopVisit, publishProspectingRouteForRep } from "../../prospecting/route-publisher.js";
import {
  addRouteStop,
  EDITABLE_ROUTE_STATUSES,
  removeRouteStop,
  reorderRouteStops,
  RouteEditError,
  UNREACHED_STOP_STATUSES,
} from "../../prospecting/route-editing.js";
import { isActiveRoute, lockRepDay, repDay } from "../../prospecting/daily-sessions.js";
import { checkInStop, finishStop } from "../../prospecting/visit-sync.js";

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
class DailyRouteLimitError extends Error {}
/** Today's route is being prepared right now (a search or another optimization holds the day). */
class RouteBeingPreparedError extends Error {}

/** Lists are bounded until they get real paging (BACKLOG PRF-02). */
const JOB_LIST_LIMIT = 100;
const ROUTE_LIST_LIMIT = 200;

/** A path id that is not a positive integer can't match a row; answer 404, not a SQL error. */
function pathId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * A route that ends early (cancelled, or completed by hand) releases the stops
 * nobody reached: their planned visits leave the agenda as cancelled, and the
 * discovered businesses go back to the pool for another day. A stop already
 * checked in keeps its visit; checkout still completes it.
 */
async function releaseUnvisitedStops(tx: Tx, routeId: number, reason: string, now: Date) {
  const open = await tx.select({
    id: prospectingRouteStops.id,
    visitId: prospectingRouteStops.visitId,
    candidateId: prospectingRouteStops.candidateId,
  }).from(prospectingRouteStops).where(and(
    eq(prospectingRouteStops.routeId, routeId),
    inArray(prospectingRouteStops.status, [...UNREACHED_STOP_STATUSES]),
  ));
  if (!open.length) return;
  await tx.update(prospectingRouteStops).set({ status: "skipped", skipReason: reason, completedAt: now, updatedAt: now })
    .where(inArray(prospectingRouteStops.id, open.map((stop) => stop.id)));
  const visitIds = open.flatMap((stop) => stop.visitId ? [stop.visitId] : []);
  if (visitIds.length) {
    await tx.update(salesVisits).set({ status: "cancelled", updatedAt: now })
      .where(and(inArray(salesVisits.id, visitIds), eq(salesVisits.status, "planned")));
  }
  const candidateIds = open.flatMap((stop) => stop.candidateId ? [stop.candidateId] : []);
  if (candidateIds.length) {
    await tx.update(prospectingCandidates).set({ status: "discovered", updatedAt: now })
      .where(and(inArray(prospectingCandidates.id, candidateIds), eq(prospectingCandidates.status, "scheduled")));
  }
}

export function createProspectingRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/notifications/push/public-key", (_req, res) => {
    res.json({ publicKey: pushPublicKey() });
  });

  router.post("/notifications/push/subscribe", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = xpotPushSubscriptionSchema.parse(req.body);
    res.status(201).json(await savePushSubscription(actor.rep.id, input, req.get("user-agent")));
  });

  router.get("/prospecting/jobs", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    res.json(await db.select().from(prospectingJobs)
      .where(eq(prospectingJobs.repId, actor.rep.id))
      .orderBy(desc(prospectingJobs.createdAt))
      .limit(JOB_LIST_LIMIT));
  });

  router.post("/prospecting/jobs", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = prospectingJobCreateSchema.parse(req.body);
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
    const jobId = pathId(req.params.id);
    const details = jobId ? await prospectingJobDetails(jobId, actor.rep.id) : null;
    if (!details) return res.status(404).json({ message: "Prospecting job not found" });
    res.json(details);
  });

  router.post("/prospecting/jobs/:id/refresh", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const jobId = pathId(req.params.id);
    if (!jobId || !(await prospectingJobDetails(jobId, actor.rep.id))) return res.status(404).json({ message: "Prospecting job not found" });
    await tickProspectingQueueSafely();
    res.json(await prospectingJobDetails(jobId, actor.rep.id));
  });

  router.post("/prospecting/jobs/:id/retry", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const jobId = pathId(req.params.id);
    const details = jobId ? await prospectingJobDetails(jobId, actor.rep.id) : null;
    if (!jobId || !details) return res.status(404).json({ message: "Prospecting job not found" });
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

  // The rep stops their own search (still running or waiting, or finished
  // with a route that never got built), to start another one.
  router.post("/prospecting/jobs/:id/cancel", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const jobId = pathId(req.params.id);
    const result = jobId ? await cancelProspectingJob(jobId, actor.rep.id) : { outcome: "not_found" as const };
    if (result.outcome === "not_found") return res.status(404).json({ message: "Prospecting job not found" });
    if (result.outcome === "not_cancellable") {
      return res.status(409).json({ code: "search_not_cancellable", message: "This search has already finished." });
    }
    return res.json(await prospectingJobDetails(result.jobId, actor.rep.id));
  });

  router.post("/prospecting/jobs/:id/route/retry", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const jobId = pathId(req.params.id);
    const retried = jobId ? await retryAutomaticRoute(jobId, actor.rep.id) : null;
    if (retried?.outcome === "expired") {
      return res.status(409).json({ message: "This search is from an earlier day. Start a new search, or reuse its route if it has one." });
    }
    if (retried?.outcome !== "retried") return res.status(409).json({ message: "This route is not ready to retry." });
    void tickProspectingQueueSafely();
    return res.status(202).json(await prospectingJobDetails(retried.job.id, actor.rep.id));
  });

  router.get("/prospecting/routes", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    // The history says whether a past route was used: how many of its stops got a check-in.
    // The outer column is spelled out: inside a select list drizzle prints it as a bare
    // "id", which the subquery would read as the stop's own id.
    const rows = await db.select({
      route: prospectingRoutes,
      stopCount: sql<number>`(select count(*)::int from prospecting_route_stops s where s.route_id = "prospecting_routes"."id")`,
      visitedStopCount: sql<number>`(select count(*)::int from prospecting_route_stops s where s.route_id = "prospecting_routes"."id" and s.status in ('checked_in', 'completed'))`,
    }).from(prospectingRoutes)
      .where(eq(prospectingRoutes.repId, actor.rep.id))
      .orderBy(desc(prospectingRoutes.routeDate), desc(prospectingRoutes.createdAt))
      .limit(ROUTE_LIST_LIMIT);
    res.json(rows.map(({ route, stopCount, visitedStopCount }) => ({ ...route, stopCount, visitedStopCount })));
  });

  type Actor = NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
  const reply = (status: number, body: unknown) => ({ status, body });

  /**
   * Builds (or returns) a rep's route for a day; shared by a new route and a
   * reused one. `replacesRouteId` is the past route a reuse takes over: it is
   * closed inside the same transaction as the new optimization, so a failed
   * optimization leaves it exactly as it was.
   */
  async function createRoute(actor: Actor, input: ProspectingRouteCreateInput, options: { replacesRouteId?: number } = {}) {
    if (input.jobId !== undefined) {
      const [ownedJob] = await db.select({ id: prospectingJobs.id, status: prospectingJobs.status })
        .from(prospectingJobs).where(and(
          eq(prospectingJobs.id, input.jobId),
          eq(prospectingJobs.repId, actor.rep.id),
        )).limit(1);
      if (!ownedJob) return reply(404, { message: "Prospecting job not found" });
      if (["draft", "queued", "running"].includes(ownedJob.status)) {
        return reply(409, { message: "Wait for prospecting discovery to finish before building the route." });
      }
    }
    // A seller can create a follow-up route after finishing the active one. The
    // bounded daily allowance protects paid discovery and optimization calls.
    if (input.rebuild && !actor.user.isAdmin) {
      return reply(403, { message: "Only the account owner can recalculate today's route." });
    }
    const rebuild = input.rebuild && actor.user.isAdmin;
    const existingRoute = (await repDay(db, actor.rep.id, input.routeDate)).activeRoute;
    if (existingRoute && !rebuild) {
      const existingStops = await db.select().from(prospectingRouteStops)
        .where(eq(prospectingRouteStops.routeId, existingRoute.id))
        .orderBy(asc(prospectingRouteStops.position));
      return reply(200, { route: existingRoute, stops: existingStops, reused: true });
    }
    // Only the selected leads are loaded, never the rep's whole lead list.
    const uniqueLeadIds = Array.from(new Set(input.leadIds));
    const leads = uniqueLeadIds.length ? await db.select().from(salesLeads).where(and(
      inArray(salesLeads.id, uniqueLeadIds),
      eq(salesLeads.ownerRepId, actor.rep.id),
      notInArray(salesLeads.status, ["customer", "inactive"]),
    )) : [];
    const locations = await storage.listSalesLeadLocationsBatch(leads.map((lead) => lead.id));
    const locationByLead = new Map<number, (typeof locations)[number]>();
    for (const location of locations) {
      if (location.isPrimary || !locationByLead.has(location.leadId)) locationByLead.set(location.leadId, location);
    }

    // Leads go by their own id, discovered businesses by the negative of theirs.
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

    // Only the selection is loaded (never the rep's whole history with its raw
    // payloads). A business already visited, or excluded, is not routed again.
    const discovered = input.jobId !== undefined || input.candidateIds.length
      ? await db.select({
          id: prospectingCandidates.id,
          jobId: prospectingCandidates.jobId,
          leadId: prospectingCandidates.leadId,
          googlePlaceId: prospectingCandidates.googlePlaceId,
          name: prospectingCandidates.name,
          address: prospectingCandidates.address,
          lat: prospectingCandidates.lat,
          lng: prospectingCandidates.lng,
          score: prospectingCandidates.score,
          scoreReasons: prospectingCandidates.scoreReasons,
          // Only the two fields of the raw payload the schedule needs.
          openHours: sql<string | null>`${prospectingCandidates.rawPayload}->>'open_hours'`,
          timeZone: sql<string | null>`${prospectingCandidates.rawPayload}->>'timezone'`,
        }).from(prospectingCandidates).where(and(
          eq(prospectingCandidates.repId, actor.rep.id),
          notInArray(prospectingCandidates.status, ["discarded", "visited"]),
          input.jobId !== undefined ? eq(prospectingCandidates.jobId, input.jobId) : undefined,
          input.candidateIds.length ? inArray(prospectingCandidates.id, input.candidateIds) : undefined,
        )).orderBy(desc(prospectingCandidates.score), asc(prospectingCandidates.id))
      : [];
    // One business, one stop: a discovered place linked to a selected CRM lead,
    // the same Google place as a selected lead, or found again by another job,
    // would otherwise be visited twice.
    const routedLeadIds = new Set(candidates.map((candidate) => candidate.leadId));
    const routedPlaceIds = new Set(leads.flatMap((lead) => lead.googlePlaceId && candidates.some((candidate) => candidate.leadId === lead.id)
      ? [lead.googlePlaceId]
      : []));
    for (const candidate of discovered) {
      if (candidate.leadId && routedLeadIds.has(candidate.leadId)) continue;
      if (candidate.googlePlaceId && routedPlaceIds.has(candidate.googlePlaceId)) continue;
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
        openWindows: openWindowsOn(candidate, new Date(input.plannedStartAt)),
      });
      if (candidate.leadId) routedLeadIds.add(candidate.leadId);
      if (candidate.googlePlaceId) routedPlaceIds.add(candidate.googlePlaceId);
    }
    if (!candidates.length) {
      return reply(400, { message: "None of the selected prospects has usable coordinates.", missingCoordinates });
    }

    const plannedStartAt = new Date(input.plannedStartAt);
    // Same-day routes end by 10 PM where the businesses are; a route of saved
    // leads only (no business carries a zone) uses the rep's own zone.
    const routeTimeZone = discovered.map((candidate) => candidate.timeZone).find(Boolean) ?? input.timeZone;
    const dayLeftSeconds = secondsUntilDayEnd(routeTimeZone, plannedStartAt);
    const shiftDurationSeconds = Math.min(input.shiftDurationMinutes * 60, dayLeftSeconds ?? Infinity);
    let organizationId: number;
    try {
      organizationId = await organizationIdForRep(actor.rep.id);
    } catch (error) {
      if (error instanceof OrganizationError) return reply(error.status, refusalBody(error));
      throw error;
    }
    // The selling day starts at visit one. Getting from the rep's current
    // location to that visit is navigation and never consumes the work window.
    let result;
    try {
      result = await db.transaction(async (tx) => {
        // The day's lock covers the external request. Without it, two
        // simultaneous clicks could both be billed before the unique insert.
        // When it is held, the day's route is being prepared right now.
        if (!(await lockRepDay(tx, actor.rep.id, input.routeDate, { wait: false }))) throw new RouteBeingPreparedError();
        const day = await repDay(tx, actor.rep.id, input.routeDate);
        if (day.activeRoute && rebuild) {
          // Only an active route is replaced. Its unreached visits leave the
          // agenda and its businesses return to the pool before the new
          // optimization takes the day; a finished route stays in the history.
          await releaseUnvisitedStops(tx, day.activeRoute.id, "route_rebuilt", new Date());
          await tx.delete(prospectingRoutes).where(eq(prospectingRoutes.id, day.activeRoute.id));
        } else if (day.activeRoute) {
          const existingStops = await tx.select().from(prospectingRouteStops)
            .where(eq(prospectingRouteStops.routeId, day.activeRoute.id))
            .orderBy(asc(prospectingRouteStops.position));
          return { route: day.activeRoute, stops: existingStops, reused: true as const };
        } else if (!rebuild) {
          // A search of the day still running would end up with no route of its own.
          if (day.preparingJobs.some((job) => job.id !== input.jobId)) throw new RouteBeingPreparedError();
          if (day.limitReached(input.jobId)) throw new DailyRouteLimitError();
        }
        if (options.replacesRouteId !== undefined) {
          const [replaced] = await tx.select().from(prospectingRoutes).where(and(
            eq(prospectingRoutes.id, options.replacesRouteId),
            eq(prospectingRoutes.repId, actor.rep.id),
          )).limit(1).for("update");
          if (replaced && isActiveRoute(replaced)) {
            const now = new Date();
            await releaseUnvisitedStops(tx, replaced.id, "route_reused", now);
            await tx.update(prospectingRoutes).set({ status: "cancelled", updatedAt: now })
              .where(eq(prospectingRoutes.id, replaced.id));
          }
        }

        const optimized = await optimizeRouteWithGoogle({
          plannedStartAt,
          shiftDurationSeconds,
          maxStops: input.maxStops,
          candidates,
        });
        if (!optimized.stops.length) throw new NoProspectingStopFitsError();
        const routeStart = optimized.stops[0];

        const [route] = await tx.insert(prospectingRoutes).values({
          repId: actor.rep.id,
          // Only a route built for a search belongs to it. A route of hand-picked
          // or reused businesses has none, so the search's automatic pipeline
          // never mistakes it for its own.
          jobId: input.jobId ?? null,
          name: input.name ?? `Route — ${input.routeDate}`,
          routeDate: input.routeDate,
          plannedStartAt,
          plannedEndAt: new Date(plannedStartAt.getTime() + optimized.totalDurationSeconds * 1000),
          startAddress: routeStart.address ?? null,
          startLat: String(routeStart.lat),
          startLng: String(routeStart.lng),
          endAddress: null,
          endLat: null,
          endLng: null,
          maxStops: input.maxStops,
          defaultVisitMinutes: input.defaultVisitMinutes,
          optimizer: optimized.optimizer,
          totalDistanceMeters: optimized.totalDistanceMeters,
          totalDurationSeconds: optimized.totalDurationSeconds,
          optimizationMeta: {
            shiftDurationMinutes: input.shiftDurationMinutes,
            returnHome: false,
            automaticOrigin: "first_visit",
            excludesTravelToFirstVisit: true,
            missingCoordinates,
            excludedByBudget: optimized.excludedCandidateIds,
            distanceModel: optimized.optimizer === "google_route_optimization_v1" ? "google_road_network" : "haversine",
            trafficAware: optimized.trafficAware ?? false,
            encodedPolyline: optimized.encodedPolyline,
          },
        }).returning();
        const insertedStops = await tx.insert(prospectingRouteStops).values(optimized.stops.map((stop) => ({
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
        const stops = [];
        for (const stop of insertedStops) {
          if (stop.leadId || !stop.candidateId) {
            stops.push(stop);
            continue;
          }
          const leadId = await ensureProspectingCandidateLead(tx, {
            candidateId: stop.candidateId,
            repId: actor.rep.id,
            organizationId,
            territoryName: route.name,
          });
          await tx.update(prospectingRouteStops).set({ leadId, updatedAt: new Date() })
            .where(eq(prospectingRouteStops.id, stop.id));
          stops.push({ ...stop, leadId });
        }
        return { route, stops, optimized };
      });
    } catch (error) {
      if (error instanceof GoogleRouteOptimizationError) {
        return reply(502, { message: error.message });
      }
      if (error instanceof NoProspectingStopFitsError) {
        return reply(400, { message: "No selected prospect fits in the route's time budget." });
      }
      if (error instanceof DailyRouteLimitError) {
        return reply(429, { message: `You can create up to ${MAX_DAILY_PROSPECTING_SESSIONS} routes per day.` });
      }
      if (error instanceof RouteBeingPreparedError) {
        return reply(409, { message: "Your current route is still being prepared." });
      }
      throw error;
    }
    if ("reused" in result) return reply(200, result);
    const { optimized, ...payload } = result;
    return reply(201, { ...payload, excluded: { missingCoordinates, budget: optimized.excludedCandidateIds } });
  }

  router.post("/prospecting/routes", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = prospectingRouteCreateSchema.parse(req.body);
    const result = await createRoute(actor, input);
    res.status(result.status).json(result.body);
  });

  // A route from an earlier day becomes today's route again with the stops it
  // never reached. No new search: one optimization, and it counts toward the
  // daily limit like any route.
  router.post("/prospecting/routes/:id/reuse", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const routeId = pathId(req.params.id);
    const input = prospectingRouteReuseSchema.parse(req.body);
    const [route] = routeId ? await db.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.id, routeId),
      eq(prospectingRoutes.repId, actor.rep.id),
    )).limit(1) : [];
    if (!route) return res.status(404).json({ message: "Route not found" });
    if (route.routeDate >= input.routeDate) {
      return res.status(409).json({ message: "Only a route from an earlier day can be reused." });
    }
    const stops = await db.select().from(prospectingRouteStops)
      .where(eq(prospectingRouteStops.routeId, route.id))
      .orderBy(asc(prospectingRouteStops.position));
    const notVisited = stops.filter((stop) => !["checked_in", "completed"].includes(stop.status));
    if (!notVisited.length) {
      return res.status(409).json({ message: "Every stop of this route was already visited." });
    }
    const today = await repDay(db, actor.rep.id, input.routeDate);
    if (today.activeRoute) {
      return res.status(409).json({ message: "Today's route already exists. Redo it to start a new one." });
    }
    if (today.preparingJobs.length) {
      return res.status(409).json({ message: "Your current route is still being prepared." });
    }
    if (today.limitReached()) {
      return res.status(429).json({ message: `You can create up to ${MAX_DAILY_PROSPECTING_SESSIONS} routes per day.` });
    }
    const shiftMinutes = Number((route.optimizationMeta as Record<string, unknown> | null)?.shiftDurationMinutes);
    // A past route left open closes inside the new route's transaction (its old
    // planned visits leave the agenda, its businesses go back to the pool the
    // new route draws from), so a failed optimization keeps it as it was.
    const result = await createRoute(actor, {
      routeDate: input.routeDate,
      plannedStartAt: input.plannedStartAt,
      timeZone: input.timeZone,
      // The discovered businesses go by candidate so their opening hours still count.
      candidateIds: notVisited.flatMap((stop) => stop.candidateId ? [stop.candidateId] : []),
      leadIds: notVisited.flatMap((stop) => !stop.candidateId && stop.leadId ? [stop.leadId] : []),
      maxStops: route.maxStops,
      shiftDurationMinutes: Number.isFinite(shiftMinutes) ? Math.min(16 * 60, Math.max(30, shiftMinutes)) : 8 * 60,
      defaultVisitMinutes: route.defaultVisitMinutes,
      rebuild: false,
    }, { replacesRouteId: route.id });
    res.status(result.status).json(result.body);
  });

  router.get("/prospecting/routes/:id", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const routeId = pathId(req.params.id);
    const [route] = routeId ? await db.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.id, routeId),
      eq(prospectingRoutes.repId, actor.rep.id),
    )).limit(1) : [];
    if (!route) return res.status(404).json({ message: "Route not found" });
    const stops = await db.select().from(prospectingRouteStops)
      .where(eq(prospectingRouteStops.routeId, route.id))
      .orderBy(asc(prospectingRouteStops.position));
    const candidateIds = stops.flatMap((stop) => stop.candidateId ? [stop.candidateId] : []);
    const leadIds = stops.flatMap((stop) => stop.leadId ? [stop.leadId] : []);
    const candidates = candidateIds.length ? await db.select({
      id: prospectingCandidates.id,
      googlePlaceId: prospectingCandidates.googlePlaceId,
      ratingPermille: prospectingCandidates.ratingPermille,
      reviewCount: prospectingCandidates.reviewCount,
      phone: prospectingCandidates.phone,
      website: prospectingCandidates.website,
    }).from(prospectingCandidates).where(and(
      eq(prospectingCandidates.repId, actor.rep.id),
      inArray(prospectingCandidates.id, candidateIds),
    )) : [];
    const leads = leadIds.length ? await db.select({
      id: salesLeads.id,
      googlePlaceId: salesLeads.googlePlaceId,
      phone: salesLeads.phone,
      website: salesLeads.website,
    // The leads of the rep's own stops, whoever in the organization owns them.
    }).from(salesLeads).where(inArray(salesLeads.id, leadIds)) : [];
    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    res.json({
      route,
      stops: stops.map((stop) => {
        const candidate = stop.candidateId ? candidateById.get(stop.candidateId) : undefined;
        const lead = stop.leadId ? leadById.get(stop.leadId) : undefined;
        return {
          ...stop,
          googlePlaceId: candidate?.googlePlaceId ?? lead?.googlePlaceId ?? null,
          rating: candidate?.ratingPermille == null ? null : candidate.ratingPermille / 1000,
          reviewCount: candidate?.reviewCount ?? null,
          phone: candidate?.phone ?? lead?.phone ?? null,
          website: candidate?.website ?? lead?.website ?? null,
        };
      }),
    });
  });

  router.patch("/prospecting/routes/:id/stops/order", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const routeId = pathId(req.params.id);
    const input = prospectingRouteReorderSchema.parse(req.body);
    if (!routeId) return res.status(404).json({ message: "Route not found" });
    try {
      // Over the chosen hours is allowed: the rep is told how far over, not stopped.
      const { overtimeMinutes } = await reorderRouteStops({ routeId, repId: actor.rep.id, stopIds: input.stopIds });
      return res.json({ reordered: true, overtimeMinutes });
    } catch (error) {
      if (error instanceof RouteEditError) return res.status(error.status).json({ message: error.message });
      throw error;
    }
  });

  router.delete("/prospecting/routes/:routeId/stops/:stopId", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const routeId = pathId(req.params.routeId);
    const stopId = pathId(req.params.stopId);
    if (!routeId) return res.status(404).json({ message: "Route not found" });
    if (!stopId) return res.status(404).json({ message: "Route stop not found" });
    try {
      await removeRouteStop({ routeId, repId: actor.rep.id, stopId });
      return res.json({ removed: true });
    } catch (error) {
      if (error instanceof RouteEditError) return res.status(error.status).json({ message: error.message });
      throw error;
    }
  });

  router.post("/prospecting/routes/:id/stops", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const routeId = pathId(req.params.id);
    if (!routeId) return res.status(404).json({ message: "Route not found" });
    const input = prospectingRouteStopAddSchema.parse(req.body);
    try {
      const added = await addRouteStop({ routeId, repId: actor.rep.id, ...input });
      return res.status(201).json(added);
    } catch (error) {
      if (error instanceof RouteEditError) return res.status(error.status).json({ message: error.message });
      if (error instanceof OrganizationError) return res.status(error.status).json(refusalBody(error));
      throw error;
    }
  });

  /** The rep's route stop with the discovered business behind it, if any. */
  async function routeStopWithCandidate(actor: Actor, routeIdParam: string, stopIdParam: string) {
    const routeId = pathId(routeIdParam);
    const stopId = pathId(stopIdParam);
    const [route] = routeId ? await db.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.id, routeId),
      eq(prospectingRoutes.repId, actor.rep.id),
    )).limit(1) : [];
    if (!route || !stopId) return null;
    const [stop] = await db.select().from(prospectingRouteStops).where(and(
      eq(prospectingRouteStops.id, stopId),
      eq(prospectingRouteStops.routeId, route.id),
    )).limit(1);
    if (!stop) return null;
    const [candidate] = stop.candidateId ? await db.select().from(prospectingCandidates).where(and(
      eq(prospectingCandidates.id, stop.candidateId),
      eq(prospectingCandidates.repId, actor.rep.id),
    )).limit(1) : [undefined];
    return { route, stop, candidate: candidate ?? null };
  }

  /** The organization a new lead goes into, only asked for when the stop has no lead yet. */
  async function organizationForNewLead(actor: Actor, knownLeadId: number | null) {
    return knownLeadId ? null : organizationIdForRep(actor.rep.id);
  }

  // The plaque demo and the company page need the stop's business as a CRM
  // lead, with no visit. The lead is found or created the one way every route
  // path uses (ensureProspectingCandidateLead: one lead per Google place in the
  // organization, safe under concurrent taps).
  router.post("/prospecting/routes/:id/stops/:stopId/prepare-demo", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const found = await routeStopWithCandidate(actor, req.params.id, req.params.stopId);
    if (!found) return res.status(404).json({ message: "Route stop not found" });
    const { route, stop, candidate } = found;
    const knownLeadId = stop.leadId ?? candidate?.leadId ?? null;
    if (!knownLeadId && !candidate) return res.status(409).json({ message: "This stop has no business attached." });
    try {
      const organizationId = await organizationForNewLead(actor, knownLeadId);
      const leadId = await db.transaction(async (tx) => {
        const resolved = knownLeadId ?? await ensureProspectingCandidateLead(tx, {
          candidateId: candidate!.id,
          repId: actor.rep.id,
          organizationId: organizationId!,
          territoryName: route.name,
        });
        if (candidate && !candidate.leadId) {
          await tx.update(prospectingCandidates).set({ leadId: resolved, updatedAt: new Date() })
            .where(eq(prospectingCandidates.id, candidate.id));
        }
        await tx.update(prospectingRouteStops).set({ leadId: resolved, updatedAt: new Date() })
          .where(eq(prospectingRouteStops.id, stop.id));
        return resolved;
      });
      const [lead] = await db.select({ googlePlaceId: salesLeads.googlePlaceId }).from(salesLeads)
        .where(eq(salesLeads.id, leadId)).limit(1);
      return res.status(201).json({ leadId, name: stop.name, placeId: candidate?.googlePlaceId ?? lead?.googlePlaceId ?? null });
    } catch (error) {
      if (error instanceof OrganizationError) return res.status(error.status).json(refusalBody(error));
      throw error;
    }
  });

  // A stop checked in straight from the route gets its planned visit (once),
  // the same way publishing gives one to every stop.
  router.post("/prospecting/routes/:id/stops/:stopId/prepare-check-in", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const found = await routeStopWithCandidate(actor, req.params.id, req.params.stopId);
    if (!found) return res.status(404).json({ message: "Route stop not found" });
    const { route, candidate } = found;
    const knownLeadId = found.stop.leadId ?? candidate?.leadId ?? null;
    if (!knownLeadId && !candidate) return res.status(409).json({ message: "This stop cannot be prepared for check-in" });
    try {
      const organizationId = await organizationForNewLead(actor, knownLeadId);
      const prepared = await db.transaction(async (tx) => {
        // Locked so a double tap prepares one visit, not two.
        const [stop] = await tx.select().from(prospectingRouteStops)
          .where(eq(prospectingRouteStops.id, found.stop.id)).limit(1).for("update");
        if (!stop || !(UNREACHED_STOP_STATUSES as readonly string[]).includes(stop.status)) return { refused: true as const };
        if (stop.visitId) {
          const [visit] = await tx.select({ id: salesVisits.id, leadId: salesVisits.leadId, status: salesVisits.status })
            .from(salesVisits).where(and(eq(salesVisits.id, stop.visitId), eq(salesVisits.repId, actor.rep.id))).limit(1);
          if (visit?.status === "planned") return { created: false as const, leadId: visit.leadId, visitId: visit.id };
        }
        const visit = await materializeStopVisit(tx, {
          route,
          stop: { ...stop, leadId: stop.leadId ?? knownLeadId },
          repId: actor.rep.id,
          organizationId,
          scheduledAt: stop.estimatedArrivalAt ? new Date(stop.estimatedArrivalAt) : new Date(),
        });
        return { created: true as const, ...visit };
      });
      if ("refused" in prepared) return res.status(409).json({ message: "This stop is not available for check-in" });
      return res.status(prepared.created ? 201 : 200).json({ leadId: prepared.leadId, visitId: prepared.visitId });
    } catch (error) {
      if (error instanceof OrganizationError) return res.status(error.status).json(refusalBody(error));
      throw error;
    }
  });

  router.patch("/prospecting/routes/:id/status", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = prospectingRouteStatusUpdateSchema.parse(req.body);
    const routeId = pathId(req.params.id);
    const [route] = routeId ? await db.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.id, routeId),
      eq(prospectingRoutes.repId, actor.rep.id),
    )).limit(1) : [];
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
    if (input.status === "published") {
      try {
        const published = await publishProspectingRouteForRep(route.id, actor.rep.id);
        return res.json(published);
      } catch (error) {
        if (error instanceof OrganizationError) return res.status(error.status).json(refusalBody(error));
        throw error;
      }
    }
    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      if (input.status === "cancelled" || input.status === "completed") {
        await releaseUnvisitedStops(tx, route.id, input.status === "cancelled" ? "route_cancelled" : "route_completed", now);
      }
      const [changed] = await tx.update(prospectingRoutes).set({
        status: input.status,
        publishedAt: route.publishedAt,
        startedAt: input.status === "in_progress" ? now : route.startedAt,
        completedAt: input.status === "completed" ? now : route.completedAt,
        updatedAt: now,
      }).where(and(eq(prospectingRoutes.id, route.id), eq(prospectingRoutes.status, route.status))).returning();
      if (!changed) throw new Error("Route status changed concurrently. Reload and try again.");
      return changed;
    });
    res.json(updated);
  });

  // A stop status recorded by hand. It follows the same rules as the visit
  // workflow (visit-sync.ts): a skipped stop releases its planned visit and its
  // business, a finished last stop closes the route, and a stop already
  // finished stays finished.
  router.patch("/prospecting/routes/:routeId/stops/:stopId", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = prospectingStopUpdateSchema.parse(req.body);
    const routeId = pathId(req.params.routeId);
    const stopId = pathId(req.params.stopId);
    if (!routeId) return res.status(404).json({ message: "Route not found" });
    if (!stopId) return res.status(404).json({ message: "Route stop not found" });
    if (input.status === "skipped" && !input.skipReason) {
      return res.status(400).json({ message: "A skip reason is required." });
    }
    const outcome = await db.transaction(async (tx) => {
      const [route] = await tx.select().from(prospectingRoutes).where(and(
        eq(prospectingRoutes.id, routeId),
        eq(prospectingRoutes.repId, actor.rep.id),
      )).limit(1).for("update");
      if (!route) return reply(404, { message: "Route not found" });
      const [stop] = await tx.select().from(prospectingRouteStops).where(and(
        eq(prospectingRouteStops.id, stopId),
        eq(prospectingRouteStops.routeId, route.id),
      )).limit(1).for("update");
      if (!stop) return reply(404, { message: "Route stop not found" });
      if (!["published", "in_progress"].includes(route.status)) {
        return reply(409, { message: "Only a published route in progress can record stop execution." });
      }
      if (["completed", "skipped", "rescheduled"].includes(stop.status)) {
        return reply(409, { message: "This stop is already finished." });
      }
      const visitId = input.visitId === undefined ? stop.visitId : input.visitId;
      const [visit] = visitId ? await tx.select({ id: salesVisits.id, leadId: salesVisits.leadId, status: salesVisits.status })
        .from(salesVisits)
        .where(and(eq(salesVisits.id, visitId), eq(salesVisits.repId, actor.rep.id))).limit(1) : [];
      if (visitId && !visit) return reply(400, { message: "Visit does not belong to this representative." });
      if (visit && stop.leadId && visit.leadId !== stop.leadId) {
        return reply(400, { message: "Visit belongs to a different business than this stop." });
      }
      // A visit still to happen (or happening) is finished with its checkout, which completes the stop.
      if (input.status === "completed" && visit && ["planned", "in_progress"].includes(visit.status)) {
        return reply(409, { message: "Finish the visit with its checkout to complete this stop." });
      }

      const now = new Date();
      if (visitId !== stop.visitId) {
        await tx.update(prospectingRouteStops).set({ visitId, updatedAt: now }).where(eq(prospectingRouteStops.id, stop.id));
      }
      const current = { id: stop.id, routeId: route.id, candidateId: stop.candidateId, visitId };
      if (input.status === "checked_in") {
        await checkInStop(tx, current, now);
      } else if (input.status === "completed") {
        await finishStop(tx, current, { visited: true }, now);
      } else if (input.status === "skipped" || input.status === "rescheduled") {
        await finishStop(tx, current, {
          visited: false,
          status: input.status,
          skipReason: input.status === "skipped" ? input.skipReason! : input.skipReason ?? null,
        }, now);
      } else {
        await tx.update(prospectingRouteStops).set({ status: input.status, completedAt: null, updatedAt: now })
          .where(eq(prospectingRouteStops.id, stop.id));
      }
      const [updated] = await tx.select().from(prospectingRouteStops).where(eq(prospectingRouteStops.id, stop.id)).limit(1);
      return reply(200, updated);
    });
    res.status(outcome.status).json(outcome.body);
  });

  return router;
}
