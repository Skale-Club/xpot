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
};

export type EnrichedSalesVisit = SalesVisit & {
  lead?: SalesLead;
  note?: SalesVisitNote;
};

export type EnrichedSalesOpportunity = SalesOpportunity & {
  lead?: SalesLead;
};

export type XpotTab = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type XpotMetricCard = {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
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
  user: { id: string; email: string; isAdmin: boolean };
  rep: { id: number; displayName: string; email?: string; phone?: string; team?: string; role: string; avatarUrl?: string | null };
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
