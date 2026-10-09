import { eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db.js";
import { salesReps, users, type SalesRep } from "#shared/schema.js";
import { XPOT_MODULES } from "#shared/modules.js";
import { normalizePhone } from "#shared/phone.js";
import { storage } from "../../storage.js";
import { ensureWholesaleCode } from "../../wholesale/index.js";
import { formatWholesaleCode } from "#shared/wholesale.js";
import { ensureOrganizationForRep } from "../../organizations/service.js";

// Who may use Xpot is decided by Skale Club. People sign up themselves (by
// phone) and wait for approval, or an admin creates their access directly;
// either way they sign in with a code sent to that phone. Ending a
// partnership blocks the rep and logs them out everywhere.

export class AccountError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const phoneField = z.string().trim().min(4).max(40);
const countryCodeField = z.string().regex(/^\d{1,4}$/).optional();

export const resellerAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  phone: phoneField,
  countryCode: countryCodeField,
  team: z.string().trim().max(60).optional().nullable(),
  role: z.enum(["rep", "manager", "admin"]).default("rep"),
  modules: z.array(z.enum(XPOT_MODULES)).min(1).default([...XPOT_MODULES]),
  costPolicy: z.enum(["zero", "acquisition"]).default("acquisition"),
}).strict();

export type ResellerAccountInput = z.infer<typeof resellerAccountSchema>;

export const approveSchema = z.object({ modules: z.array(z.enum(XPOT_MODULES)).min(1).optional() }).strict();
export const blockSchema = z.object({ reason: z.string().trim().max(300).optional().nullable() }).strict();
export const phoneChangeSchema = z.object({ phone: phoneField, countryCode: countryCodeField }).strict();

export interface Actor {
  userId: string;
  isAdmin: boolean;
}

function parsePhone(input: string, countryCode?: string): string {
  const phone = normalizePhone(input, countryCode);
  if (!phone) throw new AccountError("Enter a valid phone number, with the country code if it isn't a US number.", 400);
  return phone;
}

async function assertPhoneFree(phone: string, exceptUserId?: string) {
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  if (taken && taken.id !== exceptUserId) throw new AccountError("This phone already has an Xpot account. Find it in the list below.", 409);
}

function splitName(displayName: string): { firstName: string; lastName: string | null } {
  const [first, ...rest] = displayName.trim().split(/\s+/);
  return { firstName: first, lastName: rest.length ? rest.join(" ") : null };
}

/** The admin creates someone's access: active straight away, signs in with their phone. */
export async function createResellerAccount(
  input: ResellerAccountInput,
  actor: Actor,
  options: { createOrganization?: boolean } = {},
): Promise<SalesRep> {
  if (input.role === "admin" && !actor.isAdmin) throw new AccountError("Only an admin can create another admin.", 403);
  const phone = parsePhone(input.phone, input.countryCode);
  await assertPhoneFree(phone);
  const { firstName, lastName } = splitName(input.displayName);
  const [user] = await db.insert(users).values({ phone, firstName, lastName, isAdmin: input.role === "admin" }).returning();
  const rep = await storage.upsertSalesRep({
    userId: user.id,
    displayName: input.displayName,
    phone,
    team: input.team ?? null,
    role: input.role,
    isActive: true,
    modules: input.modules,
    costPolicy: input.costPolicy,
    costPolicyConfiguredAt: new Date(),
    costPolicyConfiguredByUserId: actor.userId,
  });
  const wholesaleCode = await ensureWholesaleCode(rep.id);
  if (input.role === "rep" && options.createOrganization !== false) {
    await ensureOrganizationForRep(rep.id, actor.userId);
  }
  return { ...rep, wholesaleCode };
}

async function repOr404(repId: number): Promise<SalesRep> {
  const rep = await storage.getSalesRep(repId);
  if (!rep || rep.deletedAt) throw new AccountError("Rep not found", 404);
  return rep;
}

/** Managers handle reps; only an admin may act on a manager or an admin. */
function assertMayManage(rep: SalesRep, actor: Actor) {
  if (rep.userId === actor.userId) throw new AccountError("You can't change your own access.", 400);
  if (rep.role !== "rep" && !actor.isAdmin) throw new AccountError("Only an admin can change a manager's or admin's access.", 403);
}

async function setAccess(repId: number, patch: Partial<Pick<SalesRep, "isActive" | "blockedAt" | "blockedReason" | "modules">>) {
  const [updated] = await db.update(salesReps).set({ ...patch, updatedAt: new Date() }).where(eq(salesReps.id, repId)).returning();
  return updated;
}

/** Sign-up reviewed and accepted. */
export async function approveRep(repId: number, modules: string[] | undefined, actor: Actor) {
  const rep = await repOr404(repId);
  assertMayManage(rep, actor);
  if (rep.blockedAt) throw new AccountError("This rep is blocked. Unblock them instead.", 409);
  const updated = await setAccess(repId, { isActive: true, ...(modules ? { modules } : {}) });
  if (updated.role === "rep") await ensureOrganizationForRep(repId, actor.userId);
  // Approved partners buy kits at wholesale with their own code.
  return { ...updated, wholesaleCode: await ensureWholesaleCode(repId) };
}

/** Partnership ended (or sign-up refused): no access, and every open session ends now. */
export async function blockRep(repId: number, reason: string | null | undefined, actor: Actor) {
  const rep = await repOr404(repId);
  assertMayManage(rep, actor);
  const updated = await setAccess(repId, { isActive: false, blockedAt: new Date(), blockedReason: reason?.trim() || null });
  const ended = await db.execute(sql`DELETE FROM sessions WHERE sess->>'userId' = ${rep.userId}`);
  console.log(`[reps] ${rep.displayName} (#${rep.id}) blocked by ${actor.userId}; ${ended.rowCount ?? 0} session(s) ended`);
  return updated;
}

export async function unblockRep(repId: number, actor: Actor) {
  const rep = await repOr404(repId);
  assertMayManage(rep, actor);
  const updated = await setAccess(repId, { isActive: true, blockedAt: null, blockedReason: null });
  return { ...updated, wholesaleCode: await ensureWholesaleCode(repId) };
}

/** The number the rep signs in with (e.g. they changed phones). */
export async function changeRepPhone(repId: number, input: z.infer<typeof phoneChangeSchema>, actor: Actor) {
  const rep = await repOr404(repId);
  if (rep.role !== "rep" && !actor.isAdmin && rep.userId !== actor.userId) {
    throw new AccountError("Only an admin can change a manager's or admin's phone.", 403);
  }
  const phone = parsePhone(input.phone, input.countryCode);
  await assertPhoneFree(phone, rep.userId);
  await db.update(users).set({ phone, updatedAt: new Date() }).where(eq(users.id, rep.userId));
  const [updated] = await db.update(salesReps).set({ phone, updatedAt: new Date() }).where(eq(salesReps.id, repId)).returning();
  return updated;
}

export type RepAccess = "active" | "pending" | "blocked";

/** Reps for Admin → Reps, with the phone they sign in with and where they stand. */
export async function listRepsWithAccess() {
  const list = await db
    .select({ rep: salesReps, loginPhone: users.phone })
    .from(salesReps)
    .leftJoin(users, eq(users.id, salesReps.userId))
    // Deleted accounts kept only as placeholders for sales records (server/accountDeletion.ts).
    .where(isNull(salesReps.deletedAt))
    .orderBy(salesReps.createdAt);
  // Reps approved before wholesale codes existed get theirs now.
  for (const row of list) {
    if (row.rep.isActive && !row.rep.blockedAt && !row.rep.wholesaleCode) {
      row.rep = { ...row.rep, wholesaleCode: await ensureWholesaleCode(row.rep.id) };
    }
  }
  return list.map(({ rep, loginPhone }) => ({
    ...rep,
    loginPhone,
    wholesaleCode: rep.wholesaleCode ? formatWholesaleCode(rep.wholesaleCode) : null,
    access: (rep.blockedAt ? "blocked" : rep.isActive ? "active" : "pending") as RepAccess,
  }));
}
