import { Router } from "express";
import { z } from "zod";
import { storage, type LeadVisibility } from "../../storage.js";
import { repModules } from "#shared/modules.js";
import { canAccessLead, requireXpotUser, requireVisitsModule, ensureXpotRep, isManagerOrAdmin, loadAccessibleLead, listScope, listsEveryone, ownsLead, refuseNotOwner, type XpotActor } from "./middleware.js";
import { xpotLeadCreateSchema, xpotLeadUpdateSchema, xpotLeadContactCreateSchema } from "#shared/xpot.js";
import { syncLeadToGhl, syncLeadToXphere } from "./helpers.js";
import { salesStorage } from "../../storage-sales.js";
import { activeStore, discardFiles, putPrivateFile } from "../../lib/files.js";
import { canManageOrganizationForActor, organizationIdForRep } from "../../organizations/service.js";
import { resolveGoogleApiKey } from "./google.js";
import { fetchGooglePlaceProfile, geocodeAddress } from "./google-place-profile.js";
import { planPrimaryLocationUpdate } from "../../lead-location.js";
import { rateLimit } from "../../tags/rateLimit.js";

const googleProfileLinkSchema = z.object({
  placeId: z.string().regex(/^[A-Za-z0-9_-]{10,300}$/).nullable(),
});

export function createLeadsRouter() {
  const router = Router();
  router.use(requireXpotUser);

  // GET /leads — whose companies follow management mode (listScope): with it
  // off, your own; on, a manager's everyone (optional ?repId= and
  // ?organizationId=) and a Rep Admin's organizations.
  router.get("/leads", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;

    let ownerRepId: number | undefined;
    let organizationIds: number[] | undefined;
    let visibleTo: LeadVisibility | undefined;
    // Whose follow-up tasks count: everyone's for a manager, the rep's own otherwise (as on GET /leads/:id).
    let taskRepId: number | undefined;
    const scope = await listScope(req, actor);
    if (scope.kind === "everyone") {
      // Manager can filter by a specific rep, and by one organization
      ownerRepId = req.query.repId ? Number(req.query.repId) : undefined;
      const organizationId = Number(req.query.organizationId);
      if (Number.isInteger(organizationId) && organizationId > 0) organizationIds = [organizationId];
    } else {
      // Their own leads wherever they belong, plus the companies holding their
      // Tags pieces (a rep is often Rep Admin of their personal Organization and
      // a member of another one, so scoping to either alone hid the customers
      // their pieces were linked to), plus, in management mode, the
      // organizations a Rep Admin runs, whose follow-ups then count too.
      const managed = scope.kind === "organizations" ? scope.organizationIds : [];
      visibleTo = { repId: actor.rep.id, managedOrganizationIds: managed, activeOrganizationIds: scope.activeOrganizationIds };
      if (!managed.length) taskRepId = actor.rep.id;
    }

    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const leads = await storage.listSalesLeads({ ownerRepId, organizationIds, visibleTo, search, limit, offset });

    if (!leads.length) return res.json([]);

    const leadIds = leads.map((l) => l.id);
    const [allLocations, allContacts, openOpportunitiesMap, salesByLead, followUps] = await Promise.all([
      storage.listSalesLeadLocationsBatch(leadIds),
      storage.listSalesLeadContactsBatch(leadIds),
      storage.countOpenOpportunitiesByLeadIds(leadIds),
      salesStorage.leadSalesBatch(leadIds),
      storage.openFollowUpsByLeadIds(leadIds, taskRepId),
    ]);

    const locationsByLead = new Map<number, typeof allLocations>();
    for (const loc of allLocations) {
      if (!locationsByLead.has(loc.leadId)) locationsByLead.set(loc.leadId, []);
      locationsByLead.get(loc.leadId)!.push(loc);
    }
    const contactsByLead = new Map<number, typeof allContacts>();
    for (const contact of allContacts) {
      if (!contactsByLead.has(contact.leadId)) contactsByLead.set(contact.leadId, []);
      contactsByLead.get(contact.leadId)!.push(contact);
    }

    const enriched = leads.map((lead) => ({
      ...lead,
      locations: locationsByLead.get(lead.id) ?? [],
      contacts: contactsByLead.get(lead.id) ?? [],
      openOpportunities: openOpportunitiesMap[lead.id] ?? 0,
      // What the company card shows at a glance: sold here, and stock on their shelf.
      salesLifetimeCents: salesByLead.get(lead.id)?.lifetimeCents ?? 0,
      unitsOnShelf: salesByLead.get(lead.id)?.unitsOnShelf ?? 0,
      // Feeds the Companies "Follow-up" chip: nextVisitDueAt alone is only set
      // by a voice follow-up and is cleared at every check-in.
      openFollowUp: followUps.has(lead.id),
      openFollowUpDueAt: followUps.get(lead.id) ?? null,
    }));

    res.json(enriched);
  });

  // POST /leads — always owned by the acting rep; no auto-sync to GHL
  router.post("/leads", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const input = xpotLeadCreateSchema.parse(req.body);
    const status = input.status || "lead";
    const organizationId = await organizationIdForRep(actor!.rep.id);
    // A Google business is one company per Organization (migration 0049). The
    // check-in searches import a picked Google result whenever they cannot see
    // a saved match (they only ask the server for a few matches by name), so
    // the same place can arrive here twice. Inserting it again hit the unique
    // index as an unhandled rejection and the request hung. A company the rep
    // can open (canAccessLead, as GET /leads/:id) comes back as is; one they
    // cannot is refused without its name or id.
    const existingForPlace = async () => {
      if (!input.googlePlaceId) return undefined;
      return storage.getSalesLeadByGooglePlace(organizationId, input.googlePlaceId);
    };
    const answerExisting = async (existing: NonNullable<Awaited<ReturnType<typeof existingForPlace>>>) => {
      if (!(await canAccessLead(actor!, existing))) {
        return res.status(409).json({ code: "lead_exists", message: "This business is already saved by someone else in your organization." });
      }
      return res.status(200).json({ lead: await storage.getSalesLead(existing.id), existing: true });
    };

    const alreadySaved = await existingForPlace();
    if (alreadySaved) return answerExisting(alreadySaved);

    let lead;
    try {
      lead = await storage.createSalesLead({
        organizationId,
        name: input.name,
        legalName: input.legalName,
        website: input.website,
        phone: input.phone,
        email: input.email,
        industry: input.industry,
        source: input.source || "field",
        status,
        ownerRepId: actor!.rep.id,
        territoryName: input.territoryName,
        notes: input.notes,
        socialUrls: input.socialUrls,
        googlePlaceId: input.googlePlaceId,
      });
    } catch (err) {
      // Two imports of the same place racing past the lookup above.
      const raced = (err as { code?: string; cause?: { code?: string } });
      if (raced.code === "23505" || raced.cause?.code === "23505") {
        const winner = await existingForPlace();
        if (winner) return answerExisting(winner);
      }
      throw err;
    }

    if (input.primaryLocation?.addressLine1) {
      await storage.createSalesLeadLocation({
        leadId: lead.id,
        label: input.primaryLocation.label || "Main",
        addressLine1: input.primaryLocation.addressLine1,
        addressLine2: input.primaryLocation.addressLine2,
        city: input.primaryLocation.city,
        state: input.primaryLocation.state,
        postalCode: input.primaryLocation.postalCode,
        country: input.primaryLocation.country || "US",
        lat: input.primaryLocation.lat,
        lng: input.primaryLocation.lng,
        // Omitted: the admin's default radius (storage fills it in).
        geofenceRadiusMeters: input.primaryLocation.geofenceRadiusMeters || undefined,
        isPrimary: input.primaryLocation.isPrimary ?? true,
      });
    }

    syncLeadToXphere(lead.id).catch((err) => console.error("[leads] xphere sync failed:", err));

    const fullLead = await storage.getSalesLead(lead.id);
    res.status(201).json({ lead: fullLead });
  });

  // CSV import — creates prospects, never auto-syncs
  const csvImportSchema = z.object({
    rows: z.array(z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().optional(),
      website: z.string().optional(),
      industry: z.string().optional(),
      addressLine1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
    })).min(1).max(500),
  });

  // Leads are the businesses both modules sell to, so the list and create/edit stay open to Tags
  // resellers; importing, the check-in geofence, the CRM push and promoting a prospect are Visits work.
  router.post("/leads/import-csv", requireVisitsModule, async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const { rows } = csvImportSchema.parse(req.body);
    const organizationId = await organizationIdForRep(actor!.rep.id);

    const created: number[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const lead = await storage.createSalesLead({
          organizationId,
          name: row.name,
          phone: row.phone || undefined,
          email: row.email || undefined,
          website: row.website || undefined,
          industry: row.industry || undefined,
          source: "csv_import",
          status: "prospect",
          ownerRepId: actor!.rep.id,
        });

        if (row.addressLine1 || row.city || row.state) {
          await storage.createSalesLeadLocation({
            leadId: lead.id,
            label: "Main",
            addressLine1: row.addressLine1 || "",
            city: row.city,
            state: row.state,
            postalCode: row.postalCode,
            country: "US",
            isPrimary: true,
          });
        }
        created.push(lead.id);
      } catch (err: any) {
        errors.push({ row: i + 1, message: err.message });
      }
    }

    res.json({ created: created.length, errors });
  });

  // The compact visit brief reads the business reputation live from the Place
  // already linked to this lead. Keeping it out of the lead row avoids stale
  // ratings while React Query prevents repeated calls during one visit.
  router.get("/leads/:id/google-profile", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    if (rateLimit(`places:profile:${actor!.rep.id}`, { limit: 60, windowMs: 5 * 60_000 })) {
      return res.status(429).json({ code: "too_many_requests", message: "Too many Google profile requests. Please wait a moment." });
    }
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ code: "lead_not_found", message: "Lead not found" });
    if (!(await canAccessLead(actor!, lead))) return res.status(403).json({ code: "access_denied", message: "Access denied" });

    if (!lead.googlePlaceId) {
      return res.json({ connected: false, rating: null, reviewCount: null, mapsUrl: null, openNow: null });
    }

    const apiKey = await resolveGoogleApiKey();
    if (!apiKey) {
      return res.json({ connected: true, rating: null, reviewCount: null, mapsUrl: null, openNow: null });
    }

    try {
      const profile = await fetchGooglePlaceProfile(lead.googlePlaceId, apiKey);
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.json({
        connected: true,
        rating: profile.rating,
        reviewCount: profile.reviewCount,
        mapsUrl: profile.mapsUrl,
        openNow: profile.openNow,
      });
    } catch (error) {
      return res.status(502).json({ message: (error as Error).message || "Google business profile could not be loaded" });
    }
  });

  // Linking is a sync operation, not just an ID update: the selected Google
  // place becomes the canonical source for the company's public details.
  router.post("/leads/:id/google-profile", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    if (rateLimit(`places:profile-link:${actor!.rep.id}`, { limit: 20, windowMs: 60_000 })) {
      return res.status(429).json({ code: "too_many_requests", message: "Too many Google profile updates. Please wait a moment." });
    }
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ code: "lead_not_found", message: "Lead not found" });
    if (!(await canAccessLead(actor!, lead))) return res.status(403).json({ code: "access_denied", message: "Access denied" });

    const { placeId } = googleProfileLinkSchema.parse(req.body);
    if (!placeId) {
      const updated = await storage.updateSalesLead(leadId, { googlePlaceId: null });
      return res.json({
        lead: updated,
        location: null,
        profile: { connected: false, rating: null, reviewCount: null, mapsUrl: null, openNow: null },
      });
    }

    const apiKey = await resolveGoogleApiKey();
    if (!apiKey) {
      return res.status(503).json({ message: "Google Places is not configured. Please add API key in Admin > Integrations." });
    }

    try {
      const profile = await fetchGooglePlaceProfile(placeId, apiKey);
      const updated = await storage.updateSalesLead(leadId, {
        googlePlaceId: profile.placeId,
        ...(profile.name ? { name: profile.name } : {}),
        ...(profile.phone ? { phone: profile.phone } : {}),
        ...(profile.website ? { website: profile.website } : {}),
        ...(profile.industry ? { industry: profile.industry } : {}),
      });

      const location = profile.address?.addressLine1
        ? await storage.upsertPrimaryLocation(leadId, {
            label: "Main",
            addressLine1: profile.address.addressLine1,
            addressLine2: null,
            city: profile.address.city,
            state: profile.address.state,
            postalCode: profile.address.postalCode,
            country: profile.address.country,
            lat: profile.address.lat,
            lng: profile.address.lng,
            // No radius: an existing location keeps its own, a new one gets the default.
            isPrimary: true,
          })
        : null;

      return res.json({
        lead: updated,
        location,
        profile: {
          connected: true,
          rating: profile.rating,
          reviewCount: profile.reviewCount,
          mapsUrl: profile.mapsUrl,
          openNow: profile.openNow,
        },
      });
    } catch (error) {
      return res.status(502).json({ message: (error as Error).message || "Google business profile could not be linked" });
    }
  });

  // GET /leads/:id — rep sees own; manager sees any
  router.get("/leads/:id", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) {
      return res.status(400).json({ message: "Invalid lead id" });
    }

    const lead = await storage.getSalesLead(leadId);
    if (!lead) {
      return res.status(404).json({ code: "lead_not_found", message: "Lead not found" });
    }

    if (!(await canAccessLead(actor!, lead))) {
      return res.status(403).json({ code: "access_denied", message: "Access denied" });
    }

    // SEG-06: the lead check above is right, but these collections were not
    // scoped — listSalesOpportunities({ leadId }) returned every rep's deals on
    // the lead, and listSalesTasks() loaded the whole table before filtering in
    // memory. A manager sharing a lead with a rep exposed both pipelines.
    const seesAll = listsEveryone(req, actor!) || await canManageOrganizationForActor(actor!, lead.organizationId);
    const scope = seesAll ? undefined : actor!.rep.id;
    const [locations, contacts, visits, opportunities, tasks] = await Promise.all([
      storage.listSalesLeadLocations(leadId),
      storage.listSalesLeadContacts(leadId),
      storage.listSalesVisits({ leadId, repId: scope }),
      storage.listSalesOpportunities({ leadId, repId: scope }),
      storage.listSalesTasks({ leadId, repId: scope }),
    ]);

    res.json({
      lead,
      locations,
      contacts,
      visits: visits.slice(0, 10),
      opportunities,
      tasks: tasks.filter((task) => task.leadId === leadId).slice(0, 10),
    });
  });

  // PATCH /leads/:id — rep edits own; manager edits any; no auto-sync
  router.patch("/leads/:id", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    const input = xpotLeadUpdateSchema.parse(req.body);

    const lead = await storage.getSalesLead(leadId);
    if (!lead) {
      return res.status(404).json({ code: "lead_not_found", message: "Lead not found" });
    }

    if (!(await canAccessLead(actor!, lead))) {
      return res.status(403).json({ code: "access_denied", message: "Access denied" });
    }
    // The pipeline status (prospect → lead → …) is Visits work, like POST /leads/:id/promote; a Tags-only
    // reseller may edit a customer's details but not move it through the funnel.
    if (input.status !== undefined && !isManagerOrAdmin(actor!) && !repModules(actor!.rep).includes("visits")) {
      return res.status(403).json({ code: "module_off", message: "Visits are not enabled for your account." });
    }
    // Holding a piece there lets a rep edit the company's details, not take it over
    // (owning it would then let them delete it) nor move it through the funnel.
    const ownerLevelChange = (input.ownerRepId !== undefined && input.ownerRepId !== lead.ownerRepId) ||
      (input.status !== undefined && input.status !== lead.status);
    if (ownerLevelChange && !(await ownsLead(actor!, lead))) return refuseNotOwner(res);

    let updated;
    try {
      updated = await storage.updateSalesLead(leadId, input);
    } catch (err) {
      // Linking a Google place another company of the organization already has (unique index):
      // say so, without naming that company, as POST /leads does.
      const clash = err as { code?: string; cause?: { code?: string } };
      if (input.googlePlaceId && (clash.code === "23505" || clash.cause?.code === "23505")) {
        return res.status(409).json({ code: "lead_exists", message: "This place is already saved as another company." });
      }
      throw err;
    }
    res.json({ lead: updated });
  });

  // PATCH /leads/:id/location — upsert primary location
  router.patch("/leads/:id/location", requireVisitsModule, async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ code: "lead_not_found", message: "Lead not found" });
    if (!(await canAccessLead(actor!, lead))) {
      return res.status(403).json({ code: "access_denied", message: "Access denied" });
    }

    const [locations, appSettings] = await Promise.all([
      storage.listSalesLeadLocations(leadId),
      storage.getSalesAppSettings(),
    ]);
    const existing = locations.find((location) => location.isPrimary) ?? null;
    // Address editors send no coordinates; keep them unless the address moved
    // (see planPrimaryLocationUpdate for the full rule).
    const plan = planPrimaryLocationUpdate(existing, req.body ?? {}, appSettings.defaultGeofenceRadiusMeters);
    if (plan.geocode) {
      const apiKey = await resolveGoogleApiKey();
      const coords = apiKey ? await geocodeAddress(plan.geocode, apiKey) : null;
      if (coords) Object.assign(plan.data, coords);
    }
    const location = await storage.upsertPrimaryLocation(leadId, plan.data);

    res.json({ location });
  });

  // POST /leads/:id/sync-ghl — manual, explicit, promotes prospect → lead
  router.post("/leads/:id/sync-ghl", requireVisitsModule, async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ code: "lead_not_found", message: "Lead not found" });

    if (!(await canAccessLead(actor!, lead))) {
      return res.status(403).json({ code: "access_denied", message: "Access denied" });
    }
    // Pushing a company to the CRM (and promoting it) is the owner's call, not a piece holder's.
    if (!(await ownsLead(actor!, lead))) return refuseNotOwner(res);

    if (lead.status === "prospect") {
      await storage.updateSalesLead(leadId, { status: "lead" });
    }
    const syncResult = await syncLeadToGhl(leadId);
    const updated = await storage.getSalesLead(leadId);
    res.json({ lead: updated, ghl: syncResult });
  });

  // POST /leads/:id/promote — explicitly promote prospect → lead
  router.post("/leads/:id/promote", requireVisitsModule, async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ code: "lead_not_found", message: "Lead not found" });

    if (!(await canAccessLead(actor!, lead))) {
      return res.status(403).json({ code: "access_denied", message: "Access denied" });
    }
    if (!(await ownsLead(actor!, lead))) return refuseNotOwner(res);

    if (lead.status !== "prospect") {
      return res.status(400).json({ message: "Lead is already a lead or beyond prospect stage" });
    }

    await storage.updateSalesLead(leadId, { status: "lead" });
    const updated = await storage.getSalesLead(leadId);
    res.json({ lead: updated });
  });

  // DELETE /leads/:id — rep deletes own; manager deletes any
  router.delete("/leads/:id", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ code: "lead_not_found", message: "Lead not found" });

    // Holding a piece there lets a rep see and edit a company, not delete someone else's lead.
    if (!(await ownsLead(actor!, lead))) return refuseNotOwner(res);

    const files = await storage.deleteSalesLead(leadId);
    res.status(204).end();
    // Best-effort, after the rows are gone: a storage error is logged, not surfaced.
    void discardFiles(files, `lead #${leadId} deleted`);
  });

  // POST /leads/:id/photos — upload a photo, prepend to photos array (first = cover).
  // Photos are private: the lead keeps a storage reference ("r2:photos/…"),
  // and the browser reads it through GET /files (server/routes/xpot/files.ts).
  router.post("/leads/:id/photos", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const lead = await loadAccessibleLead(req, res, Number(req.params.id));
    if (!lead) return;

    const { imageData } = req.body as { imageData?: string };
    if (!imageData) return res.status(400).json({ message: "imageData is required" });
    const match = imageData.match(/^data:image\/(\w+);base64,/);
    const ext = (match?.[1] || "jpg").toLowerCase();

    if (!activeStore()) {
      return res.status(503).json({ message: "Storage not configured" });
    }

    try {
      const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ""), "base64");
      const key = `photos/${actor!.rep.id}/lead_${lead.id}_${Date.now()}.${ext}`;
      const photo = await putPrivateFile(key, buffer, `image/${ext}`);

      const currentPhotos = lead.photos ?? [];
      const updated = await storage.updateSalesLead(lead.id, { photos: [photo, ...currentPhotos] });

      res.json({ lead: updated, photo });
    } catch (err: any) {
      console.error("Photo upload error:", err);
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // DELETE /leads/:id/photos — remove a photo (by its stored reference) and its file
  router.delete("/leads/:id/photos", async (req, res) => {
    // `photoUrl` is the old field name; older clients still send it.
    const { photo, photoUrl } = req.body as { photo?: string; photoUrl?: string };
    const target = photo || photoUrl;
    if (!target) return res.status(400).json({ message: "photo is required" });

    // Removing a photo deletes its stored file: the owner's call, not a piece holder's.
    const lead = await loadAccessibleLead(req, res, Number(req.params.id), "owner");
    if (!lead) return;

    const currentPhotos = lead.photos ?? [];
    if (!currentPhotos.includes(target)) return res.json({ lead });
    const updated = await storage.updateSalesLead(lead.id, { photos: currentPhotos.filter((u) => u !== target) });
    res.json({ lead: updated });
    void discardFiles([target], `photo removed from lead #${lead.id}`);
  });

  // SEG-04: these two were the only routes in this file with no ownership
  // check — any rep could list or inject contacts on any lead by walking ids.
  router.get("/leads/:id/contacts", async (req, res) => {
    const lead = await loadAccessibleLead(req, res, Number(req.params.id));
    if (!lead) return;
    res.json(await storage.listSalesLeadContacts(lead.id));
  });

  router.post("/leads/:id/contacts", async (req, res) => {
    const lead = await loadAccessibleLead(req, res, Number(req.params.id));
    if (!lead) return;
    const input = xpotLeadContactCreateSchema.parse(req.body);
    const contact = await storage.createSalesLeadContact({ ...input, leadId: lead.id });
    res.status(201).json(contact);
  });

  return router;
}
