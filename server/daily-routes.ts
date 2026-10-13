import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  salesDailyRoutes,
  salesDailyRouteStops,
  salesLeadLocations,
  salesLeads,
  salesRouteGenerationAttempts,
  salesUserNotifications,
  salesVisits,
  type SalesDailyRoute,
  type SalesDailyRouteStop,
  type SalesVisitStatus,
} from "#shared/schema.js";
import { resolveGoogleApiKey } from "./routes/xpot/google.js";
import { parseGoogleRoutePlan } from "#shared/daily-route.js";
import { sendPushNotification } from "./push-notifications.js";
export { isValidTimezone, localDateInTimezone } from "#shared/daily-route.js";

type PlaceCandidate = {
  placeId?: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  industry?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
  openNow?: boolean;
  mapsUrl?: string;
  leadId?: number;
  locationId?: number;
};

type ProviderCheckpoint = {
  places?: PlaceCandidate[];
  placesCreditUnits?: number;
  routePlan?: {
    orderedPlaceIds: string[];
    driveMinutes: number[];
    polyline?: string;
  };
  routesCreditUnits?: number;
};

const runningJobs = new Set<number>();

export class DailyRouteError extends Error {
  constructor(public code: "route_stop_not_found" | "route_stop_unavailable", message: string) {
    super(message);
  }
}

export async function startRouteVisit(input: {
  repId: number;
  leadId: number;
  locationId?: number | null;
  stopId: number;
  validationStatus: "valid" | "outside_geofence" | "gps_unavailable" | "manual_override";
  checkedInAt: Date;
  lat?: number;
  lng?: number;
  distanceFromTargetMeters?: number | null;
  gpsAccuracyMeters?: number | null;
  manualOverrideReason?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [context] = await tx.select({ stop: salesDailyRouteStops, route: salesDailyRoutes })
      .from(salesDailyRouteStops)
      .innerJoin(salesDailyRoutes, eq(salesDailyRoutes.id, salesDailyRouteStops.routeId))
      .where(and(
        eq(salesDailyRouteStops.id, input.stopId),
        eq(salesDailyRouteStops.leadId, input.leadId),
        eq(salesDailyRoutes.repId, input.repId),
        eq(salesDailyRouteStops.version, salesDailyRoutes.version),
      ));
    if (!context) throw new DailyRouteError("route_stop_not_found", "Route stop not found");
    if (context.stop.status !== "planned") throw new DailyRouteError("route_stop_unavailable", "This route stop is no longer available for check-in");

    const [visit] = await tx.insert(salesVisits).values({
      repId: input.repId,
      leadId: input.leadId,
      locationId: input.locationId,
      status: "in_progress",
      checkedInAt: input.checkedInAt,
      checkInLat: input.lat?.toString(),
      checkInLng: input.lng?.toString(),
      distanceFromTargetMeters: input.distanceFromTargetMeters ?? null,
      gpsAccuracyMeters: input.gpsAccuracyMeters ?? null,
      validationStatus: input.validationStatus,
      manualOverrideReason: input.manualOverrideReason,
      source: "field-mobile",
    }).returning();
    const [claimed] = await tx.update(salesDailyRouteStops).set({
      status: "in_progress",
      visitId: visit.id,
      updatedAt: new Date(),
    }).where(and(
      eq(salesDailyRouteStops.id, input.stopId),
      eq(salesDailyRouteStops.status, "planned"),
    )).returning();
    if (!claimed) throw new DailyRouteError("route_stop_unavailable", "This route stop is no longer available for check-in");
    await tx.update(salesDailyRoutes).set({
      status: "active",
      startedAt: sql`coalesce(${salesDailyRoutes.startedAt}, now())`,
      updatedAt: new Date(),
    }).where(eq(salesDailyRoutes.id, context.route.id));
    await tx.update(salesLeads).set({
      status: sql`case when ${salesLeads.status} = 'prospect' then 'lead' else ${salesLeads.status} end`,
      lastVisitAt: input.checkedInAt,
      nextVisitDueAt: null,
      updatedAt: new Date(),
    }).where(eq(salesLeads.id, input.leadId));
    return visit;
  });
}

export async function finishVisitTransaction(input: {
  visitId: number;
  leadId: number;
  status: SalesVisitStatus;
  checkedOutAt: Date;
  durationSeconds: number;
  checkOutLat?: number;
  checkOutLng?: number;
  routeStopStatus: "summary_pending" | "planned";
  updateLeadLastVisit: boolean;
}) {
  return db.transaction(async (tx) => {
    const [visit] = await tx.update(salesVisits).set({
      status: input.status,
      checkedOutAt: input.checkedOutAt,
      durationSeconds: input.durationSeconds,
      checkOutLat: input.checkOutLat?.toString(),
      checkOutLng: input.checkOutLng?.toString(),
      updatedAt: new Date(),
    }).where(eq(salesVisits.id, input.visitId)).returning();
    if (!visit) throw new Error("Visit not found");
    if (input.updateLeadLastVisit) {
      await tx.update(salesLeads).set({ lastVisitAt: input.checkedOutAt, updatedAt: new Date() })
        .where(eq(salesLeads.id, input.leadId));
    }
    await tx.update(salesDailyRouteStops).set({
      status: input.routeStopStatus,
      ...(input.routeStopStatus === "planned" ? { visitId: null } : {}),
      updatedAt: new Date(),
    }).where(eq(salesDailyRouteStops.visitId, input.visitId));
    return visit;
  });
}

export async function getDailyRoute(repId: number, _organizationId: number, routeDate: string) {
  const [route] = await db.select().from(salesDailyRoutes).where(and(
    eq(salesDailyRoutes.repId, repId),
    eq(salesDailyRoutes.routeDate, routeDate),
  ));
  return route;
}

export async function getDailyRouteBundle(route: SalesDailyRoute | undefined) {
  if (!route) return null;
  const stops = await db.select().from(salesDailyRouteStops).where(and(
    eq(salesDailyRouteStops.routeId, route.id),
    eq(salesDailyRouteStops.version, route.version),
  )).orderBy(asc(salesDailyRouteStops.sequence));
  return { route, stops };
}

function distanceKm(a: PlaceCandidate, b: PlaceCandidate): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Number.MAX_SAFE_INTEGER;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function nearestNeighbor(candidates: PlaceCandidate[]): PlaceCandidate[] {
  if (candidates.length < 3) return candidates;
  const remaining = candidates.slice(1);
  const ordered = [candidates[0]];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestDistance = distanceKm(current, remaining[0]);
    for (let index = 1; index < remaining.length; index += 1) {
      const candidateDistance = distanceKm(current, remaining[index]);
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestIndex = index;
      }
    }
    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }
  return ordered;
}

function candidateKey(candidate: PlaceCandidate): string {
  return candidate.placeId ?? (candidate.leadId ? `lead:${candidate.leadId}` : `${candidate.name}|${candidate.address}`);
}

async function optimizeGoogleRoute(candidates: PlaceCandidate[]) {
  const fallback = nearestNeighbor(candidates);
  const fallbackPlan = {
    ordered: fallback,
    driveMinutes: fallback.map((candidate, index) => {
      if (index === 0) return 0;
      const distance = distanceKm(fallback[index - 1], candidate);
      return Number.isFinite(distance) && distance < Number.MAX_SAFE_INTEGER
        ? Math.min(240, Math.max(4, Math.round(distance * 3)))
        : 15;
    }),
    polyline: undefined as string | undefined,
    creditUnits: 0,
  };
  if (candidates.length < 2 || candidates.some((candidate) => candidate.lat == null || candidate.lng == null)) return fallbackPlan;
  const apiKey = await resolveGoogleApiKey();
  if (!apiKey) return fallbackPlan;
  const waypoint = (candidate: PlaceCandidate) => ({
    location: { latLng: { latitude: candidate.lat, longitude: candidate.lng } },
  });
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex,routes.legs.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: waypoint(candidates[0]),
      destination: waypoint(candidates[candidates.length - 1]),
      intermediates: candidates.slice(1, -1).map(waypoint),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      optimizeWaypointOrder: candidates.length > 2,
    }),
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 500) || "Google Routes optimization failed");
  const data = await response.json() as { routes?: Parameters<typeof parseGoogleRoutePlan>[1][] };
  const googleRoute = data.routes?.[0];
  if (!googleRoute) throw new Error("Google Routes returned no drivable route");
  const plan = parseGoogleRoutePlan(candidates.map(candidateKey), googleRoute);
  const byKey = new Map(candidates.map((candidate) => [candidateKey(candidate), candidate]));
  return {
    ordered: plan.orderedKeys.map((key) => byKey.get(key)).filter((candidate): candidate is PlaceCandidate => Boolean(candidate)),
    driveMinutes: plan.driveMinutes,
    polyline: plan.polyline,
    creditUnits: 1,
  };
}

async function searchGooglePlaces(route: SalesDailyRoute): Promise<{ candidates: PlaceCandidate[]; creditUnits: number }> {
  const apiKey = await resolveGoogleApiKey();
  if (!apiKey) return { candidates: [], creditUnits: 0 };
  const targetCount = Math.min(18, Math.max(4, Math.floor(route.durationMinutes / 35)));
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.primaryTypeDisplayName",
        "places.websiteUri",
        "places.nationalPhoneNumber",
        "places.rating",
        "places.userRatingCount",
        "places.currentOpeningHours.openNow",
        "places.googleMapsUri",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `${route.industry} in ${route.city}`,
      pageSize: targetCount,
      languageCode: "en",
      regionCode: "US",
      strictTypeFiltering: false,
    }),
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 500) || "Google Places search failed");
  const data = await response.json() as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      primaryTypeDisplayName?: { text?: string };
      websiteUri?: string;
      nationalPhoneNumber?: string;
      rating?: number;
      userRatingCount?: number;
      currentOpeningHours?: { openNow?: boolean };
      googleMapsUri?: string;
    }>;
  };
  const candidates = (data.places ?? []).flatMap((place) => {
    if (!place.id || !place.displayName?.text) return [];
    return [{
      placeId: place.id,
      name: place.displayName.text,
      address: place.formattedAddress ?? route.city,
      phone: place.nationalPhoneNumber,
      website: place.websiteUri,
      industry: place.primaryTypeDisplayName?.text ?? route.industry,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      rating: place.rating,
      reviewCount: place.userRatingCount,
      openNow: place.currentOpeningHours?.openNow,
      mapsUrl: place.googleMapsUri,
    }];
  });
  return { candidates, creditUnits: 1 };
}

async function existingCandidates(route: SalesDailyRoute): Promise<PlaceCandidate[]> {
  const rows = await db.select({ lead: salesLeads, location: salesLeadLocations })
    .from(salesLeads)
    .leftJoin(salesLeadLocations, and(
      eq(salesLeadLocations.leadId, salesLeads.id),
      eq(salesLeadLocations.isPrimary, true),
    ))
    .where(and(
      eq(salesLeads.organizationId, route.organizationId),
      eq(salesLeads.ownerRepId, route.repId),
      ilike(salesLeads.industry, `%${route.industry}%`),
    ))
    .orderBy(desc(salesLeads.updatedAt))
    .limit(20);
  return rows.filter(({ location }) => {
    if (!location) return false;
    return !location.city || location.city.toLowerCase().includes(route.city.toLowerCase());
  }).map(({ lead, location }) => ({
    leadId: lead.id,
    locationId: location!.id,
    placeId: lead.googlePlaceId ?? undefined,
    name: lead.name,
    address: [location!.addressLine1, location!.city, location!.state].filter(Boolean).join(", "),
    phone: lead.phone ?? undefined,
    website: lead.website ?? undefined,
    industry: lead.industry ?? route.industry,
    lat: location!.lat ? Number(location!.lat) : undefined,
    lng: location!.lng ? Number(location!.lng) : undefined,
  }));
}

async function materializeCandidate(route: SalesDailyRoute, candidate: PlaceCandidate): Promise<PlaceCandidate> {
  if (candidate.leadId && candidate.locationId) return candidate;
  let lead = candidate.placeId
    ? (await db.select().from(salesLeads).where(and(
      eq(salesLeads.organizationId, route.organizationId),
      eq(salesLeads.ownerRepId, route.repId),
      eq(salesLeads.googlePlaceId, candidate.placeId),
    )).limit(1))[0]
    : undefined;
  if (!lead) {
    [lead] = await db.insert(salesLeads).values({
      organizationId: route.organizationId,
      ownerRepId: route.repId,
      name: candidate.name,
      phone: candidate.phone,
      website: candidate.website,
      industry: candidate.industry ?? route.industry,
      source: "daily_route",
      status: "prospect",
      territoryName: route.city,
      googlePlaceId: candidate.placeId,
      notes: "Discovered while generating a daily prospecting route",
    }).returning();
  }
  let location = (await db.select().from(salesLeadLocations).where(eq(salesLeadLocations.leadId, lead.id)).orderBy(desc(salesLeadLocations.isPrimary)).limit(1))[0];
  if (!location) {
    [location] = await db.insert(salesLeadLocations).values({
      leadId: lead.id,
      label: "Main",
      addressLine1: candidate.address || route.city,
      city: route.city,
      country: "US",
      lat: candidate.lat?.toString(),
      lng: candidate.lng?.toString(),
      geofenceRadiusMeters: 150,
      isPrimary: true,
    }).returning();
  }
  return { ...candidate, leadId: lead.id, locationId: location.id };
}

export async function generateDailyRoute(routeId: number): Promise<void> {
  if (runningJobs.has(routeId)) return;
  runningJobs.add(routeId);
  try {
    const [route] = await db.select().from(salesDailyRoutes).where(eq(salesDailyRoutes.id, routeId));
    if (!route || !["queued", "generating", "failed"].includes(route.status)) return;
    await db.update(salesDailyRoutes).set({
      status: "generating",
      generationStage: "discovering",
      errorMessage: null,
      updatedAt: new Date(),
    }).where(eq(salesDailyRoutes.id, route.id));
    await db.update(salesRouteGenerationAttempts).set({ status: "generating", startedAt: new Date() }).where(and(
      eq(salesRouteGenerationAttempts.routeId, route.id),
      eq(salesRouteGenerationAttempts.version, route.version),
    ));

    const [attempt] = await db.select().from(salesRouteGenerationAttempts).where(and(
      eq(salesRouteGenerationAttempts.routeId, route.id),
      eq(salesRouteGenerationAttempts.version, route.version),
    )).orderBy(desc(salesRouteGenerationAttempts.id)).limit(1);
    const checkpoint = (attempt?.providerPayload ?? {}) as ProviderCheckpoint;
    const googleSearch = checkpoint.places
      ? { candidates: checkpoint.places, creditUnits: checkpoint.placesCreditUnits ?? attempt?.creditUnits ?? 0 }
      : await searchGooglePlaces(route);
    if (!checkpoint.places) {
      checkpoint.places = googleSearch.candidates;
      checkpoint.placesCreditUnits = googleSearch.creditUnits;
      await db.update(salesRouteGenerationAttempts).set({
        providerPayload: checkpoint,
        providerCompletedAt: new Date(),
        creditUnits: googleSearch.creditUnits,
      }).where(eq(salesRouteGenerationAttempts.id, attempt.id));
    }
    const existing = await existingCandidates(route);
    const google = googleSearch.candidates;
    await db.update(salesDailyRoutes).set({ generationStage: "qualifying", updatedAt: new Date() }).where(eq(salesDailyRoutes.id, route.id));
    const byIdentity = new Map<string, PlaceCandidate>();
    for (const candidate of [...google, ...existing]) {
      const key = candidate.placeId || `${candidate.name.toLowerCase()}|${candidate.address.toLowerCase()}`;
      if (!byIdentity.has(key)) byIdentity.set(key, candidate);
    }
    const maxStops = Math.min(18, Math.max(3, Math.floor(route.durationMinutes / 35)));
    const qualified = Array.from(byIdentity.values())
      .sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
      .slice(0, maxStops);
    if (!qualified.length) throw new Error("No businesses were found for this segment and city");

    await db.update(salesDailyRoutes).set({ generationStage: "optimizing", updatedAt: new Date() }).where(eq(salesDailyRoutes.id, route.id));
    const materialized: PlaceCandidate[] = [];
    for (const candidate of qualified) materialized.push(await materializeCandidate(route, candidate));
    let ordered: PlaceCandidate[];
    let driveMinutes: number[];
    let routePolyline: string | undefined;
    if (checkpoint.routePlan) {
      const byKey = new Map(materialized.map((candidate) => [candidateKey(candidate), candidate]));
      ordered = checkpoint.routePlan.orderedPlaceIds.map((key) => byKey.get(key)).filter((candidate): candidate is PlaceCandidate => Boolean(candidate));
      driveMinutes = checkpoint.routePlan.driveMinutes;
      routePolyline = checkpoint.routePlan.polyline;
    } else {
      const optimized = await optimizeGoogleRoute(materialized);
      ordered = optimized.ordered;
      driveMinutes = optimized.driveMinutes;
      routePolyline = optimized.polyline;
      checkpoint.routePlan = {
        orderedPlaceIds: ordered.map(candidateKey),
        driveMinutes,
        polyline: routePolyline,
      };
      checkpoint.routesCreditUnits = optimized.creditUnits;
      await db.update(salesRouteGenerationAttempts).set({
        providerPayload: checkpoint,
        providerCompletedAt: new Date(),
        creditUnits: (checkpoint.placesCreditUnits ?? googleSearch.creditUnits) + optimized.creditUnits,
      }).where(eq(salesRouteGenerationAttempts.id, attempt.id));
    }

    await db.update(salesDailyRoutes).set({ generationStage: "finalizing", updatedAt: new Date() }).where(eq(salesDailyRoutes.id, route.id));
    await db.transaction(async (tx) => {
      await tx.delete(salesDailyRouteStops).where(and(
        eq(salesDailyRouteStops.routeId, route.id),
        eq(salesDailyRouteStops.version, route.version),
      ));
      let elapsed = 0;
      await tx.insert(salesDailyRouteStops).values(ordered.map((candidate, index) => {
        const legDriveMinutes = driveMinutes[index] ?? 0;
        elapsed += legDriveMinutes;
        const arrivalOffsetMinutes = elapsed;
        elapsed += 20;
        return {
          routeId: route.id,
          version: route.version,
          sequence: index + 1,
          leadId: candidate.leadId!,
          locationId: candidate.locationId!,
          nameSnapshot: candidate.name,
          addressSnapshot: candidate.address,
          lat: candidate.lat?.toString(),
          lng: candidate.lng?.toString(),
          arrivalOffsetMinutes,
          driveMinutes: legDriveMinutes,
          visitMinutes: 20,
          ratingTenths: candidate.rating == null ? null : Math.round(candidate.rating * 10),
          reviewCount: candidate.reviewCount ?? null,
          openNow: candidate.openNow ?? null,
          mapsUrl: candidate.mapsUrl,
          selectionReason: candidate.reviewCount
            ? `${candidate.reviewCount} Google reviews in the selected area`
            : `Matches ${route.industry} in ${route.city}`,
          status: "planned",
        };
      }));
      const finishedAt = new Date();
      await tx.update(salesDailyRoutes).set({
        status: "ready",
        generationStage: "ready",
        generatedAt: finishedAt,
        errorMessage: null,
        routePolyline: routePolyline ?? null,
        updatedAt: finishedAt,
      }).where(eq(salesDailyRoutes.id, route.id));
      await tx.update(salesRouteGenerationAttempts).set({
        status: "ready",
        creditUnits: (checkpoint.placesCreditUnits ?? googleSearch.creditUnits) + (checkpoint.routesCreditUnits ?? 0),
        completedAt: finishedAt,
      }).where(and(
        eq(salesRouteGenerationAttempts.routeId, route.id),
        eq(salesRouteGenerationAttempts.version, route.version),
      ));
      await tx.insert(salesUserNotifications).values({
        repId: route.repId,
        type: "daily_route_ready",
        title: "Your route is ready",
        message: `${ordered.length} stops in ${route.city}`,
        href: "/leads/prospecting",
      });
    });
    void sendPushNotification(route.repId, {
      title: "Your route is ready",
      body: `${ordered.length} stops in ${route.city}`,
      href: "/leads/prospecting",
    }).catch((pushError) => console.error("[daily route] ready push failed:", pushError));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Route generation failed";
    const [route] = await db.update(salesDailyRoutes).set({
      status: "failed",
      generationStage: "failed",
      errorMessage: message,
      updatedAt: new Date(),
    }).where(eq(salesDailyRoutes.id, routeId)).returning();
    await db.update(salesRouteGenerationAttempts).set({
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
    }).where(and(
      eq(salesRouteGenerationAttempts.routeId, routeId),
      route ? eq(salesRouteGenerationAttempts.version, route.version) : sql`true`,
    ));
    const [attempt] = route ? await db.select().from(salesRouteGenerationAttempts).where(and(
      eq(salesRouteGenerationAttempts.routeId, route.id),
      eq(salesRouteGenerationAttempts.version, route.version),
    )).orderBy(desc(salesRouteGenerationAttempts.id)).limit(1) : [];
    if (route) {
      const failureMessage = attempt?.creditUnits
        ? "Provider work was saved. Open Prospecting to resume without repeating the completed request."
        : "No provider request was consumed. Open Prospecting to try again.";
      await db.insert(salesUserNotifications).values({
        repId: route.repId,
        type: "daily_route_failed",
        title: "Route generation needs attention",
        message: failureMessage,
        href: "/leads/prospecting",
      });
      void sendPushNotification(route.repId, {
        title: "Route generation needs attention",
        body: failureMessage,
        href: "/leads/prospecting",
      }).catch((pushError) => console.error("[daily route] failure push failed:", pushError));
    }
  } finally {
    runningJobs.delete(routeId);
  }
}

export function resumeDailyRouteGeneration(route: SalesDailyRoute) {
  if (["queued", "generating"].includes(route.status)) setImmediate(() => void generateDailyRoute(route.id));
}

export async function resumePendingDailyRoutes() {
  const pending = await db.select().from(salesDailyRoutes).where(inArray(salesDailyRoutes.status, ["queued", "generating"]));
  pending.forEach(resumeDailyRouteGeneration);
  return pending.length;
}

export async function getRouteStopForCheckIn(repId: number, stopId: number, leadId: number) {
  const [result] = await db.select({ stop: salesDailyRouteStops, route: salesDailyRoutes })
    .from(salesDailyRouteStops)
    .innerJoin(salesDailyRoutes, eq(salesDailyRoutes.id, salesDailyRouteStops.routeId))
    .where(and(
      eq(salesDailyRouteStops.id, stopId),
      eq(salesDailyRouteStops.leadId, leadId),
      eq(salesDailyRoutes.repId, repId),
      eq(salesDailyRouteStops.version, salesDailyRoutes.version),
    ));
  return result;
}

export async function markRouteStopInProgress(stopId: number, visitId: number) {
  const [stop] = await db.update(salesDailyRouteStops).set({ status: "in_progress", visitId, updatedAt: new Date() })
    .where(eq(salesDailyRouteStops.id, stopId)).returning();
  if (stop) await db.update(salesDailyRoutes).set({ status: "active", startedAt: sql`coalesce(${salesDailyRoutes.startedAt}, now())`, updatedAt: new Date() })
    .where(eq(salesDailyRoutes.id, stop.routeId));
  return stop;
}

async function refreshRouteCompletion(routeId: number) {
  const [route] = await db.select().from(salesDailyRoutes).where(eq(salesDailyRoutes.id, routeId));
  if (!route) return;
  const unresolved = await db.select({ count: sql<number>`count(*)::int` }).from(salesDailyRouteStops).where(and(
    eq(salesDailyRouteStops.routeId, route.id),
    eq(salesDailyRouteStops.version, route.version),
    sql`${salesDailyRouteStops.status} IN ('planned', 'in_progress', 'summary_pending')`,
  ));
  if ((unresolved[0]?.count ?? 0) === 0) await db.update(salesDailyRoutes).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(salesDailyRoutes.id, route.id));
}

export async function markVisitRouteStop(visitId: number, status: "summary_pending" | "visited" | "planned") {
  const [stop] = await db.update(salesDailyRouteStops).set({
    status,
    ...(status === "planned" ? { visitId: null } : {}),
    updatedAt: new Date(),
  }).where(eq(salesDailyRouteStops.visitId, visitId)).returning();
  if (!stop || status !== "visited") return stop;
  await refreshRouteCompletion(stop.routeId);
  return stop;
}

export async function listNotifications(repId: number) {
  return db.select().from(salesUserNotifications).where(eq(salesUserNotifications.repId, repId))
    .orderBy(desc(salesUserNotifications.createdAt)).limit(30);
}

export async function markNotificationRead(repId: number, notificationId: number) {
  const [updated] = await db.update(salesUserNotifications).set({ readAt: new Date() }).where(and(
    eq(salesUserNotifications.id, notificationId),
    eq(salesUserNotifications.repId, repId),
  )).returning();
  return updated;
}

export async function updateRouteStop(repId: number, stopId: number, input: { status?: string; skipReason?: string | null; sequence?: number }) {
  const found = await getRouteStopForCheckIn(repId, stopId, (await db.select({ leadId: salesDailyRouteStops.leadId }).from(salesDailyRouteStops).where(eq(salesDailyRouteStops.id, stopId)).limit(1))[0]?.leadId ?? 0);
  if (!found) return undefined;
  const updated = await db.transaction(async (tx) => {
    const now = new Date();
    if (input.sequence !== undefined && input.sequence !== found.stop.sequence) {
      const [occupied] = await tx.select().from(salesDailyRouteStops).where(and(
        eq(salesDailyRouteStops.routeId, found.stop.routeId),
        eq(salesDailyRouteStops.version, found.stop.version),
        eq(salesDailyRouteStops.sequence, input.sequence),
      )).limit(1);
      if (occupied) {
        await tx.update(salesDailyRouteStops).set({ sequence: -found.stop.id, updatedAt: now })
          .where(eq(salesDailyRouteStops.id, found.stop.id));
        await tx.update(salesDailyRouteStops).set({ sequence: found.stop.sequence, updatedAt: now })
          .where(eq(salesDailyRouteStops.id, occupied.id));
      }
    }
    const [row] = await tx.update(salesDailyRouteStops).set({ ...input, updatedAt: now })
      .where(eq(salesDailyRouteStops.id, stopId)).returning();
    return row;
  });
  if (updated && ["skipped", "unavailable"].includes(updated.status)) await refreshRouteCompletion(updated.routeId);
  return updated;
}

export async function regenerateDailyRoute(route: SalesDailyRoute, userId: string, reason: string, idempotencyKey: string) {
  const existingAttempt = (await db.select().from(salesRouteGenerationAttempts).where(and(
    eq(salesRouteGenerationAttempts.routeId, route.id),
    eq(salesRouteGenerationAttempts.idempotencyKey, idempotencyKey),
  )).limit(1))[0];
  if (existingAttempt) return (await db.select().from(salesDailyRoutes).where(eq(salesDailyRoutes.id, route.id)))[0];
  const nextVersion = route.version + 1;
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx.update(salesDailyRoutes).set({
      version: nextVersion,
      status: "queued",
      generationStage: "queued",
      estimatedReadyAt: new Date(Date.now() + 60_000),
      generatedAt: null,
      completedAt: null,
      errorMessage: null,
      idempotencyKey,
      updatedAt: new Date(),
    }).where(eq(salesDailyRoutes.id, route.id)).returning();
    await tx.insert(salesRouteGenerationAttempts).values({
      routeId: route.id,
      version: nextVersion,
      idempotencyKey,
      initiatedByUserId: userId,
      reason,
      status: "queued",
    });
    return rows;
  });
  setImmediate(() => void generateDailyRoute(updated.id));
  return updated;
}

export type DailyRouteBundle = Awaited<ReturnType<typeof getDailyRouteBundle>>;
export type DailyRouteStop = SalesDailyRouteStop;
