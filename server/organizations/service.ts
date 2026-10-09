import { randomBytes } from "crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  organizationAuditLog,
  organizationMemberships,
  organizations,
  salesLeads,
  salesReps,
  tagKits,
  tags,
  users,
} from "#shared/schema.js";
import {
  canManageOrganization,
  canViewOrganization,
  managesEveryOrganization,
  type OrganizationAccess,
  type OrganizationViewer,
} from "#shared/organizations.js";

export type OrganizationActor = OrganizationViewer & { user: { userId: string; isAdmin: boolean } };

export class OrganizationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const membershipSelection = {
  organizationId: organizationMemberships.organizationId,
  role: organizationMemberships.role,
  isActive: organizationMemberships.isActive,
  blockedAt: organizationMemberships.blockedAt,
};

export async function membershipsForRep(repId: number): Promise<OrganizationAccess[]> {
  return db
    .select(membershipSelection)
    .from(organizationMemberships)
    .where(eq(organizationMemberships.repId, repId));
}

export async function companyOrganizationId(): Promise<number> {
  const [organization] = await db.select({ id: organizations.id }).from(organizations)
    .where(eq(organizations.slug, "xpot-company"));
  if (!organization) throw new OrganizationError("Company Organization is not configured.", 500);
  return organization.id;
}

/** New operational records follow the Rep's active Organization. */
export async function organizationIdForRep(repId: number): Promise<number> {
  const [membership] = await db.select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(and(
      eq(organizationMemberships.repId, repId),
      eq(organizationMemberships.isActive, true),
      sql`${organizationMemberships.blockedAt} IS NULL`,
    ))
    .orderBy(desc(organizationMemberships.updatedAt))
    .limit(1);
  return membership?.organizationId ?? companyOrganizationId();
}

export async function managedOrganizationIds(actor: OrganizationActor): Promise<number[] | null> {
  if (managesEveryOrganization(actor)) return null;
  const memberships = await membershipsForRep(actor.rep.id);
  return memberships
    .filter((membership) => membership.role === "admin" && membership.isActive && !membership.blockedAt)
    .map((membership) => membership.organizationId);
}

export async function canManageOrganizationForActor(actor: OrganizationActor, organizationId: number): Promise<boolean> {
  if (managesEveryOrganization(actor)) return true;
  return canManageOrganization(actor, await membershipsForRep(actor.rep.id), organizationId);
}

export async function canViewOrganizationForActor(actor: OrganizationActor, organizationId: number): Promise<boolean> {
  if (managesEveryOrganization(actor)) return true;
  return canViewOrganization(actor, await membershipsForRep(actor.rep.id), organizationId);
}

export async function activeOrganizationIds(actor: OrganizationActor): Promise<number[] | null> {
  if (managesEveryOrganization(actor)) return null;
  return (await membershipsForRep(actor.rep.id))
    .filter((membership) => membership.isActive && !membership.blockedAt)
    .map((membership) => membership.organizationId);
}

export async function assertOrganizationAccess(actor: OrganizationActor, organizationId: number, manage = false) {
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!organization) throw new OrganizationError("Organization not found", 404);
  const memberships = managesEveryOrganization(actor) ? [] : await membershipsForRep(actor.rep.id);
  const allowed = manage
    ? canManageOrganization(actor, memberships, organizationId)
    : canViewOrganization(actor, memberships, organizationId);
  if (!allowed) throw new OrganizationError("You do not have access to this Organization.", 403);
  return { organization, memberships };
}

export async function listOrganizations(actor: OrganizationActor) {
  if (managesEveryOrganization(actor)) {
    return db.select().from(organizations).orderBy(asc(organizations.name));
  }
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      isActive: organizations.isActive,
      createdByUserId: organizations.createdByUserId,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      membershipRole: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(
      eq(organizationMemberships.repId, actor.rep.id),
      eq(organizationMemberships.isActive, true),
      sql`${organizationMemberships.blockedAt} IS NULL`,
    ))
    .orderBy(asc(organizations.name));
}

function slugBase(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "organization";
}

export async function createOrganization(input: { name: string; repAdminId: number }, actor: OrganizationActor) {
  if (!managesEveryOrganization(actor)) throw new OrganizationError("Manager access required", 403);
  const [rep] = await db.select().from(salesReps).where(eq(salesReps.id, input.repAdminId));
  if (!rep || rep.deletedAt) throw new OrganizationError("Rep not found", 404);
  const slug = `${slugBase(input.name)}-${randomBytes(3).toString("hex")}`;
  return db.transaction(async (tx) => {
    const [organization] = await tx.insert(organizations).values({
      name: input.name.trim(),
      slug,
      createdByUserId: actor.user.userId,
    }).returning();
    await tx.insert(organizationMemberships).values({
      organizationId: organization.id,
      repId: rep.id,
      role: "admin",
      createdByUserId: actor.user.userId,
    });
    await tx.insert(organizationAuditLog).values({
      organizationId: organization.id,
      action: "organization_created",
      targetRepId: rep.id,
      actorUserId: actor.user.userId,
      detail: { name: organization.name, firstRepAdminId: rep.id },
    });
    return organization;
  });
}

export async function updateOrganization(
  organizationId: number,
  input: { name?: string; isActive?: boolean },
  actor: OrganizationActor,
) {
  if (!managesEveryOrganization(actor)) throw new OrganizationError("Manager access required", 403);
  await assertOrganizationAccess(actor, organizationId, true);
  const [updated] = await db.update(organizations).set({ ...input, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId)).returning();
  await audit(organizationId, "organization_updated", actor, null, input);
  return updated;
}

export async function listOrganizationMembers(organizationId: number, actor: OrganizationActor) {
  await assertOrganizationAccess(actor, organizationId);
  return db
    .select({
      membershipId: organizationMemberships.id,
      organizationId: organizationMemberships.organizationId,
      repId: salesReps.id,
      displayName: salesReps.displayName,
      email: salesReps.email,
      phone: users.phone,
      platformRole: salesReps.role,
      membershipRole: organizationMemberships.role,
      isActive: organizationMemberships.isActive,
      blockedAt: organizationMemberships.blockedAt,
      blockedReason: organizationMemberships.blockedReason,
      modules: salesReps.modules,
      createdAt: organizationMemberships.createdAt,
    })
    .from(organizationMemberships)
    .innerJoin(salesReps, eq(salesReps.id, organizationMemberships.repId))
    .leftJoin(users, eq(users.id, salesReps.userId))
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(salesReps.displayName));
}

export async function addOrganizationMember(
  organizationId: number,
  repId: number,
  role: "admin" | "member",
  actor: OrganizationActor,
) {
  await assertOrganizationAccess(actor, organizationId, true);
  const [rep] = await db.select().from(salesReps).where(eq(salesReps.id, repId));
  if (!rep || rep.deletedAt) throw new OrganizationError("Rep not found", 404);
  const [existing] = await db.select().from(organizationMemberships).where(and(
    eq(organizationMemberships.organizationId, organizationId),
    eq(organizationMemberships.repId, repId),
  ));
  if (existing) throw new OrganizationError("This Rep already belongs to the Organization.", 409);
  const [membership] = await db.insert(organizationMemberships).values({
    organizationId,
    repId,
    role,
    createdByUserId: actor.user.userId,
  }).returning();
  await audit(organizationId, "member_added", actor, repId, { role });
  return membership;
}

async function assertNotLastAdmin(organizationId: number, repId: number) {
  const admins = await db.select({ repId: organizationMemberships.repId }).from(organizationMemberships).where(and(
    eq(organizationMemberships.organizationId, organizationId),
    eq(organizationMemberships.role, "admin"),
    eq(organizationMemberships.isActive, true),
    sql`${organizationMemberships.blockedAt} IS NULL`,
  ));
  if (admins.length === 1 && admins[0].repId === repId) {
    throw new OrganizationError("Assign another Rep Admin before removing or blocking the last one.", 409);
  }
}

export async function updateOrganizationMember(
  organizationId: number,
  repId: number,
  input: { role?: "admin" | "member"; isActive?: boolean; blockedReason?: string | null },
  actor: OrganizationActor,
) {
  await assertOrganizationAccess(actor, organizationId, true);
  const [current] = await db.select().from(organizationMemberships).where(and(
    eq(organizationMemberships.organizationId, organizationId),
    eq(organizationMemberships.repId, repId),
  ));
  if (!current) throw new OrganizationError("Organization member not found", 404);
  const removesAdmin = current.role === "admin" && (
    input.role === "member" || input.isActive === false || input.blockedReason !== undefined
  );
  if (removesAdmin) await assertNotLastAdmin(organizationId, repId);
  const blocked = input.blockedReason !== undefined;
  const [membership] = await db.update(organizationMemberships).set({
    ...(input.role ? { role: input.role } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(blocked ? {
      blockedAt: input.blockedReason === null ? null : new Date(),
      blockedReason: input.blockedReason,
      isActive: input.blockedReason === null,
    } : {}),
    updatedAt: new Date(),
  }).where(eq(organizationMemberships.id, current.id)).returning();
  await audit(organizationId, "member_updated", actor, repId, input);
  return membership;
}

export async function removeOrganizationMember(organizationId: number, repId: number, actor: OrganizationActor) {
  await assertOrganizationAccess(actor, organizationId, true);
  const [current] = await db.select().from(organizationMemberships).where(and(
    eq(organizationMemberships.organizationId, organizationId),
    eq(organizationMemberships.repId, repId),
  ));
  if (!current) throw new OrganizationError("Organization member not found", 404);
  if (current.role === "admin") await assertNotLastAdmin(organizationId, repId);
  await db.delete(organizationMemberships).where(eq(organizationMemberships.id, current.id));
  await audit(organizationId, "member_removed", actor, repId, {});
  return { success: true };
}

export async function getOrganizationWorkspace(organizationId: number, actor: OrganizationActor) {
  const { organization, memberships } = await assertOrganizationAccess(actor, organizationId);
  const organizationWide = canManageOrganization(actor, memberships, organizationId);
  const [counts] = await db.select({
    members: organizationWide
      ? sql<number>`(SELECT count(*)::int FROM organization_memberships m WHERE m.organization_id = ${organizationId} AND m.is_active)`
      : sql<number>`1`,
    pieces: organizationWide
      ? sql<number>`(SELECT count(*)::int FROM tags t WHERE t.organization_id = ${organizationId})`
      : sql<number>`(SELECT count(*)::int FROM tags t WHERE t.organization_id = ${organizationId} AND t.rep_id = ${actor.rep.id})`,
    kits: organizationWide
      ? sql<number>`(SELECT count(*)::int FROM tag_kits k WHERE k.organization_id = ${organizationId})`
      : sql<number>`(SELECT count(*)::int FROM tag_kits k WHERE k.organization_id = ${organizationId} AND k.rep_id = ${actor.rep.id})`,
    customers: organizationWide
      ? sql<number>`(SELECT count(*)::int FROM sales_leads l WHERE l.organization_id = ${organizationId})`
      : sql<number>`(SELECT count(*)::int FROM sales_leads l WHERE l.organization_id = ${organizationId} AND l.owner_rep_id = ${actor.rep.id})`,
  }).from(organizations).where(eq(organizations.id, organizationId));
  return { ...organization, counts: counts ?? { members: 0, pieces: 0, kits: 0, customers: 0 } };
}

export async function listOrganizationInventory(organizationId: number, actor: OrganizationActor) {
  const { memberships } = await assertOrganizationAccess(actor, organizationId);
  const organizationWide = canManageOrganization(actor, memberships, organizationId);
  return db.select().from(tags).where(organizationWide
    ? eq(tags.organizationId, organizationId)
    : and(eq(tags.organizationId, organizationId), eq(tags.repId, actor.rep.id)))
    .orderBy(desc(tags.updatedAt)).limit(500);
}

export async function listOrganizationKits(organizationId: number, actor: OrganizationActor) {
  const { memberships } = await assertOrganizationAccess(actor, organizationId);
  const organizationWide = canManageOrganization(actor, memberships, organizationId);
  return db.select().from(tagKits).where(organizationWide
    ? eq(tagKits.organizationId, organizationId)
    : and(eq(tagKits.organizationId, organizationId), eq(tagKits.repId, actor.rep.id)))
    .orderBy(desc(tagKits.createdAt)).limit(200);
}

export async function listOrganizationCustomers(organizationId: number, actor: OrganizationActor) {
  const { memberships } = await assertOrganizationAccess(actor, organizationId);
  const organizationWide = canManageOrganization(actor, memberships, organizationId);
  return db.select().from(salesLeads).where(organizationWide
    ? eq(salesLeads.organizationId, organizationId)
    : and(eq(salesLeads.organizationId, organizationId), eq(salesLeads.ownerRepId, actor.rep.id)))
    .orderBy(desc(salesLeads.updatedAt)).limit(500);
}

async function audit(
  organizationId: number,
  action: string,
  actor: OrganizationActor,
  targetRepId: number | null,
  detail: Record<string, unknown>,
) {
  await db.insert(organizationAuditLog).values({
    organizationId,
    action,
    targetRepId,
    actorUserId: actor.user.userId,
    detail,
  });
}
