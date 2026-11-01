import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { organizationMemberships, organizations, salesReps, users } from "#shared/schema.js";
import { isPersonalOrganization, managesEveryOrganization } from "#shared/organizations.js";
import { repModules } from "#shared/modules.js";
import { normalizePhone } from "#shared/phone.js";
import { AccountError, createResellerAccount } from "../routes/xpot/resellerAccounts.js";
import { OrganizationError, assertOrganizationAccess, audit, type OrganizationActor } from "./service.js";

// "Add person": an organization's owner (or the platform) brings someone in by
// name and phone. Inside an organization there are only two roles, so the
// person is always an employee ("member"); making a second owner is the
// platform's (owner_grant_platform_only, routes/xpot/organizations.ts).
//
// With an account on that phone they join as they are; without one, an
// account is made for the phone (an active rep who signs in with an SMS code)
// and they join. Someone who already works in another real organization is
// not pulled out of it. Someone selling alone (their own `rep-<id>` workspace)
// can join: that workspace is closed when it holds no work, and left alone
// (still theirs, still listed) when it does, since their pieces and customers
// are in it.

export const invitePersonSchema = z.object({
  phone: z.string().trim().min(4).max(40),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional().nullable(),
  // Only to be refused for anyone but the platform: the form never sends it.
  membershipRole: z.enum(["admin", "member"]).optional(),
}).strict();

export type InvitePersonInput = z.infer<typeof invitePersonSchema>;

/** Where a person's work (pieces, kits, customers) sits in one organization. */
async function workIn(organizationId: number): Promise<number> {
  const result = await db.execute(sql`
    SELECT (SELECT count(*) FROM tags WHERE organization_id = ${organizationId})
         + (SELECT count(*) FROM tag_kits WHERE organization_id = ${organizationId})
         + (SELECT count(*) FROM sales_leads WHERE organization_id = ${organizationId}) AS total`);
  return Number((result.rows[0] as { total?: string | number } | undefined)?.total ?? 0);
}

async function membershipsWithOrganization(repId: number) {
  const memberCount = sql<number>`(SELECT count(*)::int FROM organization_memberships om WHERE om.organization_id = "organizations"."id")`;
  const soleMemberRepId = sql<number | null>`(SELECT min(om.rep_id) FROM organization_memberships om WHERE om.organization_id = "organizations"."id")`;
  return db.select({
    membershipId: organizationMemberships.id,
    organizationId: organizationMemberships.organizationId,
    isActive: organizationMemberships.isActive,
    blockedAt: organizationMemberships.blockedAt,
    slug: organizations.slug,
    memberCount,
    soleMemberRepId,
  }).from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.repId, repId));
}

export async function invitePerson(organizationId: number, input: InvitePersonInput, actor: OrganizationActor) {
  await assertOrganizationAccess(actor, organizationId, true);
  const role = input.membershipRole ?? "member";
  if (role === "admin" && !managesEveryOrganization(actor)) {
    throw new OrganizationError("Only the platform can make someone an owner of an organization.", 403, "owner_grant_platform_only");
  }
  const phone = normalizePhone(input.phone, input.countryCode);
  if (!phone) throw new AccountError("Enter a valid phone number, with the country code if it isn't a US number.", 400, "phone_invalid");

  const [found] = await db.select({ user: users, rep: salesReps }).from(users)
    .leftJoin(salesReps, eq(salesReps.userId, users.id))
    .where(eq(users.phone, phone)).limit(1);

  if (!found) {
    // No account on this phone: make one that signs in with a code sent to it.
    // Same rule as anyone creating access: a rep, with at most the modules of the person adding them.
    const displayName = [input.firstName, input.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
    const rep = await createResellerAccount(
      { displayName, phone: input.phone, countryCode: input.countryCode, role: "rep", modules: repModules(actor.rep), costPolicy: "acquisition" },
      { userId: actor.user.userId, isAdmin: actor.user.isAdmin },
      { createOrganization: false },
    );
    const membership = await addAsMember(organizationId, rep.id, role, actor, { createdAccount: true });
    return { membership, repId: rep.id, createdAccount: true };
  }

  const { user, rep } = found;
  if (user.isAdmin || rep?.role === "admin") {
    throw new OrganizationError("This person runs the platform and can't be added to an organization.", 409, "person_is_platform_admin");
  }
  if (!rep || rep.deletedAt || !rep.isActive || rep.blockedAt) {
    throw new OrganizationError("This person's Xpot access isn't active.", 409, "person_not_active");
  }

  const memberships = await membershipsWithOrganization(rep.id);
  if (memberships.some((item) => item.organizationId === organizationId)) {
    throw new OrganizationError("This person already belongs to the organization.", 409, "organization_member_exists");
  }
  const active = memberships.filter((item) => item.isActive && !item.blockedAt);
  const alone = active.filter((item) => isPersonalOrganization(item));
  if (active.length > alone.length) {
    throw new OrganizationError("This person already works in another organization.", 409, "person_in_other_organization");
  }

  // Their own one-person workspace is closed when it holds nothing, so new records land in the new organization.
  const closing: typeof alone = [];
  for (const workspace of alone) if (await workIn(workspace.organizationId) === 0) closing.push(workspace);
  const membership = await addAsMember(organizationId, rep.id, role, actor, { createdAccount: false }, closing);
  return { membership, repId: rep.id, createdAccount: false };
}

async function addAsMember(
  organizationId: number,
  repId: number,
  role: "admin" | "member",
  actor: OrganizationActor,
  detail: { createdAccount: boolean },
  closing: { membershipId: number; organizationId: number }[] = [],
) {
  const membership = await db.transaction(async (tx) => {
    for (const workspace of closing) {
      await tx.update(organizationMemberships).set({ isActive: false, updatedAt: new Date() })
        .where(eq(organizationMemberships.id, workspace.membershipId));
    }
    const [created] = await tx.insert(organizationMemberships).values({
      organizationId,
      repId,
      role,
      createdByUserId: actor.user.userId,
    }).returning();
    return created;
  });
  for (const workspace of closing) await audit(workspace.organizationId, "workspace_closed", actor, repId, { joinedOrganizationId: organizationId });
  await audit(organizationId, "member_added", actor, repId, { role, source: "phone", ...detail });
  return membership;
}
