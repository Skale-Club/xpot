import { createHash } from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { normalizePhone } from "#shared/phone.js";
import { normalizeTagCode } from "#shared/tags.js";
import { canUseLead } from "#shared/tagAccess.js";
import {
  CUSTOMER_PENDING_MAX_MS,
  MAX_CUSTOMER_CONTACTS_PER_LEAD,
  customerAccessFor,
  customerPanelEnabled,
  customerSessionLeadIds,
  type CustomerContactResponse,
  type CustomerContactsResponse,
  type CustomerErrorCode,
  type CustomerSessionState,
} from "#shared/customerPanel.js";
import { storage } from "../storage.js";
import { consumeCodes, checkCode, PhoneAuthError, sendCode } from "../auth/phoneAuth.js";
import { completePhoneCodeVerification } from "../auth/phoneCodeFlow.js";
import { defaultSmsSender, type SmsSender } from "../auth/sms.js";
import { loadTwilioConfigFromDb } from "../auth/smsConfigDb.js";
import { actorOf, requireTagUser } from "../tags/access.js";
import { normalizeIpKey, rateLimit } from "../tags/rateLimit.js";
import * as repo from "./repository.js";

// The customer panel's API (docs/PROFILES_EXECUTION_PLAN.md, F7). Read only, off when CUSTOMER_PANEL_ENABLED says so
// (every route then answers 404, as if it did not exist).
//
//   /api/my/*                                        the business that uses the plates, signed in by a phone
//   /api/xpot/leads/:id/customer-contacts            the seller who can use the lead allows or removes phones
//
// A customer is a phone, not a user. It signs in with the code printed on one of its pieces and a phone a seller
// allowed (or the business's own phone), through the same SMS code the team signs in with, but its session carries
// customerPhone / customerLeadIds and never userId. Every Xpot API starts from userId, so none of them accepts it,
// and nothing here creates a user, a rep or an access request.

const LANGS = ["en", "pt", "es"] as const;
const ROUTE_WINDOW_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Keys that belong to the customer panel in the session; nothing else is touched when it signs out. */
const CUSTOMER_KEYS = ["customerPhone", "customerLeadIds", "customerAt", "customerPending"] as const;

const codeSchema = z.object({
  code: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(4).max(40),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
  lang: z.enum(LANGS).optional(),
}).strict();

const verifySchema = z.object({
  phone: z.string().trim().min(4).max(40),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
  otp: z.string().trim().regex(/^\d{6}$/),
}).strict();

const contactSchema = z.object({
  phone: z.string().trim().min(4).max(40),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
}).strict();

class CustomerError extends Error {
  constructor(public code: CustomerErrorCode | "lead_not_found" | "business_phone" | "too_many_contacts", public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const hashKey = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

/** Throws the same 429 for a sign-in route's limit, whoever the request is for. */
function enforce(key: string, limit: number, windowMs: number) {
  if (rateLimit(key, { limit, windowMs })) {
    throw new CustomerError("rate_limited", 429, "Too many attempts. Try again later.", { retryAfter: Math.ceil(windowMs / 1000) });
  }
}

const enforceIp = (req: Request, bucket: "code" | "verify", limit: number) =>
  enforce(`customer:${bucket}:ip:${normalizeIpKey(req.ip)}`, limit, ROUTE_WINDOW_MS);

function fail(res: Response, err: unknown) {
  if (err instanceof CustomerError) return res.status(err.status).json({ code: err.code, message: err.message, ...err.extra });
  // The team's sign-in words its own failures (wrong code, expired code...); the panel reuses them as they are.
  if (err instanceof PhoneAuthError) return res.status(err.status).json({ code: err.code, message: err.message, ...err.extra });
  if (err instanceof z.ZodError) return res.status(400).json({ code: "invalid_input", message: "Invalid input" });
  console.error("[customer]", err);
  res.status(500).json({ message: "Something went wrong. Try again." });
}

const saveSession = (req: Request) => new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

function sessionOf(req: Request): CustomerSessionState & { customerPending?: { phone: string; leadId: number | null; at: number } } {
  return (req.session ?? {}) as never;
}

function clearCustomer(req: Request) {
  const sess = req.session as unknown as Record<string, unknown> | undefined;
  if (sess) for (const key of CUSTOMER_KEYS) delete sess[key];
}

/**
 * Signs the phone in. The session id changes first (a session id planted before sign-in must not become a signed-in
 * one); whatever else the browser had, a team session included, is carried over untouched.
 */
async function startCustomerSession(req: Request, phone: string, leadIds: number[]) {
  const previous = { ...(req.session as unknown as Record<string, unknown>) };
  delete previous.cookie;
  for (const key of CUSTOMER_KEYS) delete previous[key];
  await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  const sess = req.session as unknown as Record<string, unknown>;
  Object.assign(sess, previous);
  sess.customerPhone = phone;
  sess.customerLeadIds = leadIds;
  sess.customerAt = Date.now();
  await saveSession(req);
}

declare module "express-serve-static-core" {
  interface Request {
    /** The leads of the signed-in customer, after requireCustomer. */
    customerLeadIds?: number[];
  }
}

/** The customer's leads, re-read on every request: a seller removing a phone takes effect at once. */
async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const sess = sessionOf(req);
    const sessionLeads = customerSessionLeadIds(sess);
    const current = sessionLeads && sess.customerPhone ? await repo.leadIdsOfPhone(sess.customerPhone, sessionLeads) : [];
    if (!current.length) {
      if (sess.customerPhone) {
        clearCustomer(req);
        await saveSession(req).catch(() => undefined);
      }
      return res.status(401).json({ code: "customer_signed_out", message: "Sign in to see your plates." });
    }
    req.customerLeadIds = current;
    next();
  } catch (err) {
    fail(res, err);
  }
}

export interface CustomerRoutes {
  /** Resolves when every code being texted in the background has been sent (or has failed). For tests. */
  idle(): Promise<void>;
}

export function registerCustomerRoutes(
  app: Express,
  sms: SmsSender = defaultSmsSender({ loadDbConfig: loadTwilioConfigFromDb }),
): CustomerRoutes {
  const jobs = new Set<Promise<void>>();

  // Off: nothing under /api/my exists, except the question "is it on?" the app asks before showing anything.
  app.use("/api/my", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (req.path === "/enabled") return next();
    if (!customerPanelEnabled()) return res.status(404).json({ message: "Not found" });
    next();
  });

  app.get("/api/my/enabled", (_req, res) => {
    res.json({ enabled: customerPanelEnabled() });
  });

  // Asks for a code. It answers the same whether or not the piece and the phone match, so nobody can find out which
  // codes exist or which phones belong to a business; the SMS goes out only when they do, after the answer.
  app.post("/api/my/code", async (req, res) => {
    try {
      enforceIp(req, "code", 12);
      const input = codeSchema.parse(req.body);
      const phone = normalizePhone(input.phone, input.countryCode);
      if (!phone) throw new PhoneAuthError("invalid_phone", 400, "Enter a valid phone number.");
      enforce(`customer:code:phone:${hashKey(phone)}`, 6, HOUR_MS);

      // The same lookups run for a real piece and for a made-up one.
      const code = normalizeTagCode(input.code);
      const piece = await repo.pieceForSignIn(code ?? "");
      const leadId = piece?.leadId ?? null;
      const access = await repo.leadAccessData(leadId ?? -1);
      const matched = Boolean(code && piece && piece.status === "active" && leadId !== null && access.exists
        && customerAccessFor(phone, access.contactPhones, access.businessPhone));

      const sess = req.session as unknown as Record<string, unknown>;
      sess.customerPending = { phone, leadId: matched ? leadId : null, at: Date.now() };
      await saveSession(req);
      if (matched) {
        const job: Promise<void> = sendCode(phone, input.lang ?? "en", req.ip ?? null, sms)
          .then(() => undefined)
          // "Wait 30 seconds", "too many codes" and a refused SMS are only for the log: saying them would tell a
          // stranger the phone is a customer's.
          .catch((err) => console.error("[customer] code not sent:", err instanceof PhoneAuthError ? err.code : err))
          .finally(() => { jobs.delete(job); });
        jobs.add(job);
      }
      res.json({ ok: true, phone });
    } catch (err) {
      fail(res, err);
    }
  });

  // Checks the code and opens the session for every business that lists the phone.
  app.post("/api/my/verify", async (req, res) => {
    try {
      enforceIp(req, "verify", 30);
      const input = verifySchema.parse(req.body);
      const phone = normalizePhone(input.phone, input.countryCode);
      if (!phone) throw new PhoneAuthError("invalid_phone", 400, "Enter a valid phone number.");
      enforce(`customer:verify:phone:${hashKey(phone)}`, 20, ROUTE_WINDOW_MS);
      const result = await completePhoneCodeVerification({
        validate: () => checkCode(phone, input.otp),
        complete: async () => {
          // The business the typed piece code led to, when the phone is that business's own phone.
          const pending = sessionOf(req).customerPending;
          let ownLeadId: number | null = null;
          if (pending && pending.phone === phone && pending.leadId !== null && Date.now() - pending.at <= CUSTOMER_PENDING_MAX_MS) {
            const access = await repo.leadAccessData(pending.leadId);
            if (access.exists && access.businessPhone === phone) ownLeadId = pending.leadId;
          }
          await repo.recordSignIn(phone, ownLeadId);
          const leadIds = await repo.leadIdsOfPhone(phone);
          if (!leadIds.length) throw new CustomerError("no_access", 403, "This number is not listed for any business.");
          await startCustomerSession(req, phone, leadIds);
          return { ok: true as const };
        },
        consume: () => consumeCodes(phone),
      });
      res.json(result);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/my/pieces", requireCustomer, async (req, res) => {
    try {
      res.json(await repo.listCustomerPieces(req.customerLeadIds ?? []));
    } catch (err) {
      fail(res, err);
    }
  });

  // A piece of another business answers exactly like one that does not exist.
  app.get("/api/my/pieces/:code", requireCustomer, async (req, res) => {
    try {
      const code = normalizeTagCode(req.params.code);
      const piece = code ? await repo.getCustomerPiece(req.customerLeadIds ?? [], code) : null;
      if (!piece) return res.status(404).json({ message: "Not found" });
      res.json(piece);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/my/contact", requireCustomer, async (req, res) => {
    try {
      const body: CustomerContactResponse = {
        sellers: await repo.sellersOf(req.customerLeadIds ?? []),
        support: normalizePhone(process.env.XPOT_SUPPORT_WHATSAPP ?? "") ?? null,
      };
      res.json(body);
    } catch (err) {
      fail(res, err);
    }
  });

  // Ends the panel's session only: a team session in the same browser stays.
  app.post("/api/my/sign-out", async (req, res) => {
    try {
      clearCustomer(req);
      await saveSession(req);
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  registerSellerRoutes(app);

  return { idle: async () => { await Promise.all(Array.from(jobs)); } };
}

// ─── The seller allows or removes phones ──────────────────────────────────────

/** 404 for the whole feature while it is off, before anyone is asked who they are. */
function panelOn(_req: Request, res: Response, next: NextFunction) {
  if (!customerPanelEnabled()) return res.status(404).json({ message: "Not found" });
  next();
}

async function contactsPayload(lead: { id: number; phone: string | null }): Promise<CustomerContactsResponse> {
  const contacts = await repo.listContacts(lead.id);
  return {
    contacts: contacts.map((c) => ({ phone: c.phone, verifiedAt: c.verifiedAt ? c.verifiedAt.toISOString() : null, createdAt: c.createdAt.toISOString() })),
    businessPhone: normalizePhone(lead.phone),
  };
}

/** The lead, when this rep may use it (their own, their organization's if they run it, or any for a manager); else 404. */
async function usableLead(req: Request, res: Response) {
  const id = Number(req.params.id);
  const lead = Number.isInteger(id) && id > 0 ? await storage.getSalesLead(id) : undefined;
  // Not found and not yours look the same.
  if (!lead || !canUseLead(actorOf(req), lead)) {
    res.status(404).json({ code: "lead_not_found", message: "Customer not found" });
    return null;
  }
  return lead;
}

function registerSellerRoutes(app: Express) {
  const base = "/api/xpot/leads/:id/customer-contacts";

  app.get(base, panelOn, requireTagUser, async (req, res) => {
    try {
      const lead = await usableLead(req, res);
      if (lead) res.json(await contactsPayload(lead));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post(base, panelOn, requireTagUser, async (req, res) => {
    try {
      const input = contactSchema.parse(req.body);
      const lead = await usableLead(req, res);
      if (!lead) return;
      const phone = normalizePhone(input.phone, input.countryCode);
      if (!phone) throw new PhoneAuthError("invalid_phone", 400, "Enter a valid phone number.");
      const existing = await repo.listContacts(lead.id);
      if (!existing.some((c) => c.phone === phone) && existing.length >= MAX_CUSTOMER_CONTACTS_PER_LEAD) {
        throw new CustomerError("too_many_contacts", 409, `A business can have up to ${MAX_CUSTOMER_CONTACTS_PER_LEAD} phones.`);
      }
      await repo.addContact(lead.id, phone, actorOf(req).userId);
      res.status(201).json(await contactsPayload(lead));
    } catch (err) {
      fail(res, err);
    }
  });

  // The phone travels in the body, not the address.
  app.delete(base, panelOn, requireTagUser, async (req, res) => {
    try {
      const input = contactSchema.parse(req.body);
      const lead = await usableLead(req, res);
      if (!lead) return;
      const phone = normalizePhone(input.phone, input.countryCode);
      if (!phone) throw new PhoneAuthError("invalid_phone", 400, "Enter a valid phone number.");
      // The business's own phone opens its panel by itself: take it off the company instead.
      if (normalizePhone(lead.phone) === phone) {
        throw new CustomerError("business_phone", 409, "This is the business's own phone. Change it on the company to remove access.");
      }
      await repo.removeContact(lead.id, phone);
      res.json(await contactsPayload(lead));
    } catch (err) {
      fail(res, err);
    }
  });
}
