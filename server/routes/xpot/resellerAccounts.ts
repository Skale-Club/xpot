import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db.js";
import { authAccessRequests, organizationMemberships, organizations, salesReps, users, type SalesRep } from "#shared/schema.js";
import { XPOT_MODULES } from "#shared/modules.js";
import { normalizePhone } from "#shared/phone.js";
import { storage } from "../../storage.js";
import { ensureWholesaleCode } from "../../wholesale/index.js";
import { formatWholesaleCode } from "#shared/wholesale.js";
import { ensureOrganizationForRep } from "../../organizations/service.js";
import { handOutRecipients } from "../../organizations/links.js";
import { refusalReason } from "#shared/repAccess.js";

// Who may use Xpot is decided by the Xpot team. People sign up themselves (by
// phone) and wait for approval, or an admin creates their access directly;
// either way they sign in with a code sent to that phone. Ending a
// partnership blocks the rep and logs them out everywhere.

/** A refusal People shows: `message` is the English fallback, `code` the stable key the client words (srv_<code>). */
export class AccountError extends Error {
  status: number;
  constructor(message: string, status: number, public code?: string) {
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
  role: z.enum(["rep", "admin"]).default("rep"),
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
  if (!phone) throw new AccountError("Enter a valid phone number, with the country code if it isn't a US number.", 400, "phone_invalid");
  return phone;
}

async function assertPhoneFree(phone: string, exceptUserId?: string) {
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  if (taken && taken.id !== exceptUserId) throw new AccountError("This phone already has an Xpot account. Find it in the list below.", 409, "phone_taken");
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
  if (input.role === "admin" && !actor.isAdmin) throw new AccountError("Only an Xpot admin can create another Xpot admin.", 403, "admin_create_admin_only");
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
  if (!rep || rep.deletedAt) throw new AccountError("Person not found", 404, "rep_not_found");
  return rep;
}

/** Managers handle reps; only an admin may act on a manager or an admin. */
function assertMayManage(rep: SalesRep, actor: Actor) {
  if (rep.userId === actor.userId) throw new AccountError("You can't change your own access.", 400, "own_access_locked");
  if (rep.role !== "rep" && !actor.isAdmin) throw new AccountError("Only an Xpot admin can change a manager's or admin's access.", 403, "access_change_admin_only");
}

async function setAccess(repId: number, patch: Partial<Pick<SalesRep, "isActive" | "blockedAt" | "blockedReason" | "refusedAt" | "modules">>) {
  const [updated] = await db.update(salesReps).set({ ...patch, updatedAt: new Date() }).where(eq(salesReps.id, repId)).returning();
  return updated;
}

/** Sign-up reviewed and accepted. */
export async function approveRep(repId: number, modules: string[] | undefined, actor: Actor) {
  const rep = await repOr404(repId);
  assertMayManage(rep, actor);
  if (rep.blockedAt) throw new AccountError("This person is blocked. Unblock them instead.", 409, "rep_blocked_unblock_first");
  const updated = await setAccess(repId, { isActive: true, ...(modules ? { modules } : {}) });
  await db.update(authAccessRequests).set({
    status: "approved",
    reviewedAt: new Date(),
    reviewedByUserId: actor.userId,
  }).where(eq(authAccessRequests.userId, rep.userId));
  if (updated.role === "rep") await ensureOrganizationForRep(repId, actor.userId);
  // Approved partners buy kits at wholesale with their own code.
  return { ...updated, wholesaleCode: await ensureWholesaleCode(repId) };
}

/** Partnership ended (or sign-up refused): no access, and every open session ends now. */
export async function blockRep(repId: number, reason: string | null | undefined, actor: Actor, refused = false) {
  const rep = await repOr404(repId);
  assertMayManage(rep, actor);
  const now = new Date();
  const updated = await setAccess(repId, { isActive: false, blockedAt: now, blockedReason: reason?.trim() || null, refusedAt: refused ? now : null });
  await db.update(authAccessRequests).set({
    status: "declined",
    reviewedAt: new Date(),
    reviewedByUserId: actor.userId,
  }).where(eq(authAccessRequests.userId, rep.userId));
  const ended = await db.execute(sql`DELETE FROM sessions WHERE sess->>'userId' = ${rep.userId}`);
  console.log(`[reps] ${rep.displayName} (#${rep.id}) blocked by ${actor.userId}; ${ended.rowCount ?? 0} session(s) ended`);
  return updated;
}

/**
 * Sign-up turned down: blocked like an ended partnership, marked refused_at so
 * People lists it as "Refused". The reason keeps its "Sign-up refused" prefix
 * (shared/repAccess.ts), which People strips to show the admin's note.
 */
export async function refuseRep(repId: number, reason: string | null | undefined, actor: Actor) {
  const rep = await repOr404(repId);
  if (rep.isActive || rep.blockedAt) throw new AccountError("Only a sign-up waiting for approval can be refused.", 409, "refuse_pending_only");
  return blockRep(repId, refusalReason(reason), actor, true);
}

export async function unblockRep(repId: number, actor: Actor) {
  const rep = await repOr404(repId);
  assertMayManage(rep, actor);
  const updated = await setAccess(repId, { isActive: true, blockedAt: null, blockedReason: null, refusedAt: null });
  await db.update(authAccessRequests).set({
    status: "approved",
    reviewedAt: new Date(),
    reviewedByUserId: actor.userId,
  }).where(eq(authAccessRequests.userId, rep.userId));
  return { ...updated, wholesaleCode: await ensureWholesaleCode(repId) };
}

/** The number the rep signs in with (e.g. they changed phones). */
export async function changeRepPhone(repId: number, input: z.infer<typeof phoneChangeSchema>, actor: Actor) {
  const rep = await repOr404(repId);
  if (rep.role !== "rep" && !actor.isAdmin && rep.userId !== actor.userId) {
    throw new AccountError("Only an Xpot admin can change a manager's or admin's phone.", 403, "phone_change_admin_only");
  }
  const phone = parsePhone(input.phone, input.countryCode);
  await assertPhoneFree(phone, rep.userId);
  await db.update(users).set({ phone, updatedAt: new Date() }).where(eq(users.id, rep.userId));
  const [updated] = await db.update(salesReps).set({ phone, updatedAt: new Date() }).where(eq(salesReps.id, repId)).returning();
  return updated;
}

export type RepAccess = "active" | "pending" | "blocked";

/** Reps for Admin → Reps, with the phone they sign in with and where they stand. */
/**
 * Who Tags management can hand pieces to and filter by: everyone for the platform; for an organization's owner, the
 * active people of the organizations they run (never their sign-in phone or application). The code is only a yes or no
 * for them: what counts is whether the person can buy, and it is the person's own key to the store. The owner of a partner
 * that handles its own distribution also gets the active people of the organizations linked to it (the ones it may hand
 * kits to), each labelled with `organizationName` (server/tags/distribution.ts).
 */
export async function listTagPeople(organizationIds: readonly number[] | null) {
  const pick = <R extends { id: number; displayName: string; email: string | null; team: string | null; role: string; isActive: boolean; modules: string[] | null; costPolicy: string; costPolicyConfiguredAt: Date | null; blockedAt: Date | null }>(rep: R, wholesaleCode: string | null) => ({
    id: rep.id, displayName: rep.displayName, email: rep.email, team: rep.team, role: rep.role, isActive: rep.isActive, modules: rep.modules,
    costPolicy: rep.costPolicy, costPolicyConfiguredAt: rep.costPolicyConfiguredAt, blockedAt: rep.blockedAt, wholesaleCode,
  });
  if (organizationIds === null) return (await listRepsWithAccess()).map((rep) => pick(rep, rep.wholesaleCode));
  if (!organizationIds.length) return [];
  const list = await db.selectDistinct({ rep: salesReps }).from(salesReps)
    .innerJoin(organizationMemberships, eq(organizationMemberships.repId, salesReps.id))
    .where(and(
      inArray(organizationMemberships.organizationId, [...organizationIds]),
      eq(organizationMemberships.isActive, true),
      isNull(organizationMemberships.blockedAt),
      isNull(salesReps.deletedAt),
    ));
  const own = list.map(({ rep }) => pick(rep, rep.wholesaleCode ? "set" : null));
  const seen = new Set(own.map((rep) => rep.id));
  // Someone in two linked organizations is one person to hand to: listed once, naming both.
  const byId = new Map<number, (Awaited<ReturnType<typeof handOutRecipients>>)[number]>();
  for (const person of await handOutRecipients(organizationIds)) {
    if (seen.has(person.id)) continue;
    const first = byId.get(person.id);
    byId.set(person.id, first ? { ...first, organizationName: [first.organizationName, person.organizationName].filter(Boolean).sort().join(", ") } : person);
  }
  const linked = Array.from(byId.values()).map(({ organizationId, ...person }) => ({ ...pick(person, null), organizationName: person.organizationName }));
  return [...own, ...linked].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Where each person works, for People's list: the organizations they are an active member of, with their role
 * in each. A blocked person keeps theirs (their memberships are suspended because of the block, and the list, the
 * header and the organization's team all say where they work and that they are blocked). A person's own one-person
 * workspace (slug rep-<id>) is left out: it is not a company to name.
 */
async function teamsByRep() {
  const rows = await db
    .select({ repId: organizationMemberships.repId, id: organizations.id, name: organizations.name, slug: organizations.slug, role: organizationMemberships.role })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .innerJoin(salesReps, eq(salesReps.id, organizationMemberships.repId))
    .where(and(
      or(and(eq(organizationMemberships.isActive, true), isNull(organizationMemberships.blockedAt)), isNotNull(salesReps.blockedAt)),
      eq(organizations.isActive, true),
    ))
    .orderBy(organizations.name);
  const byRep = new Map<number, { id: number; name: string; role: "admin" | "member" }[]>();
  for (const row of rows) {
    if (/^rep-\d+$/.test(row.slug)) continue;
    byRep.set(row.repId, [...(byRep.get(row.repId) ?? []), { id: row.id, name: row.name, role: row.role }]);
  }
  return byRep;
}

/** The organizations where this person is the only active owner: the server refuses to remove or suspend them there. */
export async function organizationsWhereOnlyOwner(repId: number): Promise<Set<number>> {
  const mine = await db.select({ organizationId: organizationMemberships.organizationId }).from(organizationMemberships)
    .where(and(eq(organizationMemberships.repId, repId), eq(organizationMemberships.role, "admin"), eq(organizationMemberships.isActive, true), isNull(organizationMemberships.blockedAt)));
  if (!mine.length) return new Set();
  const owners = await db.select({ organizationId: organizationMemberships.organizationId, n: sql<number>`count(*)::int` }).from(organizationMemberships)
    .where(and(inArray(organizationMemberships.organizationId, mine.map((m) => m.organizationId)), eq(organizationMemberships.role, "admin"), eq(organizationMemberships.isActive, true), isNull(organizationMemberships.blockedAt)))
    .groupBy(organizationMemberships.organizationId);
  return new Set(owners.filter((o) => o.n === 1).map((o) => o.organizationId));
}

export async function listRepsWithAccess() {
  const list = await db
    .select({ rep: salesReps, loginPhone: users.phone, application: authAccessRequests })
    .from(salesReps)
    .leftJoin(users, eq(users.id, salesReps.userId))
    .leftJoin(authAccessRequests, eq(authAccessRequests.userId, salesReps.userId))
    // Deleted accounts kept only as placeholders for sales records (server/accountDeletion.ts).
    .where(isNull(salesReps.deletedAt))
    .orderBy(salesReps.createdAt);
  // Reps approved before wholesale codes existed get theirs now.
  for (const row of list) {
    if (row.rep.isActive && !row.rep.blockedAt && !row.rep.wholesaleCode) {
      row.rep = { ...row.rep, wholesaleCode: await ensureWholesaleCode(row.rep.id) };
    }
  }
  const teams = await teamsByRep();
  return list.map(({ rep, loginPhone, application }) => ({
    ...rep,
    loginPhone,
    teams: teams.get(rep.id) ?? [],
    wholesaleCode: rep.wholesaleCode ? formatWholesaleCode(rep.wholesaleCode) : null,
    access: (rep.blockedAt ? "blocked" : rep.isActive ? "active" : "pending") as RepAccess,
    // A blocked sign-up that was never approved: listed as "Refused", not "Blocked".
    refused: Boolean(rep.blockedAt && rep.refusedAt),
    application: application ? {
      email: application.email,
      workCity: application.workCity,
      workRegion: application.workRegion,
      occupation: application.occupation,
      availability: application.availability,
      hasVehicle: application.hasVehicle,
      languages: application.languages,
      otherLanguages: application.otherLanguages,
      salesExperience: application.salesExperience,
      fieldSalesReadiness: application.fieldSalesReadiness,
      kitInvestmentAcknowledged: application.kitInvestmentAcknowledged,
      activeSellerAcknowledged: application.activeSellerAcknowledged,
      message: application.message,
      status: application.status,
      submittedAt: application.submittedAt,
    } : null,
  }));
}
