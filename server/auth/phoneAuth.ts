import { createHash, randomInt, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { authPhoneCodes, users, type User } from "#shared/schema.js";
import { normalizePhone } from "#shared/phone.js";
import { storage } from "../storage.js";
import { defaultSmsSender, SmsError, type SmsSender } from "./sms.js";

// Sign-in by phone: a 6-digit code goes out by SMS, the person types it back.
// No email, no password. What happens next depends on the person:
//   active rep          → signed in
//   unknown number      → asked for their name, then registered as *pending*
//   pending (not yet approved by Skale Club) → told to wait / get in touch
//   blocked             → told their access is off
// Only active reps ever get a signed-in session.

export const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_CODES_PER_PHONE_PER_HOUR = 5;
const MAX_CODES_PER_IP_PER_HOUR = 20;
const VERIFIED_PHONE_TTL_MS = 30 * 60 * 1000;

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

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  lang: z.enum(LANGS).optional(),
}).strict();

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
}

/** Checks the latest code for the number; on success all its codes are spent. */
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

/** Where a known user stands. A user without a rep row gets one (pending unless admin). */
export async function accessOf(user: User): Promise<Exclude<PhoneAuthStatus, "new">> {
  let rep = await storage.getSalesRepByUserId(user.id);
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
  return rep.isActive ? "active" : "pending";
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

/** Text to the Skale Club team when someone signs up (XPOT_SIGNUP_NOTIFY_PHONES, comma separated). */
async function notifyTeam(sms: SmsSender, name: string, phone: string, req: Request) {
  const to = (process.env.XPOT_SIGNUP_NOTIFY_PHONES ?? "")
    .split(",")
    .map((p) => normalizePhone(p))
    .filter((p): p is string => !!p);
  if (!to.length) return;
  const origin = process.env.XPOT_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  const body = `Xpot: new sign-up waiting for approval: ${name} (${phone}). ${origin}/admin/reps`;
  await Promise.all(to.map((p) => sms.send(p, body).catch((err) => console.error("[phone-auth] team notice failed", err))));
}

function fail(res: Response, err: unknown) {
  if (err instanceof PhoneAuthError) return res.status(err.status).json({ code: err.code, message: err.message, ...err.extra });
  if (err instanceof z.ZodError) return res.status(400).json({ code: "invalid_phone", message: "Invalid input" });
  console.error("[phone-auth]", err);
  res.status(500).json({ message: "Sign-in failed. Try again." });
}

export function registerPhoneAuthRoutes(app: Express, sms: SmsSender = defaultSmsSender()) {
  // What the sign-in screen needs to know.
  app.get("/api/auth/phone/config", (_req, res) => {
    res.json({
      smsLive: sms.live,
      supportWhatsapp: normalizePhone(process.env.XPOT_SUPPORT_WHATSAPP ?? "") ?? null,
    });
  });

  app.post("/api/auth/phone/start", async (req, res) => {
    try {
      const input = startSchema.parse(req.body);
      const phone = parsePhone(input.phone, input.countryCode);
      await sendCode(phone, input.lang ?? "en", req.ip ?? null, sms);
      res.json({ ok: true, phone });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/auth/phone/verify", async (req, res) => {
    try {
      const input = verifySchema.parse(req.body);
      const phone = parsePhone(input.phone, input.countryCode);
      await checkCode(phone, input.code);
      const user = await findUserByPhone(phone);
      if (!user) {
        await rememberVerifiedPhone(req, phone);
        return res.json({ status: "new" satisfies PhoneAuthStatus });
      }
      const status = await accessOf(user);
      if (status === "active") await startSession(req, user);
      res.json({ status });
    } catch (err) {
      fail(res, err);
    }
  });

  // A verified, unknown number becomes a pending reseller once it has a name.
  app.post("/api/auth/phone/register", async (req, res) => {
    try {
      const input = registerSchema.parse(req.body);
      const verified = (req.session as any)?.verifiedPhone as { phone: string; at: number } | undefined;
      if (!verified || Date.now() - verified.at > VERIFIED_PHONE_TTL_MS) {
        throw new PhoneAuthError("not_verified", 401, "Confirm your phone number first.");
      }
      const phone = verified.phone;
      const existing = await findUserByPhone(phone);
      if (existing) return res.json({ status: await accessOf(existing) });

      const { firstName, lastName } = splitName(input.displayName);
      const [user] = await db.insert(users).values({ phone, firstName, lastName, isAdmin: false }).returning();
      await storage.upsertSalesRep({
        userId: user.id,
        displayName: input.displayName,
        phone,
        role: "rep",
        isActive: false,
      });
      delete (req.session as any).verifiedPhone;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
      console.log(`[phone-auth] new sign-up pending approval: ${input.displayName} ${phone}`);
      void notifyTeam(sms, input.displayName, phone, req);
      res.status(201).json({ status: "pending" satisfies PhoneAuthStatus });
    } catch (err) {
      fail(res, err);
    }
  });
}
