// The customer panel (/my): the business that uses the plates reads how many it has and how they are doing.
// Pure rules and wire types shared by the server and the small app at /my. Read only, with a server-side off switch.
//
// Who is who: a customer is a phone, not a user. Its session never carries a userId, so no Xpot API (which all start
// from userId) ever accepts it, and it never becomes a rep or an access request.

export const CUSTOMER_PANEL_PATH = "/my";

/** Server-side switch: on, unless env CUSTOMER_PANEL_ENABLED turns it off (0, false, off or no). */
export function customerPanelEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return !/^(0|false|off|no)$/i.test((env.CUSTOMER_PANEL_ENABLED ?? "").trim());
}

/** A signed-in customer stays in for 30 days (the same length as the app's session), then types a new code. */
export const CUSTOMER_SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;
/** Between asking for a code and typing it. */
export const CUSTOMER_PENDING_MAX_MS = 15 * 60 * 1000;
/** Phones a seller may allow for one business. */
export const MAX_CUSTOMER_CONTACTS_PER_LEAD = 10;

export type CustomerAccess = "contact" | "business_phone";

/**
 * Why a phone may see a business's panel: a seller added it (`contact`), or it is the phone saved on the business
 * itself (`business_phone`, both already normalized). Null: it may not. `contact` wins when both are true.
 */
export function customerAccessFor(phone: string, contactPhones: readonly string[], businessPhone: string | null): CustomerAccess | null {
  if (contactPhones.includes(phone)) return "contact";
  if (businessPhone && businessPhone === phone) return "business_phone";
  return null;
}

/** What the session holds once a customer has signed in (req.session.customerLeadIds and friends). */
export interface CustomerSessionState {
  customerPhone?: string;
  customerLeadIds?: number[];
  customerAt?: number;
}

/** The leads a customer session covers, or null when it is empty or older than 30 days. */
export function customerSessionLeadIds(sess: CustomerSessionState | null | undefined, now = Date.now()): number[] | null {
  if (!sess?.customerPhone || !Array.isArray(sess.customerLeadIds) || !sess.customerLeadIds.length) return null;
  if (typeof sess.customerAt !== "number" || now - sess.customerAt > CUSTOMER_SESSION_MAX_MS) return null;
  return sess.customerLeadIds;
}

/** "Talk to your seller": the WhatsApp chat link for a phone in E.164; null when there is no usable number. */
export function whatsappLinkFor(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

// ─── Wire types (GET /api/my/*) ───────────────────────────────────────────────

export interface CustomerPiece {
  /** The code printed on the piece. */
  code: string;
  label: string | null;
  /** What is printed on it (shared/tagFace.ts); null when nothing says. */
  face: string | null;
  productType: string;
  status: string;
  /** Where the piece opens right now. */
  destinationUrl: string | null;
  businessName: string;
  scans7: number;
  scans30: number;
  lastScanAt: string | null;
}

export interface CustomerPiecesResponse {
  pieces: CustomerPiece[];
  totals: { pieces: number; live: number; scans7: number; scans30: number };
}

export interface CustomerPieceDetail extends CustomerPiece {
  qr30: number;
  nfc30: number;
  /** One entry per day of the last 30 (UTC), gaps as zero. */
  daily: Array<{ day: string; qr: number; nfc: number }>;
}

export interface CustomerSellerContact {
  businessName: string;
  name: string;
  /** E.164. */
  phone: string;
}

export interface CustomerContactResponse {
  sellers: CustomerSellerContact[];
  /** Skale Club's own WhatsApp (E.164) when a business has no seller to show. */
  support: string | null;
}

/** POST /api/my/code and /verify errors the screen words in the user's language. */
export type CustomerErrorCode =
  | "invalid_phone"
  | "invalid_input"
  | "rate_limited"
  | "code_expired"
  | "wrong_code"
  | "too_many_attempts"
  | "no_access"
  | "customer_signed_out";

// ─── The seller side (GET/POST/DELETE /api/xpot/leads/:id/customer-contacts) ──

export interface CustomerContactItem {
  phone: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface CustomerContactsResponse {
  contacts: CustomerContactItem[];
  /** The business's own phone, normalized, when it opens the panel by itself (it cannot be removed here). */
  businessPhone: string | null;
}
