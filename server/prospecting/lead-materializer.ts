import { and, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  prospectingCandidates,
  salesLeadLocations,
  salesLeads,
} from "#shared/schema.js";
import { defaultGeofenceRadiusSql } from "../lead-location.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Turns one selected prospecting candidate into a reusable CRM lead.
 * A per-organization advisory lock makes concurrent Google Place retries idempotent.
 */
export async function ensureProspectingCandidateLead(
  tx: Tx,
  input: { candidateId: number; repId: number; organizationId: number; territoryName: string },
) {
  const [candidate] = await tx.select().from(prospectingCandidates).where(and(
    eq(prospectingCandidates.id, input.candidateId),
    eq(prospectingCandidates.repId, input.repId),
  )).limit(1);
  if (!candidate) throw new Error("Prospecting candidate not found");

  if (candidate.googlePlaceId) {
    await tx.execute(sql`select pg_advisory_xact_lock(${input.organizationId}, hashtext(${candidate.googlePlaceId}))`);
  }

  let leadId = candidate.leadId;
  if (!leadId && candidate.googlePlaceId) {
    const [existing] = await tx.select({ id: salesLeads.id }).from(salesLeads).where(and(
      eq(salesLeads.organizationId, input.organizationId),
      eq(salesLeads.googlePlaceId, candidate.googlePlaceId),
    )).limit(1);
    leadId = existing?.id ?? null;
  }

  if (!leadId) {
    const [lead] = await tx.insert(salesLeads).values({
      organizationId: input.organizationId,
      name: candidate.name,
      website: candidate.website,
      phone: candidate.phone,
      email: candidate.email,
      industry: candidate.industry,
      source: "prospecting",
      status: "lead",
      ownerRepId: input.repId,
      territoryName: input.territoryName,
      googlePlaceId: candidate.googlePlaceId,
    }).returning({ id: salesLeads.id });
    leadId = lead.id;
    await tx.insert(salesLeadLocations).values({
      leadId,
      addressLine1: candidate.address || "Prospecting location",
      city: candidate.city,
      state: candidate.state,
      postalCode: candidate.postalCode,
      country: candidate.country || "US",
      lat: candidate.lat,
      lng: candidate.lng,
      isPrimary: true,
      geofenceRadiusMeters: defaultGeofenceRadiusSql(),
    });
  }

  await tx.update(salesLeads).set({
    status: "lead",
    ownerRepId: input.repId,
    updatedAt: new Date(),
  }).where(and(eq(salesLeads.id, leadId), eq(salesLeads.status, "prospect")));

  await tx.update(prospectingCandidates).set({ leadId, updatedAt: new Date() })
    .where(eq(prospectingCandidates.id, candidate.id));
  return leadId;
}
