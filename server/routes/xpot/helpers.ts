import { storage } from "../../storage.js";
import { getGeminiClient } from "../../lib/ai.js";
import { getOrCreateGHLContact, createGHLOpportunity, updateGHLOpportunity, createGHLTask, createGHLNote } from "../../integrations/ghl.js";
import { z } from "zod";

const visitAudioAnalysisSchema = z.object({
  summary: z.string().trim().max(1500).nullable().optional(),
  outcome: z.string().trim().max(300).nullable().optional(),
  nextStep: z.string().trim().max(300).nullable().optional(),
  sentiment: z.string().trim().max(100).nullable().optional(),
  objections: z.string().trim().max(600).nullable().optional(),
  competitorMentioned: z.string().trim().max(200).nullable().optional(),
  followUpRequired: z.boolean().optional(),
});

export type VisitAudioAnalysis = z.infer<typeof visitAudioAnalysisSchema>;

function buildVisitAudioAnalysisPrompt(transcript: string) {
  return `You analyze short field-sales voice notes recorded after an in-person visit.

Return ONLY a valid JSON object with these keys:
- summary: short visit summary in the same language as the transcript
- outcome: brief result of the visit
- nextStep: concrete next step if one is mentioned or clearly implied
- sentiment: one of positive, neutral, negative, or mixed
- objections: short description of objections or blockers, or null
- competitorMentioned: competitor name if explicitly mentioned, otherwise null
- followUpRequired: true if the rep should follow up, otherwise false

Rules:
- Do not invent facts.
- If a field is not supported by the transcript, use null.
- Keep summary under 3 sentences.
- Keep outcome and nextStep concise.
- Return raw JSON only, with no markdown.

Transcript:
"""${transcript}"""`;
}

function parseVisitAudioAnalysis(content: string | null | undefined): VisitAudioAnalysis | null {
  if (!content) return null;

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return visitAudioAnalysisSchema.parse(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error("Failed to parse visit audio analysis:", error);
    return null;
  }
}

export async function analyzeVisitTranscript(transcript: string): Promise<VisitAudioAnalysis | null> {
  const cleanedTranscript = transcript.trim();
  if (!cleanedTranscript) return null;

  const ai = await getGeminiClient();
  if (!ai) return null;

  const prompt = buildVisitAudioAnalysisPrompt(cleanedTranscript);

  try {
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });
    return parseVisitAudioAnalysis(completion.choices[0]?.message?.content);
  } catch (error) {
    console.error("Visit transcript analysis failed:", error);
    return null;
  }
}

export function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c);
}

export async function syncLeadToGhl(leadId: number) {
  const integration = await storage.getIntegrationSettings("gohighlevel");
  if (!integration?.isEnabled || !integration.apiKey || !integration.locationId) {
    return { synced: false, message: "GHL not configured" };
  }

  const lead = await storage.getSalesLead(leadId);
  if (!lead) {
    return { synced: false, message: "Lead not found" };
  }

  if (!lead.email && !lead.phone) {
    await storage.createSalesSyncEvent({
      entityType: "sales_lead",
      entityId: String(lead.id),
      status: "needs_review",
      payload: { reason: "Missing email and phone for GHL sync" },
      lastError: "Missing email and phone for GHL sync",
    });
    return { synced: false, message: "Missing lead email and phone" };
  }

  const [firstName, ...rest] = lead.name.split(" ");
  const syncResult = await getOrCreateGHLContact(integration.apiKey, integration.locationId, {
    email: lead.email || "",
    firstName: firstName || lead.name,
    lastName: rest.join(" ") || lead.legalName || "Lead",
    phone: lead.phone || "",
    address: (await storage.listSalesLeadLocations(lead.id))[0]?.addressLine1,
  });

  if (!syncResult.success || !syncResult.contactId) {
    await storage.createSalesSyncEvent({
      entityType: "sales_lead",
      entityId: String(lead.id),
      status: "failed",
      payload: { leadId: lead.id },
      lastError: syncResult.message || "Failed to sync lead to GHL",
      lastAttemptAt: new Date(),
    });
    return { synced: false, message: syncResult.message || "Failed to sync lead" };
  }

  await storage.updateSalesLead(lead.id, { ghlContactId: syncResult.contactId });
  await storage.createSalesSyncEvent({
    entityType: "sales_lead",
    entityId: String(lead.id),
    status: "synced",
    payload: { ghlContactId: syncResult.contactId },
    lastAttemptAt: new Date(),
  });
  return { synced: true, ghlContactId: syncResult.contactId };
}

export async function syncOpportunityToGhl(opportunityId: number) {
  const integration = await storage.getIntegrationSettings("gohighlevel");
  const appSettings = await storage.getSalesAppSettings();

  if (!integration?.isEnabled || !integration.apiKey || !integration.locationId) {
    return { synced: false, message: "GHL not configured" };
  }

  const opportunity = (await storage.listSalesOpportunities()).find((item) => item.id === opportunityId);
  if (!opportunity) {
    return { synced: false, message: "Opportunity not found" };
  }

  const lead = await storage.getSalesLead(opportunity.leadId);
  if (!lead?.ghlContactId) {
    return { synced: false, message: "Lead is not synced to GHL yet" };
  }

  const pipelineId = opportunity.pipelineKey || appSettings.defaultPipelineKey || undefined;
  const stageId = opportunity.stageKey || appSettings.defaultStageKey || undefined;
  if (!pipelineId || !stageId) {
    return { synced: false, message: "Missing pipeline or stage mapping" };
  }

  if (opportunity.ghlOpportunityId) {
    const updateResult = await updateGHLOpportunity(integration.apiKey, opportunity.ghlOpportunityId, {
      name: opportunity.title,
      monetaryValue: opportunity.value,
      pipelineId,
      pipelineStageId: stageId,
      status: opportunity.status,
    });

    if (!updateResult.success) {
      return { synced: false, message: updateResult.message || "Failed to update opportunity" };
    }

    await storage.updateSalesOpportunity(opportunity.id, { syncStatus: "synced" });
    return { synced: true, ghlOpportunityId: opportunity.ghlOpportunityId };
  }

  const createResult = await createGHLOpportunity(integration.apiKey, integration.locationId, {
    contactId: lead.ghlContactId,
    name: opportunity.title,
    monetaryValue: opportunity.value,
    pipelineId,
    pipelineStageId: stageId,
  });

  if (!createResult.success || !createResult.opportunityId) {
    return { synced: false, message: createResult.message || "Failed to create opportunity" };
  }

  await storage.updateSalesOpportunity(opportunity.id, {
    ghlOpportunityId: createResult.opportunityId,
    syncStatus: "synced",
  });

  return { synced: true, ghlOpportunityId: createResult.opportunityId };
}

export async function syncTaskToGhl(taskId: number) {
  const integration = await storage.getIntegrationSettings("gohighlevel");
  
  if (!integration?.isEnabled || !integration.apiKey || !integration.locationId) {
    return { synced: false, message: "GHL not configured" };
  }

  const task = (await storage.listSalesTasks()).find((t) => t.id === taskId);
  if (!task) {
    return { synced: false, message: "Task not found" };
  }

  if (task.ghlTaskId) {
    return { synced: true, ghlTaskId: task.ghlTaskId };
  }

  let contactId: string | undefined;
  if (task.leadId) {
    const lead = await storage.getSalesLead(task.leadId);
    contactId = lead?.ghlContactId || undefined;
  }

  const createResult = await createGHLTask(integration.apiKey, integration.locationId, {
    name: task.title,
    description: task.description || undefined,
    dueDate: task.dueAt ? new Date(task.dueAt).toISOString() : undefined,
    contactId,
  });

  if (!createResult.success || !createResult.taskId) {
    return { synced: false, message: createResult.message || "Failed to create task in GHL" };
  }

  await storage.updateSalesTask(task.id, { ghlTaskId: createResult.taskId, status: "pending" });

  return { synced: true, ghlTaskId: createResult.taskId };
}

export async function syncVisitToGhl(visitId: number): Promise<{ synced: boolean; message?: string }> {
  const integration = await storage.getIntegrationSettings("gohighlevel");
  if (!integration?.isEnabled || !integration.apiKey || !integration.locationId) {
    console.warn("[syncVisitToGhl] GHL not configured — skipping");
    return { synced: false, message: "GHL not configured" };
  }

  const visit = await storage.getSalesVisit(visitId);
  if (!visit) return { synced: false, message: "Visit not found" };

  const lead = await storage.getSalesLead(visit.leadId);
  if (!lead) return { synced: false, message: "Lead not found" };

  // Prospects are never auto-synced
  if (lead.status === "prospect") {
    return { synced: false, message: "Prospect — not synced" };
  }

  // Ensure lead is synced to GHL first
  let ghlContactId = lead.ghlContactId;
  if (!ghlContactId) {
    const leadSync = await syncLeadToGhl(lead.id);
    if (!leadSync.synced) {
      await storage.createSalesSyncEvent({
        entityType: "sales_visit",
        entityId: String(visitId),
        status: "failed",
        lastError: `Lead sync failed: ${leadSync.message}`,
        lastAttemptAt: new Date(),
      });
      return { synced: false, message: `Lead sync failed: ${leadSync.message}` };
    }
    ghlContactId = (leadSync as any).ghlContactId as string;
  }

  // Build note body from visit + note
  const note = await storage.getSalesVisitNote(visitId);
  const checkedInAt = visit.checkedInAt ? new Date(visit.checkedInAt) : null;
  const durationMin = visit.durationSeconds ? Math.floor(visit.durationSeconds / 60) : null;
  const durationSec = visit.durationSeconds ? visit.durationSeconds % 60 : null;

  const lines: string[] = [
    `📍 Visit — ${checkedInAt ? checkedInAt.toLocaleString() : "unknown time"}`,
    `Status: ${visit.status}`,
    durationMin !== null ? `Duration: ${durationMin}m ${durationSec}s` : null,
    note?.summary ? `\nSummary: ${note.summary}` : null,
    note?.outcome ? `Outcome: ${note.outcome}` : null,
    note?.nextStep ? `Next Step: ${note.nextStep}` : null,
    note?.sentiment ? `Sentiment: ${note.sentiment}` : null,
    note?.objections ? `Objections: ${note.objections}` : null,
  ].filter((l): l is string => l !== null);

  const noteResult = await createGHLNote(integration.apiKey, ghlContactId, lines.join("\n"));

  if (!noteResult.success) {
    await storage.createSalesSyncEvent({
      entityType: "sales_visit",
      entityId: String(visitId),
      status: "failed",
      lastError: noteResult.message || "Failed to create GHL note",
      lastAttemptAt: new Date(),
    });
    return { synced: false, message: noteResult.message };
  }

  await storage.createSalesSyncEvent({
    entityType: "sales_visit",
    entityId: String(visitId),
    status: "synced",
    payload: { ghlContactId, noteId: noteResult.noteId },
    lastAttemptAt: new Date(),
  });

  return { synced: true };
}

// Sync a completed visit back to Xphere's prospect timeline. Mirrors the GHL
// sync but targets the originating Xphere prospect via the lead's xphereRef.
// Unlike GHL, prospect-stage leads ARE synced (that is the whole point here).
export async function syncVisitToXphere(visitId: number): Promise<{ synced: boolean; message?: string }> {
  const visit = await storage.getSalesVisit(visitId);
  if (!visit) return { synced: false, message: "Visit not found" };

  const lead = await storage.getSalesLead(visit.leadId);
  if (!lead) return { synced: false, message: "Lead not found" };

  const ref = (lead as { xphereRef?: string | null }).xphereRef;
  if (!ref || !ref.includes(":")) return { synced: false, message: "Lead has no Xphere ref" };
  const [kind, id] = ref.split(":");

  // Per-tenant config: resolve the lead owner's Xphere integration (rep -> user).
  if (!lead.ownerRepId) return { synced: false, message: "Lead has no owner" };
  const ownerRep = await storage.getSalesRep(lead.ownerRepId);
  if (!ownerRep) return { synced: false, message: "Owner rep not found" };
  const integration = await storage.getXphereIntegrationByUserId(ownerRep.userId);
  if (!integration || !integration.isEnabled || !integration.apiKey) {
    return { synced: false, message: "Xphere not configured" };
  }
  const apiUrl = (integration.apiUrl || "https://xphere.app").replace(/\/$/, "");
  const apiKey = integration.apiKey;

  const note = await storage.getSalesVisitNote(visitId);
  const occurredAt = (visit.checkedOutAt ? new Date(visit.checkedOutAt) : new Date()).toISOString();

  try {
    const res = await fetch(`${apiUrl}/api/integrations/xpot/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        xphere_id: id,
        xphere_kind: kind,
        outcome: note?.outcome ?? null,
        summary: note?.summary ?? null,
        sentiment: note?.sentiment ?? null,
        occurred_at: occurredAt,
      }),
    });

    if (!res.ok) {
      await storage.createSalesSyncEvent({
        entityType: "sales_visit",
        entityId: String(visitId),
        status: "failed",
        lastError: `Xphere returned HTTP ${res.status}`,
        lastAttemptAt: new Date(),
      });
      return { synced: false, message: `Xphere HTTP ${res.status}` };
    }

    await storage.createSalesSyncEvent({
      entityType: "sales_visit",
      entityId: String(visitId),
      status: "synced",
      payload: { xphereRef: ref },
      lastAttemptAt: new Date(),
    });
    return { synced: true };
  } catch (err) {
    console.error("[syncVisitToXphere] failed:", err);
    return { synced: false, message: "Request failed" };
  }
}
