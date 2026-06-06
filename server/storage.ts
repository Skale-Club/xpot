// Xpot storage layer — lean port of the sales* methods from the original
// skaleclub server/storage.ts (3,488 LOC monolith). Only the methods Xpot
// actually uses live here, plus the two integration helpers (`getChatIntegration`,
// `getIntegrationSettings`) so the GHL sync helpers continue to work.

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  // Schema tables
  salesAppSettings,
  salesReps,
  users,
  salesLeads,
  salesLeadLocations,
  salesLeadContacts,
  salesVisits,
  salesVisitNotes,
  salesOpportunitiesLocal,
  salesTasks,
  salesSyncEvents,
  chatIntegrations,
  integrationSettings,
  xphereIntegrations,
  appBranding,
  // Inferred types
  type SalesAppSettings,
  type SalesRep,
  type SalesLead,
  type SalesLeadLocation,
  type SalesLeadContact,
  type SalesVisit,
  type SalesVisitNote,
  type SalesOpportunity,
  type SalesOpportunityStatus,
  type SalesTask,
  type SalesTaskStatus,
  type SalesSyncEvent,
  type User,
  type InsertSalesAppSettings,
  type InsertSalesRep,
  type InsertSalesLead,
  type InsertSalesLeadLocation,
  type InsertSalesLeadContact,
  type InsertSalesVisit,
  type InsertSalesVisitNote,
  type InsertSalesOpportunity,
  type InsertSalesTask,
  type InsertSalesSyncEvent,
  type ChatIntegration,
  type IntegrationSettings,
  type XphereIntegration,
  type InsertXphereIntegration,
  type AppBranding,
  type InsertAppBranding,
} from "#shared/schema.js";

// ─── Recent-visits joined shape (used by /api/xpot/admin/recent-visits) ──────

export type RecentSalesVisit = {
  visit: SalesVisit;
  rep: Pick<SalesRep, "id" | "displayName" | "team"> | null;
  lead: Pick<SalesLead, "id" | "name" | "industry"> | null;
  location: Pick<SalesLeadLocation, "id" | "label" | "addressLine1" | "city" | "state"> | null;
  note: Pick<SalesVisitNote, "summary" | "outcome" | "nextStep" | "sentiment"> | null;
  syncStatus: string | null;
  syncLastError: string | null;
};

// ─── Storage interface (intentionally narrow) ────────────────────────────────

export interface IStorage {
  // Settings + integrations (shared with skaleclub today; isolated when Xpot gets its own Supabase)
  getSalesAppSettings(): Promise<SalesAppSettings>;
  updateSalesAppSettings(settings: Partial<InsertSalesAppSettings>): Promise<SalesAppSettings>;
  getChatIntegration(provider: string): Promise<ChatIntegration | undefined>;
  getIntegrationSettings(provider: string): Promise<IntegrationSettings | undefined>;
  listChatIntegrations(): Promise<ChatIntegration[]>;
  listIntegrationSettings(): Promise<IntegrationSettings[]>;
  upsertChatIntegration(provider: string, data: Partial<typeof chatIntegrations.$inferInsert>): Promise<ChatIntegration>;
  upsertIntegrationSettings(provider: string, data: Partial<typeof integrationSettings.$inferInsert>): Promise<IntegrationSettings>;

  // Xphere per-user (tenant) integration config
  getXphereIntegrationByUserId(userId: string): Promise<XphereIntegration | undefined>;
  getXphereIntegrationByInboundKey(key: string): Promise<XphereIntegration | undefined>;
  upsertXphereIntegration(userId: string, data: Partial<Omit<InsertXphereIntegration, "userId">>): Promise<XphereIntegration>;
  listXphereIntegrations(): Promise<XphereIntegration[]>;

  // App branding (favicon + PWA manifest)
  getAppBranding(): Promise<AppBranding>;
  upsertAppBranding(data: Partial<Omit<InsertAppBranding, "id">>): Promise<AppBranding>;

  // Reps
  listSalesReps(): Promise<SalesRep[]>;
  getSalesRep(id: number): Promise<SalesRep | undefined>;
  getSalesRepByUserId(userId: string): Promise<SalesRep | undefined>;
  upsertSalesRep(input: InsertSalesRep): Promise<SalesRep>;
  updateSalesRepProfile(id: number, data: { displayName?: string; phone?: string; avatarUrl?: string }): Promise<SalesRep>;

  // Users
  updateUserProfile(userId: string, data: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }): Promise<User>;

  // Leads + child tables
  listSalesLeads(filters?: { ownerRepId?: number; search?: string }): Promise<SalesLead[]>;
  getSalesLead(id: number): Promise<SalesLead | undefined>;
  createSalesLead(input: InsertSalesLead): Promise<SalesLead>;
  updateSalesLead(id: number, input: Partial<InsertSalesLead>): Promise<SalesLead | undefined>;
  deleteSalesLead(id: number): Promise<void>;
  listSalesLeadLocations(leadId: number): Promise<SalesLeadLocation[]>;
  listSalesLeadLocationsBatch(leadIds: number[]): Promise<SalesLeadLocation[]>;
  createSalesLeadLocation(input: InsertSalesLeadLocation): Promise<SalesLeadLocation>;
  upsertPrimaryLocation(leadId: number, data: Omit<InsertSalesLeadLocation, "leadId">): Promise<SalesLeadLocation>;
  listSalesLeadContacts(leadId: number): Promise<SalesLeadContact[]>;
  listSalesLeadContactsBatch(leadIds: number[]): Promise<SalesLeadContact[]>;
  createSalesLeadContact(input: InsertSalesLeadContact): Promise<SalesLeadContact>;
  countOpenOpportunitiesByLeadIds(leadIds: number[]): Promise<Record<number, number>>;

  // Visits
  listSalesVisits(filters?: { repId?: number; leadId?: number; activeOnly?: boolean }): Promise<SalesVisit[]>;
  listRecentSalesVisits(limit?: number, offset?: number, filters?: { repId?: number }): Promise<{ data: RecentSalesVisit[]; total: number }>;
  getSalesVisit(id: number): Promise<SalesVisit | undefined>;
  getActiveSalesVisitForRep(repId: number): Promise<SalesVisit | undefined>;
  createSalesVisit(input: InsertSalesVisit): Promise<SalesVisit>;
  updateSalesVisit(id: number, input: Partial<InsertSalesVisit>): Promise<SalesVisit | undefined>;
  deleteSalesVisit(id: number): Promise<void>;
  getSalesVisitNote(visitId: number): Promise<SalesVisitNote | undefined>;
  upsertSalesVisitNote(input: InsertSalesVisitNote): Promise<SalesVisitNote>;

  // Opportunities + tasks
  listSalesOpportunities(filters?: { repId?: number; leadId?: number; status?: SalesOpportunityStatus }): Promise<SalesOpportunity[]>;
  createSalesOpportunity(input: InsertSalesOpportunity): Promise<SalesOpportunity>;
  updateSalesOpportunity(id: number, input: Partial<InsertSalesOpportunity>): Promise<SalesOpportunity | undefined>;
  listSalesTasks(filters?: { repId?: number; status?: SalesTaskStatus }): Promise<SalesTask[]>;
  createSalesTask(input: InsertSalesTask): Promise<SalesTask>;
  updateSalesTask(id: number, input: Partial<InsertSalesTask>): Promise<SalesTask | undefined>;

  // GHL sync audit log
  listSalesSyncEvents(limit?: number): Promise<SalesSyncEvent[]>;
  listSalesSyncEventsForRep(repId: number, limit?: number): Promise<SalesSyncEvent[]>;
  createSalesSyncEvent(input: InsertSalesSyncEvent): Promise<SalesSyncEvent>;
  updateSalesSyncEvent(id: number, input: Partial<InsertSalesSyncEvent>): Promise<SalesSyncEvent | undefined>;
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  // ── Settings + integrations ──

  async getSalesAppSettings(): Promise<SalesAppSettings> {
    const [settings] = await db.select().from(salesAppSettings).limit(1);
    if (settings) return settings;
    const [created] = await db.insert(salesAppSettings).values({}).returning();
    return created;
  }

  async updateSalesAppSettings(settings: Partial<InsertSalesAppSettings>): Promise<SalesAppSettings> {
    const existing = await this.getSalesAppSettings();
    const [updated] = await db
      .update(salesAppSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(salesAppSettings.id, existing.id))
      .returning();
    return updated;
  }

  async getChatIntegration(provider: string): Promise<ChatIntegration | undefined> {
    const [integration] = await db.select().from(chatIntegrations).where(eq(chatIntegrations.provider, provider));
    return integration;
  }

  async getIntegrationSettings(provider: string): Promise<IntegrationSettings | undefined> {
    const [settings] = await db.select().from(integrationSettings).where(eq(integrationSettings.provider, provider));
    return settings;
  }

  async listChatIntegrations(): Promise<ChatIntegration[]> {
    return await db.select().from(chatIntegrations);
  }

  async listIntegrationSettings(): Promise<IntegrationSettings[]> {
    return await db.select().from(integrationSettings);
  }

  async upsertChatIntegration(
    provider: string,
    data: Partial<typeof chatIntegrations.$inferInsert>
  ): Promise<ChatIntegration> {
    const existing = await this.getChatIntegration(provider);
    if (existing) {
      const [updated] = await db
        .update(chatIntegrations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(chatIntegrations.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(chatIntegrations).values({ ...data, provider }).returning();
    return created;
  }

  async upsertIntegrationSettings(
    provider: string,
    data: Partial<typeof integrationSettings.$inferInsert>
  ): Promise<IntegrationSettings> {
    const existing = await this.getIntegrationSettings(provider);
    if (existing) {
      const [updated] = await db
        .update(integrationSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(integrationSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(integrationSettings).values({ ...data, provider }).returning();
    return created;
  }

  // ── Xphere per-user (tenant) integration config ──

  async getXphereIntegrationByUserId(userId: string): Promise<XphereIntegration | undefined> {
    const [row] = await db.select().from(xphereIntegrations).where(eq(xphereIntegrations.userId, userId));
    return row;
  }

  async getXphereIntegrationByInboundKey(key: string): Promise<XphereIntegration | undefined> {
    const [row] = await db.select().from(xphereIntegrations).where(eq(xphereIntegrations.inboundApiKey, key));
    return row;
  }

  async upsertXphereIntegration(userId: string, data: Partial<Omit<InsertXphereIntegration, "userId">>): Promise<XphereIntegration> {
    const existing = await this.getXphereIntegrationByUserId(userId);
    if (existing) {
      const [updated] = await db
        .update(xphereIntegrations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(xphereIntegrations.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(xphereIntegrations).values({ userId, ...data }).returning();
    return created;
  }

  async listXphereIntegrations(): Promise<XphereIntegration[]> {
    return await db.select().from(xphereIntegrations);
  }

  // ── App branding (singleton row, id = 1) ──

  async getAppBranding(): Promise<AppBranding> {
    const [row] = await db.select().from(appBranding).where(eq(appBranding.id, 1));
    if (row) return row;
    // Seed on first read if the migration's seed somehow didn't run.
    const [created] = await db.insert(appBranding).values({ id: 1 }).onConflictDoNothing().returning();
    return created ?? (await db.select().from(appBranding).where(eq(appBranding.id, 1)))[0];
  }

  async upsertAppBranding(data: Partial<Omit<InsertAppBranding, "id">>): Promise<AppBranding> {
    await this.getAppBranding(); // ensure the row exists
    const [updated] = await db
      .update(appBranding)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(appBranding.id, 1))
      .returning();
    return updated;
  }

  // ── Reps ──

  async listSalesReps(): Promise<SalesRep[]> {
    return await db.select().from(salesReps).orderBy(asc(salesReps.displayName));
  }

  async getSalesRep(id: number): Promise<SalesRep | undefined> {
    const [rep] = await db.select().from(salesReps).where(eq(salesReps.id, id));
    return rep;
  }

  async getSalesRepByUserId(userId: string): Promise<SalesRep | undefined> {
    const [rep] = await db.select().from(salesReps).where(eq(salesReps.userId, userId));
    return rep;
  }

  async upsertSalesRep(input: InsertSalesRep): Promise<SalesRep> {
    const existing = await this.getSalesRepByUserId(input.userId);
    if (existing) {
      const [updated] = await db
        .update(salesReps)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(salesReps.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(salesReps).values(input).returning();
    return created;
  }

  async updateSalesRepProfile(id: number, data: { displayName?: string; phone?: string; avatarUrl?: string }): Promise<SalesRep> {
    const [updated] = await db
      .update(salesReps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(salesReps.id, id))
      .returning();
    return updated;
  }

  async updateUserProfile(userId: string, data: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }): Promise<User> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  // ── Leads ──

  async listSalesLeads(filters: { ownerRepId?: number; search?: string } = {}): Promise<SalesLead[]> {
    const conditions: any[] = [];
    if (filters.ownerRepId) conditions.push(eq(salesLeads.ownerRepId, filters.ownerRepId));
    if (filters.search) {
      const likeValue = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(salesLeads.name, likeValue),
          ilike(salesLeads.legalName, likeValue),
          ilike(salesLeads.email, likeValue),
          ilike(salesLeads.phone, likeValue),
        )
      );
    }
    if (conditions.length) {
      return await db.select().from(salesLeads).where(and(...conditions)).orderBy(desc(salesLeads.updatedAt));
    }
    return await db.select().from(salesLeads).orderBy(desc(salesLeads.updatedAt));
  }

  async getSalesLead(id: number): Promise<SalesLead | undefined> {
    const [lead] = await db.select().from(salesLeads).where(eq(salesLeads.id, id));
    return lead;
  }

  async createSalesLead(input: InsertSalesLead): Promise<SalesLead> {
    const [created] = await db.insert(salesLeads).values(input as any).returning();
    return created;
  }

  async updateSalesLead(id: number, input: Partial<InsertSalesLead>): Promise<SalesLead | undefined> {
    const [updated] = await db
      .update(salesLeads)
      .set({ ...input, updatedAt: new Date() } as any)
      .where(eq(salesLeads.id, id))
      .returning();
    return updated;
  }

  async deleteSalesLead(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const visitIds = (await tx
        .select({ id: salesVisits.id })
        .from(salesVisits)
        .where(eq(salesVisits.leadId, id)))
        .map((visit) => visit.id);

      const opportunityIds = (await tx
        .select({ id: salesOpportunitiesLocal.id })
        .from(salesOpportunitiesLocal)
        .where(eq(salesOpportunitiesLocal.leadId, id)))
        .map((opp) => opp.id);

      await tx.delete(salesTasks).where(eq(salesTasks.leadId, id));

      if (visitIds.length) {
        await tx.delete(salesTasks).where(inArray(salesTasks.visitId, visitIds));
        await tx.delete(salesVisitNotes).where(inArray(salesVisitNotes.visitId, visitIds));
      }

      if (opportunityIds.length) {
        await tx.delete(salesTasks).where(inArray(salesTasks.opportunityId, opportunityIds));
        await tx.delete(salesSyncEvents).where(
          and(
            eq(salesSyncEvents.entityType, "sales_opportunity"),
            inArray(salesSyncEvents.entityId, opportunityIds.map(String)),
          ),
        );
        await tx.delete(salesOpportunitiesLocal).where(inArray(salesOpportunitiesLocal.id, opportunityIds));
      }

      if (visitIds.length) {
        await tx.delete(salesVisits).where(inArray(salesVisits.id, visitIds));
      }

      await tx.delete(salesLeadContacts).where(eq(salesLeadContacts.leadId, id));
      await tx.delete(salesLeadLocations).where(eq(salesLeadLocations.leadId, id));
      await tx.delete(salesSyncEvents).where(
        and(
          eq(salesSyncEvents.entityType, "sales_lead"),
          eq(salesSyncEvents.entityId, String(id)),
        ),
      );
      await tx.delete(salesLeads).where(eq(salesLeads.id, id));
    });
  }

  async listSalesLeadLocations(leadId: number): Promise<SalesLeadLocation[]> {
    return await db
      .select()
      .from(salesLeadLocations)
      .where(eq(salesLeadLocations.leadId, leadId))
      .orderBy(desc(salesLeadLocations.isPrimary), asc(salesLeadLocations.id));
  }

  async listSalesLeadLocationsBatch(leadIds: number[]): Promise<SalesLeadLocation[]> {
    if (!leadIds.length) return [];
    return await db
      .select()
      .from(salesLeadLocations)
      .where(inArray(salesLeadLocations.leadId, leadIds))
      .orderBy(desc(salesLeadLocations.isPrimary), asc(salesLeadLocations.id));
  }

  async createSalesLeadLocation(input: InsertSalesLeadLocation): Promise<SalesLeadLocation> {
    const [created] = await db.insert(salesLeadLocations).values(input).returning();
    return created;
  }

  async upsertPrimaryLocation(leadId: number, data: Omit<InsertSalesLeadLocation, "leadId">): Promise<SalesLeadLocation> {
    const existing = await db
      .select()
      .from(salesLeadLocations)
      .where(and(eq(salesLeadLocations.leadId, leadId), eq(salesLeadLocations.isPrimary, true)))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await db
        .update(salesLeadLocations)
        .set({ ...data })
        .where(eq(salesLeadLocations.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(salesLeadLocations)
      .values({ ...data, leadId, isPrimary: true })
      .returning();
    return created;
  }

  async listSalesLeadContacts(leadId: number): Promise<SalesLeadContact[]> {
    return await db
      .select()
      .from(salesLeadContacts)
      .where(eq(salesLeadContacts.leadId, leadId))
      .orderBy(desc(salesLeadContacts.isPrimary), asc(salesLeadContacts.id));
  }

  async listSalesLeadContactsBatch(leadIds: number[]): Promise<SalesLeadContact[]> {
    if (!leadIds.length) return [];
    return await db
      .select()
      .from(salesLeadContacts)
      .where(inArray(salesLeadContacts.leadId, leadIds))
      .orderBy(desc(salesLeadContacts.isPrimary), asc(salesLeadContacts.id));
  }

  async createSalesLeadContact(input: InsertSalesLeadContact): Promise<SalesLeadContact> {
    const [created] = await db.insert(salesLeadContacts).values(input).returning();
    return created;
  }

  async countOpenOpportunitiesByLeadIds(leadIds: number[]): Promise<Record<number, number>> {
    if (!leadIds.length) return {};
    const rows = await db
      .select({ leadId: salesOpportunitiesLocal.leadId, count: sql<number>`count(*)::int` })
      .from(salesOpportunitiesLocal)
      .where(and(inArray(salesOpportunitiesLocal.leadId, leadIds), eq(salesOpportunitiesLocal.status, "open")))
      .groupBy(salesOpportunitiesLocal.leadId);
    return Object.fromEntries(rows.map((r) => [r.leadId, r.count]));
  }

  // ── Visits ──

  async listSalesVisits(filters: { repId?: number; leadId?: number; activeOnly?: boolean } = {}): Promise<SalesVisit[]> {
    const conditions: any[] = [];
    if (filters.repId) conditions.push(eq(salesVisits.repId, filters.repId));
    if (filters.leadId) conditions.push(eq(salesVisits.leadId, filters.leadId));
    if (filters.activeOnly) conditions.push(eq(salesVisits.status, "in_progress"));
    if (conditions.length) {
      return await db.select().from(salesVisits).where(and(...conditions)).orderBy(desc(salesVisits.createdAt));
    }
    return await db.select().from(salesVisits).orderBy(desc(salesVisits.createdAt));
  }

  async listRecentSalesVisits(limit = 5, offset = 0, filters: { repId?: number } = {}): Promise<{ data: RecentSalesVisit[]; total: number }> {
    const conditions: any[] = [];
    if (filters.repId) conditions.push(eq(salesVisits.repId, filters.repId));

    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(salesVisits).$dynamic();
    let visitsQuery = db
      .select({
        visit: salesVisits,
        rep: { id: salesReps.id, displayName: salesReps.displayName, team: salesReps.team },
        lead: { id: salesLeads.id, name: salesLeads.name, industry: salesLeads.industry },
        location: {
          id: salesLeadLocations.id,
          label: salesLeadLocations.label,
          addressLine1: salesLeadLocations.addressLine1,
          city: salesLeadLocations.city,
          state: salesLeadLocations.state,
        },
        note: {
          summary: salesVisitNotes.summary,
          outcome: salesVisitNotes.outcome,
          nextStep: salesVisitNotes.nextStep,
          sentiment: salesVisitNotes.sentiment,
        },
      })
      .from(salesVisits)
      .leftJoin(salesReps, eq(salesVisits.repId, salesReps.id))
      .leftJoin(salesLeads, eq(salesVisits.leadId, salesLeads.id))
      .leftJoin(salesLeadLocations, eq(salesVisits.locationId, salesLeadLocations.id))
      .leftJoin(salesVisitNotes, eq(salesVisits.id, salesVisitNotes.visitId))
      .orderBy(desc(sql`coalesce(${salesVisits.checkedOutAt}, ${salesVisits.checkedInAt}, ${salesVisits.createdAt})`), desc(salesVisits.id))
      .$dynamic();

    if (conditions.length) {
      const whereClause = and(...conditions);
      countQuery = countQuery.where(whereClause);
      visitsQuery = visitsQuery.where(whereClause);
    }

    const [totalRow] = await countQuery;
    const rows = await visitsQuery.limit(limit).offset(offset);

    const visitIds = rows.map((row) => String(row.visit.id));
    const syncRows = visitIds.length
      ? await db
        .select()
        .from(salesSyncEvents)
        .where(and(eq(salesSyncEvents.entityType, "sales_visit"), inArray(salesSyncEvents.entityId, visitIds)))
        .orderBy(desc(salesSyncEvents.createdAt), desc(salesSyncEvents.id))
      : [];
    const latestSyncByVisit = new Map<string, SalesSyncEvent>();
    for (const event of syncRows) {
      if (!latestSyncByVisit.has(event.entityId)) {
        latestSyncByVisit.set(event.entityId, event);
      }
    }

    return {
      data: rows.map((row) => {
        const syncEvent = latestSyncByVisit.get(String(row.visit.id));
        return {
          visit: row.visit,
          rep: row.rep?.id ? row.rep : null,
          lead: row.lead?.id ? row.lead : null,
          location: row.location?.id ? row.location : null,
          note: row.note?.summary || row.note?.outcome || row.note?.nextStep || row.note?.sentiment ? row.note : null,
          syncStatus: syncEvent?.status ?? null,
          syncLastError: syncEvent?.lastError ?? null,
        };
      }),
      total: totalRow?.count ?? 0,
    };
  }

  async getSalesVisit(id: number): Promise<SalesVisit | undefined> {
    const [visit] = await db.select().from(salesVisits).where(eq(salesVisits.id, id));
    return visit;
  }

  async getActiveSalesVisitForRep(repId: number): Promise<SalesVisit | undefined> {
    const [visit] = await db
      .select()
      .from(salesVisits)
      .where(and(eq(salesVisits.repId, repId), eq(salesVisits.status, "in_progress")))
      .orderBy(desc(salesVisits.checkedInAt))
      .limit(1);
    return visit;
  }

  async createSalesVisit(input: InsertSalesVisit): Promise<SalesVisit> {
    const [created] = await db.insert(salesVisits).values(input).returning();
    return created;
  }

  async updateSalesVisit(id: number, input: Partial<InsertSalesVisit>): Promise<SalesVisit | undefined> {
    const [updated] = await db
      .update(salesVisits)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(salesVisits.id, id))
      .returning();
    return updated;
  }

  async deleteSalesVisit(id: number): Promise<void> {
    await db.delete(salesVisitNotes).where(eq(salesVisitNotes.visitId, id));
    await db.delete(salesVisits).where(eq(salesVisits.id, id));
  }

  async getSalesVisitNote(visitId: number): Promise<SalesVisitNote | undefined> {
    const [note] = await db.select().from(salesVisitNotes).where(eq(salesVisitNotes.visitId, visitId));
    return note;
  }

  async upsertSalesVisitNote(input: InsertSalesVisitNote): Promise<SalesVisitNote> {
    const existing = await this.getSalesVisitNote(input.visitId);
    if (existing) {
      const [updated] = await db
        .update(salesVisitNotes)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(salesVisitNotes.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(salesVisitNotes).values(input).returning();
    return created;
  }

  // ── Opportunities + tasks ──

  async listSalesOpportunities(filters: { repId?: number; leadId?: number; status?: SalesOpportunityStatus } = {}): Promise<SalesOpportunity[]> {
    const conditions: any[] = [];
    if (filters.repId) conditions.push(eq(salesOpportunitiesLocal.repId, filters.repId));
    if (filters.leadId) conditions.push(eq(salesOpportunitiesLocal.leadId, filters.leadId));
    if (filters.status) conditions.push(eq(salesOpportunitiesLocal.status, filters.status));
    if (conditions.length) {
      return await db.select().from(salesOpportunitiesLocal).where(and(...conditions)).orderBy(desc(salesOpportunitiesLocal.updatedAt));
    }
    return await db.select().from(salesOpportunitiesLocal).orderBy(desc(salesOpportunitiesLocal.updatedAt));
  }

  async createSalesOpportunity(input: InsertSalesOpportunity): Promise<SalesOpportunity> {
    const [created] = await db.insert(salesOpportunitiesLocal).values(input).returning();
    return created;
  }

  async updateSalesOpportunity(id: number, input: Partial<InsertSalesOpportunity>): Promise<SalesOpportunity | undefined> {
    const [updated] = await db
      .update(salesOpportunitiesLocal)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(salesOpportunitiesLocal.id, id))
      .returning();
    return updated;
  }

  async listSalesTasks(filters: { repId?: number; status?: SalesTaskStatus } = {}): Promise<SalesTask[]> {
    const conditions: any[] = [];
    if (filters.repId) conditions.push(eq(salesTasks.repId, filters.repId));
    if (filters.status) conditions.push(eq(salesTasks.status, filters.status));
    if (conditions.length) {
      return await db.select().from(salesTasks).where(and(...conditions)).orderBy(asc(salesTasks.dueAt), desc(salesTasks.createdAt));
    }
    return await db.select().from(salesTasks).orderBy(asc(salesTasks.dueAt), desc(salesTasks.createdAt));
  }

  async createSalesTask(input: InsertSalesTask): Promise<SalesTask> {
    const [created] = await db.insert(salesTasks).values(input).returning();
    return created;
  }

  async updateSalesTask(id: number, input: Partial<InsertSalesTask>): Promise<SalesTask | undefined> {
    const [updated] = await db
      .update(salesTasks)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(salesTasks.id, id))
      .returning();
    return updated;
  }

  // ── GHL sync audit log ──

  async listSalesSyncEvents(limit = 50): Promise<SalesSyncEvent[]> {
    return await db.select().from(salesSyncEvents).orderBy(desc(salesSyncEvents.createdAt)).limit(limit);
  }

  async listSalesSyncEventsForRep(repId: number, limit = 20): Promise<SalesSyncEvent[]> {
    const [repVisits, repLeads] = await Promise.all([
      db.select({ id: salesVisits.id }).from(salesVisits).where(eq(salesVisits.repId, repId)),
      db.select({ id: salesLeads.id }).from(salesLeads).where(eq(salesLeads.ownerRepId, repId)),
    ]);
    const visitIds = repVisits.map((v) => String(v.id));
    const leadIds = repLeads.map((l) => String(l.id));
    if (visitIds.length === 0 && leadIds.length === 0) return [];
    const conditions = [];
    if (visitIds.length > 0) {
      conditions.push(and(eq(salesSyncEvents.entityType, "sales_visit"), inArray(salesSyncEvents.entityId, visitIds)));
    }
    if (leadIds.length > 0) {
      conditions.push(and(eq(salesSyncEvents.entityType, "sales_lead"), inArray(salesSyncEvents.entityId, leadIds)));
    }
    return await db.select().from(salesSyncEvents)
      .where(or(...conditions))
      .orderBy(desc(salesSyncEvents.createdAt))
      .limit(limit);
  }

  async createSalesSyncEvent(input: InsertSalesSyncEvent): Promise<SalesSyncEvent> {
    const [created] = await db.insert(salesSyncEvents).values(input).returning();
    return created;
  }

  async updateSalesSyncEvent(id: number, input: Partial<InsertSalesSyncEvent>): Promise<SalesSyncEvent | undefined> {
    const [updated] = await db
      .update(salesSyncEvents)
      .set(input)
      .where(eq(salesSyncEvents.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
