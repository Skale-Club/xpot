import { describe, expect, it } from "vitest";
import { approximateCandidateCenter, prospectingJobCreateSchema, prospectingRouteCreateSchema, targetStopsForShift, TODAY_PROSPECTING_POLICY } from "../shared/prospecting.js";
import { haversineMeters, optimizeRouteHeuristic } from "../server/prospecting/route-optimizer.js";
import { buildGoogleOptimizeToursRequest, parseGoogleOptimizeToursResponse } from "../server/prospecting/google-route-optimizer.js";
import { buildEngineInput, depthForMaxResults, mapEngineStatus, parseEngineResults } from "../server/prospecting/google-maps-engine.js";
import { evaluateColdEligibility } from "../server/prospecting/eligibility.js";
import { chooseExpansionArea } from "../server/prospecting/expansion.js";
import { earliestStartedAt } from "../server/prospecting/job-status.js";

describe("prospecting contracts", () => {
  it("uses eligible result coordinates as a no-GPS route origin", () => {
    const center = approximateCandidateCenter([
      { status: "discovered", lat: "42.30", lng: "-71.50" },
      { status: "discovered", lat: "42.40", lng: "-71.60" },
      { status: "discarded", lat: "1", lng: "1" },
      { status: "discovered", lat: null, lng: null },
    ]);
    expect(center?.lat).toBeCloseTo(42.35);
    expect(center?.lng).toBeCloseTo(-71.55);
  });

  it("accepts several classified searches under one territory", () => {
    const value = prospectingJobCreateSchema.parse({
      location: "Marlborough, Massachusetts",
      searches: [
        { niche: "barbershop", query: "barber shop" },
        { niche: "hair_salon", query: "hair salon" },
      ],
    });
    expect(TODAY_PROSPECTING_POLICY.shiftDurationMinutes).toBe(480);
    expect(TODAY_PROSPECTING_POLICY.defaultVisitMinutes).toBe(20);
    expect(TODAY_PROSPECTING_POLICY.targetUtilization).toBe(0.85);
    expect(value.shiftDurationMinutes).toBe(480);
    expect(targetStopsForShift(720)).toBe(36);
    expect(value.searches).toHaveLength(2);
  });

  it("rejects display labels as niche identifiers", () => {
    expect(() => prospectingJobCreateSchema.parse({
      location: "Marlborough, MA",
      searches: [{ niche: "Hair Salon", query: "hair salon" }],
    })).toThrow();
  });

  it("validates a bounded daily route", () => {
    const value = prospectingRouteCreateSchema.parse({
      routeDate: "2026-10-13",
      plannedStartAt: "2026-10-13T13:00:00.000Z",
      start: { lat: 42.3459, lng: -71.5523 },
      leadIds: [1, 2],
    });
    expect(value.maxStops).toBe(60);
    expect(value.shiftDurationMinutes).toBe(480);
  });

  it("accepts a completed discovery job as the route source", () => {
    const value = prospectingRouteCreateSchema.parse({
      routeDate: "2026-10-13",
      plannedStartAt: "2026-10-13T13:00:00.000Z",
      start: { lat: 42.3459, lng: -71.5523 },
      jobId: 9,
    });
    expect(value.leadIds).toEqual([]);
    expect(value.candidateIds).toEqual([]);
  });
});
describe("direct prospecting engine", () => {
  it("maps every gosom job state without inventing a second state machine", () => {
    expect(mapEngineStatus("pending")).toEqual({ status: "running", progress: 10 });
    expect(mapEngineStatus("working")).toEqual({ status: "running", progress: 50 });
    expect(mapEngineStatus("ok")).toEqual({ status: "completed", progress: 100 });
    expect(mapEngineStatus("failed")).toEqual({ status: "failed", progress: 0 });
    expect(mapEngineStatus("new-engine-state")).toEqual({ status: "running", progress: 50 });
  });

  it("builds the gosom job without any XScraper or Apify field", () => {
    expect(depthForMaxResults(30, 10)).toBe(4);
    expect(buildEngineInput("barber shop", "Marlborough, MA", 30)).toMatchObject({
      keywords: ["barber shop in Marlborough, MA"],
      depth: 4,
      email: true,
      fast_mode: false,
    });
  });

  it("normalizes CSV results for Xpot candidates", () => {
    const csv = [
      "title,address,complete_address,phone,website,emails,review_rating,review_count,latitude,longitude,place_id,category",
      'Studio One,1 Main St,"{""city"":""Marlborough"",""state"":""MA"",""postal_code"":""01752""}",+15085550100,https://studio.example,"hello@studio.example",4.8,72,42.35,-71.55,ChIJ-one,Hair salon',
    ].join("\n");
    expect(parseEngineResults(csv, 10)[0]).toMatchObject({
      sourceId: "ChIJ-one",
      name: "Studio One",
      city: "Marlborough",
      email: "hello@studio.example",
      rating: 4.8,
      reviewCount: 72,
      lat: 42.35,
    });
  });

  it("composes an address when the engine only returns structured address parts", () => {
    const csv = [
      "title,address,complete_address,latitude,longitude",
      'Studio Two,,"{""street"":""2 Main St"",""city"":""Natick"",""state"":""MA"",""postal_code"":""01760"",""country"":""US""}",42.28,-71.35',
    ].join("\n");
    expect(parseEngineResults(csv, 10)[0]).toMatchObject({
      address: "2 Main St, Natick, MA 01760, US",
      city: "Natick",
      postalCode: "01760",
    });
  });
});

describe("cold prospecting eligibility", () => {
  const place = parseEngineResults([
    "title,phone,website,place_id,latitude,longitude",
    "Studio One,+15085550100,https://studio.example,ChIJ-one,42.35,-71.55",
  ].join("\n"), 1)[0];

  it("excludes an existing customer by Google Place ID", () => {
    expect(evaluateColdEligibility(place, [{
      id: 7,
      name: "Studio One",
      googlePlaceId: "ChIJ-one",
      phone: null,
      website: null,
      status: "customer",
      lastVisitAt: null,
    }])).toEqual({ eligible: false, leadId: 7, exclusionReason: "existing_customer" });
  });

  it("excludes a previously visited prospect by normalized phone", () => {
    expect(evaluateColdEligibility(place, [{
      id: 8,
      name: "Old lead",
      googlePlaceId: null,
      phone: "(508) 555-0100",
      website: null,
      status: "prospect",
      lastVisitAt: new Date("2026-09-01T12:00:00Z"),
    }])).toEqual({ eligible: false, leadId: 8, exclusionReason: "previously_visited" });
  });

  it("keeps an unvisited existing prospect eligible and linked", () => {
    expect(evaluateColdEligibility(place, [{
      id: 9,
      name: "Studio One",
      googlePlaceId: null,
      phone: null,
      website: "studio.example/",
      status: "prospect",
      lastVisitAt: null,
    }])).toEqual({ eligible: true, leadId: 9, exclusionReason: null });
  });
});

describe("automatic area expansion", () => {
  it("keeps job timestamps as decoded Dates when reconciling run status", () => {
    expect(earliestStartedAt([
      new Date("2026-10-12T14:00:00Z"),
      null,
      new Date("2026-10-12T13:00:00Z"),
    ])).toEqual(new Date("2026-10-12T13:00:00Z"));
    expect(earliestStartedAt([null])).toBeNull();
  });

  it("prefers the strongest nearby city already visible on the result frontier", () => {
    expect(chooseExpansionArea({
      anchor: "Framingham, MA",
      searchedAreas: ["Framingham, MA"],
      candidateCities: ["Natick, MA", "Marlborough, MA", "Natick, MA"],
      nextWave: 1,
    })).toEqual({ location: "Natick, MA", reason: "candidate_frontier" });
  });

  it("broadens the anchor when no neighboring locality appeared", () => {
    expect(chooseExpansionArea({
      anchor: "Framingham, MA",
      searchedAreas: ["Framingham, MA"],
      candidateCities: ["Framingham, MA"],
      nextWave: 1,
    })).toEqual({ location: "Framingham, MA and nearby areas", reason: "broaden_anchor" });
  });

  it("stops after the automatic wave safety limit", () => {
    expect(chooseExpansionArea({
      anchor: "Framingham, MA",
      searchedAreas: ["Framingham, MA"],
      candidateCities: ["Natick, MA"],
      nextWave: 3,
    })).toBeNull();
  });
});

describe("route heuristic", () => {
  const start = { lat: 42.3459, lng: -71.5523 };
  const candidate = (id: number, lat: number, lng: number, score = 70) => ({
    id,
    leadId: id,
    name: `Business ${id}`,
    address: `${id} Main St`,
    lat,
    lng,
    score,
    scoreReasons: ["test"],
    serviceDurationSeconds: 20 * 60,
  });

  it("computes realistic local distances", () => {
    const meters = haversineMeters(start, { lat: 42.3469, lng: -71.5523 });
    expect(meters).toBeGreaterThan(100);
    expect(meters).toBeLessThan(120);
  });

  it("is deterministic and respects max stops", () => {
    const result = optimizeRouteHeuristic({
      start,
      plannedStartAt: new Date("2026-10-13T13:00:00.000Z"),
      shiftDurationSeconds: 8 * 60 * 60,
      maxStops: 2,
      candidates: [
        candidate(1, 42.346, -71.552, 50),
        candidate(2, 42.35, -71.55, 95),
        candidate(3, 42.36, -71.56, 70),
      ],
    });
    expect(result.stops).toHaveLength(2);
    expect(result.stops.map((stop) => stop.id)).toEqual([2, 3]);
    expect(result.excludedCandidateIds).toEqual([1]);
    expect(result.totalDurationSeconds).toBeGreaterThan(40 * 60);
  });

  it("drops a visit that cannot fit before the return", () => {
    const result = optimizeRouteHeuristic({
      start,
      plannedStartAt: new Date("2026-10-13T13:00:00.000Z"),
      shiftDurationSeconds: 25 * 60,
      maxStops: 5,
      candidates: [candidate(1, 42.5, -71.7)],
    });
    expect(result.stops).toEqual([]);
    expect(result.excludedCandidateIds).toEqual([1]);
  });
});

describe("Google daily route optimization", () => {
  const input = {
    start: { lat: 42.3459, lng: -71.5523 },
    plannedStartAt: new Date("2026-10-13T13:00:00.000Z"),
    shiftDurationSeconds: 4 * 60 * 60,
    maxStops: 60,
    candidates: [
      { id: 11, leadId: null, name: "A", address: "1 Main", lat: 42.35, lng: -71.55, score: 70, scoreReasons: [], serviceDurationSeconds: 1200 },
      { id: 22, leadId: null, name: "B", address: "2 Main", lat: 42.36, lng: -71.56, score: 90, scoreReasons: [], serviceDurationSeconds: 1200 },
    ],
  };

  it("sends every candidate with the shift boundary and 20 minute service time", () => {
    const request = buildGoogleOptimizeToursRequest(input);
    expect(request.model.shipments).toHaveLength(2);
    expect(request.model.shipments[0].deliveries[0].duration).toBe("1200s");
    expect(request.model.vehicles[0].loadLimits.visit_count.maxLoad).toBe("60");
    expect(request.model.globalEndTime).toBe("2026-10-13T17:00:00.000Z");
    expect(request.considerRoadTraffic).toBe(true);
  });

  it("maps Google's road order, drive times and encoded road line", () => {
    const result = parseGoogleOptimizeToursResponse(input, {
      routes: [{
        vehicleStartTime: "2026-10-13T13:00:00Z",
        vehicleEndTime: "2026-10-13T14:02:00Z",
        visits: [
          { shipmentIndex: 1, startTime: "2026-10-13T13:07:00Z" },
          { shipmentIndex: 0, startTime: "2026-10-13T13:34:00Z" },
        ],
        transitions: [
          { travelDuration: "420s", travelDistanceMeters: 3200 },
          { travelDuration: "420s", travelDistanceMeters: 4100 },
          { travelDuration: "480s", travelDistanceMeters: 5000 },
        ],
        routePolyline: { points: "encoded-road-line" },
      }],
    });
    expect(result.stops.map((stop) => stop.id)).toEqual([22, 11]);
    expect(result.stops.map((stop) => stop.travelDurationSeconds)).toEqual([420, 420]);
    expect(result.totalDistanceMeters).toBe(12_300);
    expect(result.returnDurationSeconds).toBe(480);
    expect(result.totalDurationSeconds).toBe(62 * 60);
    expect(result.encodedPolyline).toBe("encoded-road-line");
  });
});
