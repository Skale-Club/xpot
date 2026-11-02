import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep, isPlatformAdmin, listsEveryone, listScope, visitsInOrganizations, canAccessLead, loadAccessibleLead, type XpotActor } from "./middleware.js";
import { canManageOrganizationForActor, teamMembers } from "../../organizations/service.js";
import { countsTowardTeam } from "#shared/teamActivity.js";
import { syncOpportunityToGhl } from "./helpers.js";
import { xpotOpportunityCreateSchema, xpotOpportunityUpdateSchema } from "#shared/xpot.js";
import { getGHLPipelines } from "../../integrations/ghl.js";

export function createOpportunitiesRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/opportunities/pipelines", async (_req, res) => {
    // SEG-10: this used to log whether a key/locationId was configured on every
    // call. It leaked configuration posture into production logs for no gain.
    const integration = await storage.getIntegrationSettings("gohighlevel");
    if (!integration?.isEnabled || !integration.apiKey || !integration.locationId) {
      return res.json({ pipelines: [], _reason: !integration ? "not found" : !integration.isEnabled ? "disabled" : !integration.apiKey ? "no apiKey" : "no locationId" });
    }
    const result = await getGHLPipelines(integration.apiKey, integration.locationId);
    res.json({ pipelines: result.pipelines ?? [], _error: result.success ? undefined : result.message });
  });

  router.get("/opportunities", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const status = typeof req.query.status === "string"
      ? z.enum(["open", "won", "lost", "archived"]).parse(req.query.status)
      : undefined;
    // A Rep Admin in management mode gets the team's deals, the list Team results counts: deals by the organizations'
    // members on the organizations' companies (like their visits history). Their own are "My work".
    const scope = await listScope(req, actor as XpotActor);
    const wholeTeam = scope.kind === "organizations";
    const wholePlatform = listsEveryone(req, actor!) && req.query.all === "true";
    let opportunities = await storage.listSalesOpportunities({
      // SEG-08: same "who sees everything" rule as leads/visits/tasks.
      repId: wholeTeam || wholePlatform ? undefined : actor!.rep.id,
      status,
    });
    // The platform's list is the one Team results counts: deals of the field team (living accounts that use Visits), not a
    // Tags-only reseller's or a closed account's, so the number on the tile and the list it opens agree.
    if (wholePlatform) {
      const counted = new Set((await storage.listSalesReps()).filter(countsTowardTeam).map((rep) => rep.id));
      opportunities = opportunities.filter((item) => item.repId != null && counted.has(item.repId));
    }

    // One query for every lead instead of one per opportunity.
    const leads = await storage.getSalesLeadsByIds(Array.from(new Set(opportunities.map((item) => item.leadId))));
    if (scope.kind === "organizations") {
      const members = await teamMembers(scope.organizationIds);
      opportunities = visitsInOrganizations(opportunities, leads, scope.organizationIds).filter((item) => item.repId != null && members.has(item.repId));
    }
    // A deal filed on a company the caller can no longer open (or one linked
    // before the create route checked it) keeps its row but not the company.
    const allowed = await Promise.all(leads.map((lead) => canAccessLead(actor as XpotActor, lead)));
    const leadById = new Map(leads.filter((_, i) => allowed[i]).map((lead) => [lead.id, lead]));
    res.json(opportunities.map((item) => ({ ...item, lead: leadById.get(item.leadId) })));
  });

  router.post("/opportunities", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const input = xpotOpportunityCreateSchema.parse(req.body);

    // The deal is created under the caller and its company is then listed and
    // pushed to the CRM, so both the company and the visit must be theirs to use.
    const lead = await loadAccessibleLead(req, res, input.leadId);
    if (!lead) return;
    if (input.visitId) {
      const visit = await storage.getSalesVisit(input.visitId);
      if (!visit || visit.leadId !== lead.id) {
        return res.status(400).json({ code: "visit_mismatch", message: "Visit does not belong to this lead" });
      }
      if (!isPlatformAdmin(actor!) && visit.repId !== actor!.rep.id) {
        return res.status(403).json({ code: "access_denied", message: "Access denied" });
      }
    }

    const opportunity = await storage.createSalesOpportunity({
      ...input,
      repId: actor!.rep.id,
      status: "open",
      syncStatus: "pending",
    });

    let syncMessage: string | null = null;
    const syncResult = await syncOpportunityToGhl(opportunity.id);
    if (!syncResult.synced) {
      syncMessage = syncResult.message || "Opportunity saved locally";
      await storage.updateSalesOpportunity(opportunity.id, { syncStatus: "needs_review" });
      await storage.createSalesSyncEvent({
        entityType: "sales_opportunity",
        entityId: String(opportunity.id),
        status: "needs_review",
        payload: { opportunityId: opportunity.id },
        lastError: syncMessage,
        lastAttemptAt: new Date(),
      });
    }

    res.status(201).json({
      opportunity: await storage.getSalesOpportunity(opportunity.id),
      ghl: syncResult,
      message: syncMessage,
    });
  });

  router.patch("/opportunities/:id", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const opportunityId = Number(req.params.id);
    if (!Number.isFinite(opportunityId) || opportunityId <= 0) {
      return res.status(400).json({ message: "Invalid opportunity id" });
    }
    const input = xpotOpportunityUpdateSchema.parse(req.body);

    // SEG-03: no ownership check here meant any rep could rewrite another
    // rep's deal — value, stage, status — and the handler then pushed that
    // unauthorised edit straight to GoHighLevel.
    const existing = await storage.getSalesOpportunity(opportunityId);
    if (!existing) {
      return res.status(404).json({ message: "Opportunity not found" });
    }
    // The person's own deal, or the platform's; and an Organization's owner keeps their people's deals, as they keep their
    // tasks, sales and consignments (the Deals list shows them the team's, so opening one must be able to save it).
    if (!isPlatformAdmin(actor!) && existing.repId !== actor!.rep.id) {
      const lead = await storage.getSalesLead(existing.leadId);
      if (!lead || !(await canManageOrganizationForActor(actor as XpotActor, lead.organizationId))) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const updated = await storage.updateSalesOpportunity(opportunityId, {
      ...input,
      syncStatus: "pending",
    });

    if (!updated) {
      return res.status(404).json({ message: "Opportunity not found" });
    }

    const syncResult = await syncOpportunityToGhl(opportunityId);
    if (!syncResult.synced) {
      await storage.updateSalesOpportunity(opportunityId, { syncStatus: "needs_review" });
      await storage.createSalesSyncEvent({
        entityType: "sales_opportunity",
        entityId: String(opportunityId),
        status: "needs_review",
        payload: { opportunityId },
        lastError: syncResult.message,
        lastAttemptAt: new Date(),
      });
    }

    res.json({
      opportunity: await storage.getSalesOpportunity(opportunityId),
      ghl: syncResult,
    });
  });

  return router;
}
