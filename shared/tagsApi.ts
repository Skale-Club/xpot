// Response shapes of the Xpot Tags API (server/routes/tags/*), shared with the
// app. Dates travel as ISO strings.

import type { TagQueueCounts } from "./tagQueues.js";

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
  salesProductId: number | null;
  acquisitionCostCents: number | null;
  /** What is printed on the piece, resolved (own → batch → product); null when unknown. */
  face: string | null;
  /** The piece's own face override, before falling back to the batch. */
  ownFace: string | null;
  status: string;
  stockStatus: string;
  ownershipType: string;
  custodianRepId: number | null;
  internalUseNote: string | null;
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
  saleId: number | null;
  soldPriceCents: number | null;
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

/** One financial sale a piece was part of (sales_sale_tags + sales_sales). */
export interface TagPieceSale {
  saleId: number;
  /** "cancelled" once the sale was cancelled (the link ended). */
  status: "active" | "cancelled";
  soldAt: string;
  endedAt: string | null;
  /** This piece's share of the sale, after discount. */
  priceCents: number | null;
  currency: string;
  sellerRepId: number;
  sellerName: string | null;
  paymentStatus: string;
  cancelReason: string | null;
}

/** One stock movement of a piece (tag_stock_movements). Management only. */
export interface TagStockMovementItem {
  id: string;
  movementType: string;
  fromStockStatus: string | null;
  toStockStatus: string;
  fromOwnershipType: string | null;
  toOwnershipType: string;
  fromCustodianName: string | null;
  toCustodianName: string | null;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  actorEmail: string | null;
  createdAt: string;
}

/** GET /api/xpot/tags/:id/activity: the piece's sales, and its stock movements for the management side (else null). */
export interface TagPieceActivity {
  sales: TagPieceSale[];
  movements: TagStockMovementItem[] | null;
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
  topTags: Array<{
    id: string;
    publicCode: string;
    productType: string;
    face: string | null;
    batchCode: string | null;
    leadName: string | null;
    repName: string | null;
    qr: number;
    nfc: number;
  }>;
}

export interface TagOverview {
  counts: Record<"total" | "inventory" | "assigned" | "active" | "disabled" | "retired" | "damaged", number>;
  /** Unsold pieces still in house stock vs. out with resellers. */
  stock: { house: number; withResellers: number };
  /** The stock funnel, one shared stock number each (shared/tagMetrics.ts): not received → house → resellers → sold → live. */
  funnel: { notReceived: number; house: number; withResellers: number; sold: number; live: number };
  /** "Needs action" counts (shared/tagQueues.ts). */
  queues: TagQueueCounts;
  interactions: { today: number; last7: number; last30: number };
  split30: { qr: number; nfc: number };
  approxUnique30: number;
  recentEvents: Array<{
    id: number;
    tagId: string;
    publicCode: string;
    productType: string;
    face: string | null;
    batchCode: string | null;
    leadName: string | null;
    accessMethod: string;
    eventType: string;
    deviceType: string | null;
    occurredAt: string;
  }>;
  recentActivations: Array<{
    id: string;
    publicCode: string;
    productType: string;
    face: string | null;
    batchCode: string | null;
    leadName: string | null;
    repName: string | null;
    activatedAt: string;
  }>;
  recentChanges: Array<TagHistoryEntry & {
    tagId: string;
    publicCode: string;
    productType: string;
    face: string | null;
    batchCode: string | null;
  }>;
}

/** A batch as a picker shows it (`GET /api/xpot/admin/tag-batch-options`, managers too). */
export interface TagBatchOption {
  id: string;
  batchCode: string;
  name: string;
  productType: string;
  face: string | null;
  houseCount: number;
  handOutCount: number;
}

export interface TagBatchItem {
  id: string;
  batchCode: string;
  name: string;
  productType: string;
  salesProductId: number | null;
  /** What is printed on the run, resolved (batch → product); null when unknown. */
  face: string | null;
  /** The batch's own setting, before the product default. */
  ownFace: string | null;
  vendor: string | null;
  quantity: number;
  status: string;
  /** `issued` (Xpot generated the codes) or `scanned` (filled by scanning already-coded pieces). */
  codeSource: string;
  /** Derived production stage (shared/tags.ts `batchStage`). */
  stage: string;
  /** Latest production step in the batch's journey (`sliced`, `printed`, …), or null. */
  lastProductionAction: string | null;
  notes: string | null;
  createdAt: string;
  tagCount: number;
  /** Codes issued for pieces not received yet (not printed / not delivered). */
  pendingCount: number;
  /** Pieces physically received into stock at some point (tagCount − pendingCount). */
  receivedCount: number;
  /** Company stock (shared/tagMetrics.ts `house`): in stock, no rep, not retired, unsold. */
  houseCount: number;
  /** House stock that can go into a kit now (`handOut`: also not set up for a customer). */
  handOutCount: number;
  /** Unsold pieces in reps' hands (`withResellers`). */
  withResellersCount: number;
  /** Pieces with a recorded financial sale (`sold`). */
  soldCount: number;
  damagedCount: number;
  activeCount: number;
  nfcVerifiedCount: number;
}

export interface TagKitItem {
  id: string;
  /** Sequential number; shown as `kitCode`. */
  kitNumber: number;
  /** "K-0001" (shared/tagKits.ts kitCode). */
  kitCode: string;
  repId: number;
  repName: string | null;
  note: string | null;
  createdAt: string;
  /** Who owns the pieces handed out: `company` (consignment) or `rep` (a purchase); null for an empty kit. */
  ownershipType: string | null;
  /** What the kit handed out, for good (tag_kit_items): never shrinks. */
  handedOutCount: number;
  /** Of those, back in house stock. */
  returnedCount: number;
  /** Of those, moved to another reseller. */
  movedCount: number;
  /** Still in the kit and unsold: handed out − returned − moved − sold. */
  stillWithCount: number;
  /** Pieces in the kit right now (sold or not). */
  pieceCount: number;
  /** Pieces from this kit still unsold in the reseller's hands (`withResellers`, held by the kit's rep). */
  unsoldCount: number;
  /** Of those, the ones "Return unsold" can take back now (`returnable`: not set up for a customer). */
  returnableCount: number;
  /** Pieces from this kit with a recorded financial sale. */
  soldCount: number;
  acquisitionSource: string | null;
  unitCostCents: number | null;
}

/** One piece a kit handed out (GET /api/xpot/admin/tag-kits/:id/items): the packing list, with where it is now. */
export interface TagKitPiece {
  code: string;
  tagId: string | null;
  serialNumber: number | null;
  batchCode: string | null;
  productType: string | null;
  face: string | null;
  handedOutAt: string;
  /** `in_kit` (still with the kit's reseller, unsold), `sold`, `returned` or `moved`. */
  state: "in_kit" | "sold" | "returned" | "moved";
  leftAt: string | null;
}

/** Pieces sold to one customer (lead), for the Visits side. */
export interface LeadTagSummary {
  leadId: number;
  /** The company's name; null when it was saved blank. */
  name: string | null;
  pieces: number;
  live: number;
  scansLast30: number;
}

/** The field app's home numbers for the signed-in reseller. */
/** The Tags dashboard (GET /api/xpot/tags/dashboard): the person's pieces, or everyone's in admin mode. */
export interface TagDashboard {
  days: number;
  inStock: number;
  active: number;
  soldInPeriod: number;
  scans: { qr: number; nfc: number };
  /** Distinct visitors per day, summed (a person scanning twice in a day counts once). */
  visitors: number;
  /** Assigned or live pieces whose NFC chip holds nothing (or failed): QR only. */
  chipsMissing: number;
  daily: Array<{ day: string; qr: number; nfc: number }>;
  topPieces: Array<{
    id: string;
    publicCode: string;
    productType: string;
    face: string | null;
    batchCode: string | null;
    label: string | null;
    leadName: string | null;
    scans: number;
    qr: number;
    nfc: number;
  }>;
  topCustomers: Array<{ leadId: number; name: string; pieces: number; scans: number }>;
  devices: Array<{ os: string; scans: number }>;
  /** Most recently scanned pieces, one latest event per piece. */
  recentScans: Array<{
    id: number;
    tagId: string;
    publicCode: string;
    productType: string;
    face: string | null;
    batchCode: string | null;
    leadName: string | null;
    accessMethod: string;
    occurredAt: string;
  }>;
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
    face: string | null;
    batchCode: string | null;
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

/**
 * An app connected over OAuth (Claude, ChatGPT…): one per client and approving
 * user that still holds a live token. GET /api/xpot/admin/mcp-connections.
 */
export interface McpConnectionItem {
  clientId: string;
  /** Self-declared at registration, so not proof of who the client is. */
  clientName: string | null;
  /** Where the client receives its codes: the trustworthy part of its identity. */
  redirectHost: string | null;
  userId: string;
  /** Email, or phone for phone-only accounts. */
  userLabel: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
  /** What it was granted, e.g. ["xpot:journey", "xpot:tasks"]. */
  scopes: string[];
}

/** What a static MCP token may do: every tool family (server/mcp/routes.ts). */
export const MCP_TOKEN_SCOPES = ["xpot:journey", "xpot:prospecting", "xpot:tasks"] as const;
