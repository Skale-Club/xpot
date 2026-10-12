import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingJobs,
  prospectingRuns,
} from "#shared/schema.js";
import {
  TODAY_PROSPECTING_POLICY,
  type ProspectingJobCreateInput,
} from "#shared/prospecting.js";
import { isEngineConfigured } from "./google-maps-engine.js";
import { tickProspectingQueueSafely } from "./queue.js";

export class ProspectingServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ProspectingServiceError";
  }
}

export async function prospectingJobDetails(jobId: number, repId: number) {
  const [job] = await db.select().from(prospectingJobs).where(and(
    eq(prospectingJobs.id, jobId),
    eq(prospectingJobs.repId, repId),
  )).limit(1);
  if (!job) return null;
  const [runs, candidates] = await Promise.all([
    db.select().from(prospectingRuns).where(eq(prospectingRuns.jobId, job.id)).orderBy(asc(prospectingRuns.createdAt)),
    db.select().from(prospectingCandidates).where(eq(prospectingCandidates.jobId, job.id)).orderBy(desc(prospectingCandidates.score)),
  ]);
  return {
    job,
    runs,
    candidates,
    summary: {
      eligible: candidates.filter((candidate) => candidate.status !== "discarded").length,
      excluded: candidates.filter((candidate) => candidate.status === "discarded").length,
    },
    engine: { configured: isEngineConfigured() },
  };
}

export async function latestProspectingJobDetails(repId: number) {
  const [job] = await db.select({ id: prospectingJobs.id }).from(prospectingJobs)
    .where(eq(prospectingJobs.repId, repId))
    .orderBy(desc(prospectingJobs.createdAt), desc(prospectingJobs.id))
    .limit(1);
  return job ? prospectingJobDetails(job.id, repId) : null;
}

/** Shared mutation used by the signed-in HTTP API and the account-bound MCP tool. */
export async function createProspectingJobForRep(repId: number, input: ProspectingJobCreateInput) {
  if (input.idempotencyKey) {
    const [existing] = await db.select({ id: prospectingJobs.id }).from(prospectingJobs).where(and(
      eq(prospectingJobs.repId, repId),
      eq(prospectingJobs.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (existing) return { details: await prospectingJobDetails(existing.id, repId), reused: true };
  }
  if (!isEngineConfigured()) {
    throw new ProspectingServiceError("The prospecting engine is not configured.", 503);
  }

  const job = await db.transaction(async (tx) => {
    const [created] = await tx.insert(prospectingJobs).values({
      repId,
      location: input.location,
      searches: input.searches,
      maxResultsPerSearch: TODAY_PROSPECTING_POLICY.maxResultsPerSearch,
      targetStops: TODAY_PROSPECTING_POLICY.targetStops,
      shiftDurationMinutes: TODAY_PROSPECTING_POLICY.shiftDurationMinutes,
      defaultVisitMinutes: TODAY_PROSPECTING_POLICY.defaultVisitMinutes,
      autoExpand: TODAY_PROSPECTING_POLICY.autoExpand,
      maxExpansionKm: TODAY_PROSPECTING_POLICY.maxExpansionKm,
      filters: input.filters,
      hypothesis: input.hypothesis ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      status: "queued",
    }).returning();
    await tx.insert(prospectingRuns).values(input.searches.map((search) => ({
      jobId: created.id,
      repId,
      niche: search.niche,
      query: search.query,
      location: input.location,
      requestedMaxResults: TODAY_PROSPECTING_POLICY.maxResultsPerSearch,
    })));
    return created;
  });
  void tickProspectingQueueSafely();
  return { details: await prospectingJobDetails(job.id, repId), reused: false };
}
