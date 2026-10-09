import type {
  SalesRep,
  SalesLead,
  SalesLeadLocation,
  SalesLeadContact,
  SalesVisit,
  SalesVisitNote,
  SalesOpportunity,
  SalesTask,
  SalesSyncEvent,
  SalesAppSettings,
} from "#shared/schema.js";

export type {
  SalesRep,
  SalesLead,
  SalesLeadLocation,
  SalesLeadContact,
  SalesVisit,
  SalesVisitNote,
  SalesOpportunity,
  SalesTask,
  SalesSyncEvent,
  SalesAppSettings,
};

export type FullSalesLead = SalesLead & {
  locations: SalesLeadLocation[];
  contacts: SalesLeadContact[];
  openOpportunities?: number;
  salesLifetimeCents?: number;
  unitsOnShelf?: number;
};

export type EnrichedSalesVisit = SalesVisit & {
  lead?: SalesLead;
  note?: SalesVisitNote;
  visitSales?: { transactions: number; pieces: number; totalCents: number };
};

export type EnrichedSalesOpportunity = SalesOpportunity & {
  lead?: SalesLead;
};

export type GooglePlaceResult = {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  primaryType?: string;
  placeId: string;
  lat?: number;
  lng?: number;
};

export type SalesLeadPayload = {
  name: string;
  phone?: string;
  email?: string;
  website?: string;
  industry?: string;
  source?: string;
  status?: string;
  notes?: string;
  googlePlaceId?: string;
  primaryLocation?: {
    label?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    lat?: number;
    lng?: number;
    geofenceRadiusMeters?: number;
    isPrimary?: boolean;
  };
};

export type XpotMeResponse = {
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null; isAdmin: boolean; profileImageUrl?: string | null };
  rep: { id: number; displayName: string; email?: string; phone?: string; team?: string; role: string; avatarUrl?: string | null; isActive?: boolean; modules?: string[]; costPolicy?: "zero" | "acquisition"; costPolicyConfiguredAt?: string | null };
  organizations?: Array<{ id: number; name: string; slug: string; isActive: boolean; membershipRole?: "admin" | "member" }>;
  organizationMemberships?: Array<{ organizationId: number; role: "admin" | "member"; isActive: boolean; blockedAt?: string | null }>;
  activeVisit: (SalesVisit & { lead?: SalesLead; note?: SalesVisitNote }) | null;
};

export type DashboardResponse = {
  metrics: {
    visitsToday: number;
    completedVisits: number;
    activeVisit: SalesVisit | null;
    openOpportunities: number;
    pipelineValue: number;
    pendingTasks: number;
    assignedLeads: number;
  };
  recentVisits: (SalesVisit & { lead?: SalesLead; note?: SalesVisitNote })[];
  openOpportunities: (SalesOpportunity & { lead?: SalesLead })[];
  pendingTasks: SalesTask[];
};

/** Browser geolocation state, shared by GeoProvider and everything that reads a fix. */
export type GeoState = { lat?: number; lng?: number; accuracy?: number; error?: string };
