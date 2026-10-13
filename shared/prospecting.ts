import { z } from "zod";

const coordinate = z.number().finite();
const niche = z.string().trim().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/).min(2).max(40);

/** Internal planning assumptions, intentionally not exposed as form fields. */
export const TODAY_PROSPECTING_POLICY = {
  maxResultsPerSearch: 30,
  targetStops: 24,
  shiftDurationMinutes: 8 * 60,
  defaultVisitMinutes: 20,
  autoExpand: true,
  maxExpansionKm: 30,
  targetUtilization: 0.85,
} as const;

export const PROSPECTING_SHIFT_MINUTES = [120, 240, 360, 480, 600, 720] as const;

export function targetStopsForShift(shiftDurationMinutes: number) {
  return Math.ceil(shiftDurationMinutes / TODAY_PROSPECTING_POLICY.defaultVisitMinutes);
}

export function approximateCandidateCenter(candidates: Array<{ status: string; lat: string | number | null; lng: string | number | null }>) {
  const points = candidates.flatMap((candidate) => {
    if (candidate.status === "discarded" || candidate.lat == null || candidate.lng == null) return [];
    if (String(candidate.lat).trim() === "" || String(candidate.lng).trim() === "") return [];
    const lat = Number(candidate.lat);
    const lng = Number(candidate.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
  });
  if (!points.length) return null;
  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
  };
}

export const prospectingJobCreateSchema = z.object({
  location: z.string().trim().min(2).max(500),
  searches: z.array(z.object({
    niche,
    query: z.string().trim().min(2).max(500),
  })).min(1).max(5)
    // "Hair salon, hair-salon" collapse to one niche; one engine run per niche
    // and area is a database invariant, so a repeat would otherwise be a 500.
    .transform((searches) => searches.filter((search, index) =>
      searches.findIndex((other) => other.niche === search.niche) === index)),
  filters: z.record(z.string(), z.unknown()).default({}),
  hypothesis: z.object({
    premise: z.string().trim().min(1).max(2000).optional(),
    expected: z.record(z.string(), z.union([z.string().max(500), z.number()])).optional(),
    basis: z.string().trim().min(1).max(2000).optional(),
  }).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  shiftDurationMinutes: z.number().int().refine(
    (value) => (PROSPECTING_SHIFT_MINUTES as readonly number[]).includes(value),
    "Choose a 2, 4, 6, 8, 10, or 12 hour shift.",
  ).default(TODAY_PROSPECTING_POLICY.shiftDurationMinutes),
});

export const prospectingRouteCreateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  routeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedStartAt: z.string().datetime(),
  start: z.object({
    address: z.string().trim().max(500).optional(),
    lat: coordinate.min(-90).max(90),
    lng: coordinate.min(-180).max(180),
  }),
  leadIds: z.array(z.number().int().positive()).max(100).default([]),
  candidateIds: z.array(z.number().int().positive()).max(200).default([]),
  jobId: z.number().int().positive().optional(),
  maxStops: z.number().int().min(1).max(60).default(60),
  shiftDurationMinutes: z.number().int().min(30).max(16 * 60).default(8 * 60),
  defaultVisitMinutes: z.number().int().min(5).max(180).default(20),
  /** Replace today's route with a new optimization. Only the platform owner may; reps get one per day. */
  rebuild: z.boolean().default(false),
}).refine((value) => value.leadIds.length > 0 || value.candidateIds.length > 0 || value.jobId !== undefined, {
  message: "Select leads, candidates, or a completed prospecting job.",
});

export const prospectingRouteStatusUpdateSchema = z.object({
  status: z.enum(["published", "in_progress", "completed", "cancelled"]),
});

export const prospectingStopUpdateSchema = z.object({
  status: z.enum(["planned", "en_route", "checked_in", "completed", "skipped", "rescheduled"]),
  skipReason: z.string().trim().max(500).nullable().optional(),
  visitId: z.number().int().positive().nullable().optional(),
});

export type ProspectingJobCreateInput = z.infer<typeof prospectingJobCreateSchema>;
export type ProspectingRouteCreateInput = z.infer<typeof prospectingRouteCreateSchema>;
