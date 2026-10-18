import { createHash, randomInt, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { authAccessRequests, authPhoneCodes, salesReps, users, type User } from "#shared/schema.js";
import { normalizePhone } from "#shared/phone.js";
import { countryIsoFromHeaders } from "#shared/phoneCountry.js";
import { storage } from "../storage.js";
import { normalizeIpKey, rateLimit } from "../tags/rateLimit.js";
import { devCodeForResponse } from "./devPhoneCode.js";
import { completePhoneCodeVerification } from "./phoneCodeFlow.js";
import { defaultSmsSender, SmsError, type SmsSender } from "./sms.js";
import { loadTwilioConfigFromDb } from "./smsConfigDb.js";
import { formatSignupLeadTelegram, sendSignupTelegram } from "./telegram.js";

// Sign-in by phone: a 6-digit code goes out by SMS, the person types it back.
// No email, no password. What happens next depends on the person:
//   active rep          → signed in
//   unknown number      → completes a saved application, then waits for review
//   pending (not yet approved by Xpot) → told to wait / get in touch
//   blocked             → told their access is off
// Only active reps ever get a signed-in session.

export const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_CODES_PER_PHONE_PER_HOUR = 5;
const MAX_CODES_PER_IP_PER_HOUR = 20;
const VERIFIED_PHONE_TTL_MS = 30 * 60 * 1000;
const ROUTE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const LANGS = ["en", "pt", "es"] as const;
type Lang = (typeof LANGS)[number];

const SMS_TEXT: Record<Lang, (code: string) => string> = {
  en: (code) => `Xpot: your sign-in code is ${code}. It expires in 10 minutes. Don't share it.`,
  pt: (code) => `Xpot: seu código de acesso é ${code}. Vale por 10 minutos. Não compartilhe.`,
  es: (code) => `Xpot: tu código de acceso es ${code}. Vence en 10 minutos. No lo compartas.`,
};

export type PhoneAuthStatus = "active" | "pending" | "blocked" | "new";

/** Error codes the client turns into words in the user's language. */
export type PhoneAuthErrorCode =
  | "invalid_phone"
  | "wait"
  | "too_many_codes"
  | "sms_failed"
  | "code_expired"
  | "wrong_code"
  | "too_many_attempts"
  | "rate_limited"
  | "not_verified";

class PhoneAuthError extends Error {
  constructor(
    public code: PhoneAuthErrorCode,
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function hashCode(phone: string, code: string): string {
  const secret = process.env.SESSION_SECRET || "xpot-dev-secret";
  return createHash("sha256").update(`${phone}:${code}:${secret}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const startSchema = z.object({
  phone: z.string().trim().min(4).max(40),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
  lang: z.enum(LANGS).optional(),
}).strict();

const verifySchema = z.object({
  phone: z.string().trim().min(4).max(40),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
  code: z.string().trim().regex(/^\d{6}$/),
}).strict();

const applicationFields = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  workCity: z.string().trim().min(2).max(120),
  workRegion: z.string().trim().min(2).max(120),
  occupation: z.string().trim().min(2).max(160),
  availability: z.enum(["weekdays", "evenings", "weekends", "flexible"]),
  hasVehicle: z.boolean(),
  languages: z.array(z.enum(["en", "pt", "es", "other"])).min(1).max(4),
  otherLanguages: z.string().trim().max(160).optional().default(""),
  salesExperience: z.enum(["none", "some", "experienced"]),
  fieldSalesReadiness: z.enum(["ready", "with_support", "not_ready"]),
  kitInvestmentAcknowledged: z.literal(true),
  activeSellerAcknowledged: z.literal(true),
  message: z.string().trim().max(1000).optional().default(""),
});

const registerSchema = applicationFields.extend({
  lang: z.enum(LANGS).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.languages.includes("other") && input.otherLanguages.length < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["otherLanguages"], message: "List the other languages." });
  }
});

const draftSchema = applicationFields.partial().extend({
  displayName: z.string().trim().max(100).optional(),
  step: z.number().int().min(0).max(20),
}).strict();

function enforceRouteLimit(req: Request, bucket: "start" | "verify" | "draft" | "register", limit: number, retryAfter: number) {
  const key = `phone-auth:${bucket}:ip:${normalizeIpKey(req.ip)}`;
  if (rateLimit(key, { limit, windowMs: ROUTE_LIMIT_WINDOW_MS })) {
    throw new PhoneAuthError("rate_limited", 429, "Too many sign-in attempts. Try again later.", { retryAfter });
  }
}

function enforcePhoneVerifyLimit(phone: string) {
  const key = `phone-auth:verify:phone:${createHash("sha256").update(phone).digest("hex").slice(0, 24)}`;
  if (rateLimit(key, { limit: 20, windowMs: ROUTE_LIMIT_WINDOW_MS })) {
    throw new PhoneAuthError("rate_limited", 429, "Too many sign-in attempts. Try again later.", { retryAfter: 900 });
  }
}

function parsePhone(input: string, countryCode?: string): string {
  const phone = normalizePhone(input, countryCode);
  if (!phone) throw new PhoneAuthError("invalid_phone", 400, "Enter a valid phone number.");
  return phone;
}

/** Sends a new code, within the per-number and per-IP limits. */
export async function sendCode(phone: string, lang: Lang, ip: string | null, sms: SmsSender, now = new Date()) {
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [recent] = await db
    .select({ createdAt: authPhoneCodes.createdAt })
    .from(authPhoneCodes)
    .where(eq(authPhoneCodes.phone, phone))
    .orderBy(desc(authPhoneCodes.createdAt))
    .limit(1);
  if (recent && now.getTime() - recent.createdAt.getTime() < RESEND_AFTER_MS) {
    const retryAfter = Math.ceil((RESEND_AFTER_MS - (now.getTime() - recent.createdAt.getTime())) / 1000);
    throw new PhoneAuthError("wait", 429, `Wait ${retryAfter}s before asking for another code.`, { retryAfter });
  }
  const [{ perPhone }] = await db
    .select({ perPhone: sql<number>`count(*)::int` })
    .from(authPhoneCodes)
    .where(and(eq(authPhoneCodes.phone, phone), gt(authPhoneCodes.createdAt, hourAgo)));
  if (perPhone >= MAX_CODES_PER_PHONE_PER_HOUR) throw new PhoneAuthError("too_many_codes", 429, "Too many codes for this number. Try again in an hour.");
  if (ip) {
    const [{ perIp }] = await db
      .select({ perIp: sql<number>`count(*)::int` })
      .from(authPhoneCodes)
      .where(and(eq(authPhoneCodes.ip, ip), gt(authPhoneCodes.createdAt, hourAgo)));
    if (perIp >= MAX_CODES_PER_IP_PER_HOUR) throw new PhoneAuthError("too_many_codes", 429, "Too many codes from this network. Try again later.");
  }

  // Housekeeping: codes older than a day no longer count for anything.
  await db.execute(sql`DELETE FROM auth_phone_codes WHERE created_at < ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}`);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(authPhoneCodes).values({
    phone,
    codeHash: hashCode(phone, code),
    ip,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    createdAt: now,
  });
  try {
    await sms.send(phone, SMS_TEXT[lang](code));
  } catch (err) {
    console.error("[phone-auth] SMS failed", err instanceof SmsError ? err.message : err);
    throw new PhoneAuthError("sms_failed", 502, "We couldn't send the SMS. Check the number and try again.");
  }
  // Old codes for this number stop working once a new one is out (the rows
  // stay until then: they count toward the hourly limit).
  await db.execute(sql`UPDATE auth_phone_codes SET expires_at = ${now} WHERE phone = ${phone} AND created_at < ${now} AND expires_at > ${now}`);
  return code;
}

/** Checks the latest code for the number without consuming it. */
export async function checkCode(phone: string, code: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(authPhoneCodes)
    .where(and(eq(authPhoneCodes.phone, phone), gt(authPhoneCodes.expiresAt, now)))
    .orderBy(desc(authPhoneCodes.createdAt))
    .limit(1);
  if (!row) throw new PhoneAuthError("code_expired", 400, "This code expired. Ask for a new one.");
  if (row.attempts >= MAX_ATTEMPTS) throw new PhoneAuthError("too_many_attempts", 429, "Too many wrong tries. Ask for a new code.");
  if (!sameHash(row.codeHash, hashCode(phone, code))) {
    await db.update(authPhoneCodes).set({ attempts: row.attempts + 1 }).where(eq(authPhoneCodes.id, row.id));
    throw new PhoneAuthError("wrong_code", 400, "Wrong code. Check the SMS and try again.", { attemptsLeft: MAX_ATTEMPTS - row.attempts - 1 });
  }
}

async function consumeCodes(phone: string) {
  await db.delete(authPhoneCodes).where(eq(authPhoneCodes.phone, phone));
}

function splitName(name: string): { firstName: string; lastName: string | null } {
  const [first, ...rest] = name.trim().split(/\s+/);
  return { firstName: first, lastName: rest.length ? rest.join(" ") : null };
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return user ?? null;
}

/** Where a known user stands. Inactive access without an application is incomplete. */
export async function accessOf(user: User): Promise<PhoneAuthStatus> {
  let rep = await storage.getSalesRepByUserId(user.id);
  const [application] = await db
    .select({ id: authAccessRequests.id, status: authAccessRequests.status })
    .from(authAccessRequests)
    .where(eq(authAccessRequests.userId, user.id))
    .limit(1);
  if (!rep && application?.status === "draft") return "new";
  if (!rep) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.phone || "Xpot Rep";
    rep = await storage.upsertSalesRep({
      userId: user.id,
      displayName: name,
      email: user.email,
      phone: user.phone,
      role: user.isAdmin ? "admin" : "rep",
      isActive: Boolean(user.isAdmin),
    });
  }
  if (rep.blockedAt) return "blocked";
  if (rep.isActive) return "active";
  return application?.status && application.status !== "draft" ? "pending" : "new";
}

async function startSession(req: Request, user: User) {
  const sess = req.session as any;
  sess.userId = user.id;
  sess.email = user.email;
  sess.phone = user.phone;
  sess.isAdmin = Boolean(user.isAdmin);
  sess.firstName = user.firstName;
  sess.lastName = user.lastName;
  delete sess.verifiedPhone;
  // Saved before answering: the client calls /api/xpot/me right after.
  await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

async function rememberVerifiedPhone(req: Request, phone: string) {
  const sess = req.session as any;
  for (const key of ["userId", "email", "phone", "isAdmin", "firstName", "lastName"]) delete sess[key];
  sess.verifiedPhone = { phone, at: Date.now() };
  await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

function verifiedPhone(req: Request): string {
  const verified = (req.session as any)?.verifiedPhone as { phone: string; at: number } | undefined;
  if (!verified || Date.now() - verified.at > VERIFIED_PHONE_TTL_MS) {
    throw new PhoneAuthError("not_verified", 401, "Confirm your phone number first.");
  }
  return verified.phone;
}

async function ensureDraftUser(phone: string, displayName?: string) {
  const existing = await findUserByPhone(phone);
  if (existing) return existing;
  const { firstName, lastName } = splitName(displayName?.trim() || "Xpot applicant");
  return (await db.insert(users).values({ phone, firstName, lastName, isAdmin: false }).returning())[0];
}

function fail(res: Response, err: unknown) {
  if (err instanceof PhoneAuthError) return res.status(err.status).json({ code: err.code, message: err.message, ...err.extra });
  if (err instanceof z.ZodError) return res.status(400).json({ code: "invalid_phone", message: "Invalid input" });
  console.error("[phone-auth]", err);
  res.status(500).json({ message: "Sign-in failed. Try again." });
}

export function registerPhoneAuthRoutes(app: Express, sms: SmsSender = defaultSmsSender({ loadDbConfig: loadTwilioConfigFromDb })) {
  // What the sign-in screen needs to know.
  app.get("/api/auth/phone/config", async (req, res) => {
    const smsLive = sms.resolveLive ? await sms.resolveLive().catch(() => sms.live) : sms.live;
    res.json({
      smsLive,
      supportWhatsapp: normalizePhone(process.env.XPOT_SUPPORT_WHATSAPP ?? "") ?? null,
      countryIso: countryIsoFromHeaders(req.headers),
    });
  });

  app.post("/api/auth/phone/start", async (req, res) => {
    try {
      enforceRouteLimit(req, "start", 12, 900);
      const input = startSchema.parse(req.body);
      const phone = parsePhone(input.phone, input.countryCode);
      const code = await sendCode(phone, input.lang ?? "en", req.ip ?? null, sms);
      const smsLive = sms.resolveLive ? await sms.resolveLive().catch(() => sms.live) : sms.live;
      const devCode = devCodeForResponse({ code, nodeEnv: process.env.NODE_ENV, smsLive });
      res.json({ ok: true, phone, ...(devCode ? { devCode } : {}) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/auth/phone/verify", async (req, res) => {
    try {
      enforceRouteLimit(req, "verify", 30, 900);
      const input = verifySchema.parse(req.body);
      const phone = parsePhone(input.phone, input.countryCode);
      enforcePhoneVerifyLimit(phone);
      const result = await completePhoneCodeVerification({
        validate: () => checkCode(phone, input.code),
        complete: async () => {
          const user = await findUserByPhone(phone);
          if (!user) {
            await rememberVerifiedPhone(req, phone);
            return { status: "new" satisfies PhoneAuthStatus };
          }
          const status = await accessOf(user);
          if (status === "active") await startSession(req, user);
          if (status === "new") await rememberVerifiedPhone(req, phone);
          return { status };
        },
        consume: () => consumeCodes(phone),
      });
      res.json(result);
    } catch (err) {
      fail(res, err);
    }
  });

  // Every Next click saves the current answer. A later login with the same
  // verified phone resumes this draft; no access request is pending yet.
  app.get("/api/auth/phone/application-draft", async (req, res) => {
    try {
      const phone = verifiedPhone(req);
      const user = await findUserByPhone(phone);
      if (!user) return res.json({ draft: null });
      const [draft] = await db.select().from(authAccessRequests)
        .where(and(eq(authAccessRequests.userId, user.id), eq(authAccessRequests.status, "draft")))
        .limit(1);
      res.json({
        draft: draft ? {
          ...draft,
          displayName: [user.firstName, user.lastName].filter(Boolean).join(" ").replace(/^Xpot applicant$/, ""),
        } : null,
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/auth/phone/application-draft", async (req, res) => {
    try {
      enforceRouteLimit(req, "draft", 60, 900);
      const input = draftSchema.parse(req.body);
      const phone = verifiedPhone(req);
      const user = await ensureDraftUser(phone, input.displayName);
      const { step, displayName, ...fields } = input;
      if (displayName?.trim().length && displayName.trim().length >= 2) {
        const { firstName, lastName } = splitName(displayName);
        await db.update(users).set({ firstName, lastName, updatedAt: new Date() }).where(eq(users.id, user.id));
      }
      await db.insert(authAccessRequests).values({
        userId: user.id,
        ...fields,
        status: "draft",
        draftStep: step,
        lastActivityAt: new Date(),
      }).onConflictDoUpdate({
        target: authAccessRequests.userId,
        set: {
          ...fields,
          status: "draft",
          draftStep: step,
          lastActivityAt: new Date(),
        },
      });
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  // A verified number submits the short application required before review.
  app.post("/api/auth/phone/register", async (req, res) => {
    try {
      enforceRouteLimit(req, "register", 5, 900);
      const input = registerSchema.parse(req.body);
      const phone = verifiedPhone(req);
      const existing = await findUserByPhone(phone);
      const { firstName, lastName } = splitName(input.displayName);
      if (existing) {
        const status = await accessOf(existing);
        if (status === "active") {
          await startSession(req, existing);
          return res.json({ status });
        }
        if (status === "pending" || status === "blocked") return res.json({ status });
      }

      await db.transaction(async (tx) => {
        const account = existing
          ? (await tx.update(users).set({ firstName, lastName, updatedAt: new Date() }).where(eq(users.id, existing.id)).returning())[0]
          : (await tx.insert(users).values({ phone, firstName, lastName, isAdmin: false }).returning())[0];

        const [rep] = await tx.select().from(salesReps).where(eq(salesReps.userId, account.id)).limit(1);
        if (rep) {
          await tx.update(salesReps).set({
            displayName: input.displayName,
            email: input.email,
            phone,
            updatedAt: new Date(),
          }).where(eq(salesReps.id, rep.id));
        } else {
          await tx.insert(salesReps).values({
            userId: account.id,
            displayName: input.displayName,
            email: input.email,
            phone,
            role: "rep",
            isActive: false,
          });
        }

        await tx.insert(authAccessRequests).values({
          userId: account.id,
          email: input.email,
          workCity: input.workCity,
          workRegion: input.workRegion,
          occupation: input.occupation,
          availability: input.availability,
          hasVehicle: input.hasVehicle,
          languages: input.languages,
          otherLanguages: input.languages.includes("other") ? input.otherLanguages : null,
          salesExperience: input.salesExperience,
          fieldSalesReadiness: input.fieldSalesReadiness,
          kitInvestmentAcknowledged: input.kitInvestmentAcknowledged,
          activeSellerAcknowledged: input.activeSellerAcknowledged,
          message: input.message || null,
          status: "pending",
          draftStep: 13,
          lastActivityAt: new Date(),
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedByUserId: null,
        }).onConflictDoUpdate({
          target: authAccessRequests.userId,
          set: {
            email: input.email,
            workCity: input.workCity,
            workRegion: input.workRegion,
            occupation: input.occupation,
            availability: input.availability,
            hasVehicle: input.hasVehicle,
            languages: input.languages,
            otherLanguages: input.languages.includes("other") ? input.otherLanguages : null,
            salesExperience: input.salesExperience,
            fieldSalesReadiness: input.fieldSalesReadiness,
            kitInvestmentAcknowledged: input.kitInvestmentAcknowledged,
            activeSellerAcknowledged: input.activeSellerAcknowledged,
            message: input.message || null,
            status: "pending",
            draftStep: 13,
            lastActivityAt: new Date(),
            abandonedNotifiedAt: null,
            submittedAt: new Date(),
            reviewedAt: null,
            reviewedByUserId: null,
          },
        });
        return account;
      });

      delete (req.session as any).verifiedPhone;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
      console.log(`[phone-auth] new sign-up pending approval: ${input.displayName} ${phone}`);
      void sendSignupTelegram(formatSignupLeadTelegram({
        name: input.displayName,
        phone,
        email: input.email,
        workCity: input.workCity,
        workRegion: input.workRegion,
        hasVehicle: input.hasVehicle,
        languages: input.languages,
        otherLanguages: input.otherLanguages,
        occupation: input.occupation,
        salesExperience: input.salesExperience,
        fieldSalesReadiness: input.fieldSalesReadiness,
        availability: input.availability,
        message: input.message,
      }), {
        whatsappPhone: phone,
        whatsappText: `Olá, ${input.displayName.split(/\s+/)[0]}! Recebemos seu cadastro no Xpot e queremos conversar com você.`,
      });
      res.status(201).json({ status: "pending" satisfies PhoneAuthStatus });
    } catch (err) {
      fail(res, err);
    }
  });
}
