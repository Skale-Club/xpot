// Response shapes of the Xpot Tags API (server/routes/tags/*), shared with the
// app. Dates travel as ISO strings.

export interface TagMetrics {
  interactions: number;
  qr: number;
  nfc: number;
  approxUnique: number;
  lastInteractionAt: string | null;
}

export interface TagListItem {
  id: string;
  publicCode: string;
  serialNumber: number | null;
  productType: string;
  status: string;
  nfcStatus: string;
  label: string | null;
  destinationType: string | null;
  destinationUrl: string | null;
  /** The business it was sold to (an Xpot lead). */
  leadId: number | null;
  leadName: string | null;
  /** The reseller holding / credited with the piece. */
  repId: number | null;
  repName: string | null;
  kitId: string | null;
  batchId: string | null;
  batchCode: string | null;
  qrInteractions: number;
  nfcInteractions: number;
  lastInteractionAt: string | null;
  activatedAt: string | null;
  soldAt: string | null;
  createdAt: string;
}

export interface TagHistoryEntry {
  id: string;
  previousUrl: string | null;
  newUrl: string | null;
  previousDestinationType: string | null;
  newDestinationType: string | null;
  changedByUserId: string | null;
  changedByEmail: string | null;
  reason: string | null;
  createdAt: string;
}

export interface TagDetail extends TagListItem {
  utmEnabled: boolean;
  utmCampaign: string | null;
  metadata: Record<string, unknown> | null;
  assignedAt: string | null;
  disabledAt: string | null;
  updatedAt: string;
  qrUrl: string;
  nfcUrl: string;
  history: TagHistoryEntry[];
}

export interface TagDailyPoint {
  day: string; // YYYY-MM-DD (UTC)
  qr: number;
  nfc: number;
  approxUnique: number;
}

export interface TagAnalytics {
  from: string;
  to: string;
  totals: TagMetrics & { botHits: number; inactiveScans: number };
  daily: TagDailyPoint[];
  devices: Array<{ deviceType: string; count: number }>;
  topTags: Array<{ id: string; publicCode: string; leadName: string | null; repName: string | null; qr: number; nfc: number }>;
}

export interface TagOverview {
  counts: Record<"total" | "inventory" | "assigned" | "active" | "disabled" | "retired", number>;
  /** Unsold pieces still in house stock vs. out with resellers. */
  stock: { house: number; withResellers: number };
  interactions: { today: number; last7: number; last30: number };
  split30: { qr: number; nfc: number };
  approxUnique30: number;
  recentEvents: Array<{
    id: number;
    tagId: string;
    publicCode: string;
    leadName: string | null;
    accessMethod: string;
    eventType: string;
    deviceType: string | null;
    occurredAt: string;
  }>;
  recentActivations: Array<{ id: string; publicCode: string; leadName: string | null; repName: string | null; activatedAt: string }>;
  recentChanges: Array<TagHistoryEntry & { tagId: string; publicCode: string }>;
}

export interface TagBatchItem {
  id: string;
  batchCode: string;
  name: string;
  productType: string;
  vendor: string | null;
  quantity: number;
  status: string;
  notes: string | null;
  createdAt: string;
  tagCount: number;
  /** Unsold pieces still in house stock (no reseller). */
  houseCount: number;
  /** Pieces handed to resellers (sold or not). */
  withResellersCount: number;
  activeCount: number;
  nfcVerifiedCount: number;
}

export interface TagKitItem {
  id: string;
  repId: number;
  repName: string | null;
  note: string | null;
  createdAt: string;
  pieceCount: number;
  /** Pieces from this kit still unsold in the reseller's hands. */
  unsoldCount: number;
}

/** Pieces sold to one customer (lead), for the Visits side. */
export interface LeadTagSummary {
  leadId: number;
  pieces: number;
  live: number;
  scansLast30: number;
}

/** The field app's home numbers for the signed-in reseller. */
export interface TagRepSummary {
  /** Pieces in hand, not sold yet. */
  inStock: number;
  /** Live pieces they sold. */
  active: number;
  soldLast30: number;
  scansLast30: { qr: number; nfc: number };
}

/** One reseller's numbers in the admin report (or, with repId null, pieces with no reseller). */
export interface TagRepReportRow {
  repId: number | null;
  name: string | null;
  email: string | null;
  role: string | null;
  isActive: boolean;
  /** Pieces whose sale counted inside the window. */
  soldInRange: number;
  /** Pieces this person put live inside the window. */
  activationsInRange: number;
  /** Unsold pieces in their kit right now. */
  inStock: number;
  activeTags: number;
  totalSold: number;
  customers: number;
  /** QR scans / NFC taps inside the window on pieces this reseller sold. */
  qr: number;
  nfc: number;
  approxUnique: number;
  lastSaleAt: string | null;
}

export interface TagTeamReport {
  from: string;
  to: string;
  reps: TagRepReportRow[];
  unassigned: TagRepReportRow;
  topTags: Array<{
    id: string;
    publicCode: string;
    label: string | null;
    productType: string;
    leadName: string | null;
    repName: string | null;
    qr: number;
    nfc: number;
  }>;
}

export interface DirectWriteItem {
  id: string;
  url: string;
  label: string | null;
  leadId: number | null;
  leadName: string | null;
  method: string;
  verified: boolean;
  createdAt: string;
}

export interface ReviewLinkPlace {
  placeId?: string;
  name?: string;
  address?: string;
  reviewUrl: string;
}

// ─── NFC provisioning (desktop provisioner) ───────────────────────────────────

export interface ProvisionerDeviceItem {
  id: string;
  deviceName: string;
  platform: string | null;
  appVersion: string | null;
  status: string;
  tokenPrefix: string | null;
  pairingExpiresAt: string | null;
  lastSeenAt: string | null;
  pairedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface ProvisioningJobItem {
  id: string;
  status: string;
  expectedUrl: string;
  readbackUrl: string | null;
  tagType: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  deviceName: string | null;
  createdAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  events: Array<{ id: number; type: string; detail: Record<string, unknown> | null; createdAt: string }>;
}

export interface TagProvisioningState {
  status: string;
  programmedAt: string | null;
  verifiedAt: string | null;
  lockedAt: string | null;
  deviceName: string | null;
  /** First real NFC tap / QR scan after the chip was verified (final QA). */
  tapTestAt: string | null;
  qrTestAt: string | null;
  jobs: ProvisioningJobItem[];
}

// ─── Journey (server/tags/journeyRoutes.ts, admin only) ──────────────────────

export interface TagJourneyEntryItem {
  id: string;
  kind: string;
  action: string | null;
  title: string;
  content: string | null;
  batchId: string | null;
  batchCode: string | null;
  tagId: string | null;
  publicCode: string | null;
  serialNumber: number | null;
  kitId: string | null;
  repId: number | null;
  repName: string | null;
  leadId: number | null;
  leadName: string | null;
  planId: string | null;
  planTitle: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  source: string;
  actor: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRepId: number | null;
  /** sales_reps.display_name of actorRepId. */
  actorName: string | null;
  status: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface TagPlanItem {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  batchId: string | null;
  batchCode: string | null;
  tagId: string | null;
  publicCode: string | null;
  kitId: string | null;
  leadId: number | null;
  leadName: string | null;
  status: string;
  outcome: string | null;
  dueDate: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/** One scope's story: its timeline (newest first) and its plans. */
export interface TagJourney {
  entries: TagJourneyEntryItem[];
  plans: TagPlanItem[];
}

// ─── MCP access tokens (server/mcp) ──────────────────────────────────────────

/** A token an AI session uses on /mcp. Only its hash is stored; the secret is shown once. */
export interface McpTokenItem {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** POST /api/xpot/admin/mcp-tokens: the new token and its secret (never returned again). */
export interface McpTokenCreated {
  token: McpTokenItem;
  secret: string;
}
