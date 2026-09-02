import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep, isManagerOrAdmin, loadAccessibleLead } from "./middleware.js";
import { xpotLeadCreateSchema, xpotLeadUpdateSchema, xpotLeadContactCreateSchema } from "#shared/xpot.js";
import { syncLeadToGhl, syncLeadToXphere } from "./helpers.js";
import { salesStorage } from "../../storage-sales.js";

export function createLeadsRouter() {
  const router = Router();
  router.use(requireXpotUser);

  // GET /leads — rep sees own; manager/admin sees all (optional ?repId= filter)
  router.get("/leads", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;

    let ownerRepId: number | undefined;
    if (isManagerOrAdmin(actor!)) {
      // Manager can filter by a specific rep
      ownerRepId = req.query.repId ? Number(req.query.repId) : undefined;
    } else {
      ownerRepId = actor!.rep.id;
    }

    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const leads = await storage.listSalesLeads({ ownerRepId, search });

    if (!leads.length) return res.json([]);

    const leadIds = leads.map((l) => l.id);
    const [allLocations, allContacts, openOpportunitiesMap, salesByLead] = await Promise.all([
      storage.listSalesLeadLocationsBatch(leadIds),
      storage.listSalesLeadContactsBatch(leadIds),
      storage.countOpenOpportunitiesByLeadIds(leadIds),
      salesStorage.leadSalesBatch(leadIds),
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
    }));

    res.json(enriched);
  });

  // POST /leads — always owned by the acting rep; no auto-sync to GHL
  router.post("/leads", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const input = xpotLeadCreateSchema.parse(req.body);
    const status = input.status || "lead";

    const lead = await storage.createSalesLead({
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
    });

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
        geofenceRadiusMeters: input.primaryLocation.geofenceRadiusMeters || 150,
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

  router.post("/leads/import-csv", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const { rows } = csvImportSchema.parse(req.body);

    const created: number[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const lead = await storage.createSalesLead({
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
            geofenceRadiusMeters: 150,
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

  // GET /leads/:id — rep sees own; manager sees any
  router.get("/leads/:id", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) {
      return res.status(400).json({ message: "Invalid lead id" });
    }

    const lead = await storage.getSalesLead(leadId);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    if (!isManagerOrAdmin(actor!) && lead.ownerRepId !== actor!.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // SEG-06: the lead check above is right, but these collections were not
    // scoped — listSalesOpportunities({ leadId }) returned every rep's deals on
    // the lead, and listSalesTasks() loaded the whole table before filtering in
    // memory. A manager sharing a lead with a rep exposed both pipelines.
    const seesAll = isManagerOrAdmin(actor!);
    const scope = seesAll ? undefined : actor!.rep.id;
    const [locations, contacts, visits, opportunities, tasks] = await Promise.all([
      storage.listSalesLeadLocations(leadId),
      storage.listSalesLeadContacts(leadId),
      storage.listSalesVisits({ leadId, repId: scope }),
      storage.listSalesOpportunities({ leadId, repId: scope }),
      storage.listSalesTasks({ repId: scope }),
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
      return res.status(404).json({ message: "Lead not found" });
    }

    if (!isManagerOrAdmin(actor!) && lead.ownerRepId !== actor!.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updated = await storage.updateSalesLead(leadId, input);
    res.json({ lead: updated });
  });

  // PATCH /leads/:id/location — upsert primary location
  router.patch("/leads/:id/location", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    if (!isManagerOrAdmin(actor!) && lead.ownerRepId !== actor!.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const location = await storage.upsertPrimaryLocation(leadId, {
      label: req.body.label || "Main",
      addressLine1: req.body.addressLine1 || "",
      addressLine2: req.body.addressLine2 ?? null,
      city: req.body.city ?? null,
      state: req.body.state ?? null,
      postalCode: req.body.postalCode ?? null,
      country: req.body.country || "US",
      // Callers send numbers (Google Places, geolocation); the column is text.
      lat: req.body.lat == null ? null : String(req.body.lat),
      lng: req.body.lng == null ? null : String(req.body.lng),
      geofenceRadiusMeters: req.body.geofenceRadiusMeters || 150,
      isPrimary: true,
    });

    res.json({ location });
  });

  // POST /leads/:id/sync-ghl — manual, explicit, promotes prospect → lead
  router.post("/leads/:id/sync-ghl", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    if (!isManagerOrAdmin(actor!) && lead.ownerRepId !== actor!.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const syncResult = await syncLeadToGhl(leadId);
    const updated = await storage.getSalesLead(leadId);
    res.json({ lead: updated, ghl: syncResult });
  });

  // POST /leads/:id/promote — explicitly promote prospect → lead
  router.post("/leads/:id/promote", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    if (!isManagerOrAdmin(actor!) && lead.ownerRepId !== actor!.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }

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
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    if (!isManagerOrAdmin(actor!) && lead.ownerRepId !== actor!.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    await storage.deleteSalesLead(leadId);
    res.status(204).end();
  });

  // POST /leads/:id/photos — upload a photo, prepend to photos array (first = cover)
  router.post("/leads/:id/photos", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    if (!isManagerOrAdmin(actor!) && lead.ownerRepId !== actor!.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { imageData } = req.body as { imageData?: string };
    if (!imageData) return res.status(400).json({ message: "imageData is required" });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ message: "Storage not configured" });
    }

    try {
      const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const ext = imageData.match(/^data:image\/(\w+);/)?.[1] || "jpg";
      const filename = `lead_${leadId}_${Date.now()}.${ext}`;
      const path = `photos/${actor!.rep.id}/${filename}`;

      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase.storage.from("uploads").upload(path, buffer, {
        contentType: `image/${ext}`,
        upsert: false,
      });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);
      const photoUrl = urlData.publicUrl;

      const currentPhotos = (lead as any).photos as string[] ?? [];
      const updated = await storage.updateSalesLead(leadId, { photos: [photoUrl, ...currentPhotos] } as any);

      res.json({ lead: updated, photoUrl });
    } catch (err: any) {
      console.error("Photo upload error:", err);
      res.status(500).json({ message: err.message || "Failed to upload photo" });
    }
  });

  // DELETE /leads/:id/photos — remove a photo by URL
  router.delete("/leads/:id/photos", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const leadId = Number(req.params.id);
    const { photoUrl } = req.body as { photoUrl?: string };
    if (!photoUrl) return res.status(400).json({ message: "photoUrl is required" });

    const lead = await storage.getSalesLead(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    if (!isManagerOrAdmin(actor!) && lead.ownerRepId !== actor!.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const currentPhotos = (lead as any).photos as string[] ?? [];
    const updated = await storage.updateSalesLead(leadId, { photos: currentPhotos.filter((u) => u !== photoUrl) } as any);
    res.json({ lead: updated });
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
