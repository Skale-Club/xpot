import { randomBytes } from "crypto";
import { and, asc, desc, eq, getTableColumns, inArray, sql, isNull } from "drizzle-orm";
import { db } from "../db.js";
import {
  organizationAuditLog,
  organizationMemberships,
  organizations,
  printModels,
  salesLeads,
  salesReps,
  tagKits,
  tags,
  users,
} from "#shared/schema.js";
import {
  COMPANY_ORGANIZATION_SLUG,
  canManageOrganization,
  canViewOrganization,
  type Distribution,
  isPersonalOrganization,
  managesEveryOrganization,
  type OrganizationAccess,
  type OrganizationViewer,
} from "#shared/organizations.js";

export type OrganizationActor = OrganizationViewer & { user: { userId: string; isAdmin: boolean } };

/** `message` is the English fallback; `code` is the stable key the client words (srv_<code>). */
export class OrganizationError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
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

/**
 * Of these organizations (a Rep Admin's), the active ones the owners marked as printing their own pieces: where that
 * person may use Tags › Production (server/tags/access.ts requireProductionUser).
 */
export async function printingOrganizationIds(organizationIds: readonly number[]): Promise<number[]> {
  if (!organizationIds.length) return [];
  const rows = await db.select({ id: organizations.id }).from(organizations).where(and(
    inArray(organizations.id, [...organizationIds]),
    eq(organizations.printsOwnPieces, true),
    eq(organizations.isActive, true),
  ));
  return rows.map((row) => row.id);
}

/** Whether pieces may be printed for this organization: the company, or an active branch that prints its own. */
export async function printingOrganization(organizationId: number): Promise<boolean> {
  if (organizationId === await companyOrganizationId()) return true;
  return (await printingOrganizationIds([organizationId])).length > 0;
}

/** More than one active person: a real team, not somebody's one-person workspace. */
export async function organizationHasTeam(organizationId: number): Promise<boolean> {
  const members = await db.select({ id: organizationMemberships.id }).from(organizationMemberships).where(and(
    eq(organizationMemberships.organizationId, organizationId),
    eq(organizationMemberships.isActive, true),
    isNull(organizationMemberships.blockedAt),
  )).limit(2);
  return members.length > 1;
}

/** New operational records follow the Rep's active Organization. */
export async function organizationIdForRep(repId: number): Promise<number> {
  const memberships = await db.select({
    organizationId: organizationMemberships.organizationId,
    isActive: organizationMemberships.isActive,
    blockedAt: organizationMemberships.blockedAt,
  })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.repId, repId))
    .orderBy(desc(organizationMemberships.updatedAt));
  const active = memberships.find((membership) => membership.isActive && !membership.blockedAt);
  if (active) return active.organizationId;
  // An explicitly blocked/removed Rep must not escape that decision by getting
  // a fresh Organization. Only accounts that have never been assigned get the
  // backwards-compatible individual Organization.
  if (memberships.length > 0) throw new OrganizationError("This person has no active organization.", 403, "no_active_organization");
  return ensureOrganizationForRep(repId);
}

/**
 * Legacy account creation predates Organizations. Keep that API safe by giving
 * a brand-new Rep an individual Organization; Admin/Manager can reorganize it
 * later. Existing inactive memberships are deliberately never reactivated.
 */
export async function ensureOrganizationForRep(repId: number, actorUserId?: string): Promise<number> {
  const [rep] = await db.select().from(salesReps).where(eq(salesReps.id, repId));
  if (!rep || rep.deletedAt) throw new OrganizationError("Person not found", 404, "rep_not_found");
  const slug = `rep-${rep.id}`;
  return db.transaction(async (tx) => {
    const current = await tx.select({
      organizationId: organizationMemberships.organizationId,
      isActive: organizationMemberships.isActive,
      blockedAt: organizationMemberships.blockedAt,
    }).from(organizationMemberships)
      .where(eq(organizationMemberships.repId, repId))
      .orderBy(desc(organizationMemberships.updatedAt));
    const active = current.find((membership) => membership.isActive && !membership.blockedAt);
    if (active) return active.organizationId;
    if (current.length > 0) throw new OrganizationError("This person has no active organization.", 403, "no_active_organization");

    // HTTP actors always reference a real user. Integration/import callers may
    // provide a service identifier instead; fall back to the Rep's own user so
    // audit foreign keys never make account provisioning fail.
    const requestedCreator = actorUserId
      ? (await tx.select({ id: users.id }).from(users).where(eq(users.id, actorUserId)).limit(1))[0]?.id
      : undefined;
    const creatorUserId = requestedCreator ?? rep.userId;

    const [created] = await tx.insert(organizations).values({
      name: rep.displayName,
      slug,
      createdByUserId: creatorUserId,
    }).onConflictDoNothing({ target: organizations.slug }).returning();
    const organization = created ?? (await tx.select().from(organizations).where(eq(organizations.slug, slug)))[0];
    if (!organization) throw new OrganizationError("Failed to create the Rep Organization.", 500);
    await tx.insert(organizationMemberships).values({
      organizationId: organization.id,
      repId,
      role: "admin",
      createdByUserId: creatorUserId,
    }).onConflictDoNothing({ target: [organizationMemberships.organizationId, organizationMemberships.repId] });
    if (created) {
      await tx.insert(organizationAuditLog).values({
        organizationId: organization.id,
        action: "organization_created_for_rep",
        targetRepId: repId,
        actorUserId: creatorUserId,
        detail: { source: "legacy_account_flow" },
      });
    }
    return organization.id;
  });
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
  if (!organization) throw new OrganizationError("Organization not found", 404, "organization_not_found");
  const memberships = managesEveryOrganization(actor) ? [] : await membershipsForRep(actor.rep.id);
  const allowed = manage
    ? canManageOrganization(actor, memberships, organizationId)
    : canViewOrganization(actor, memberships, organizationId);
  if (!allowed) throw new OrganizationError("You do not have access to this organization.", 403, "organization_access_denied");
  return { organization, memberships };
}

/** Every member counted (suspended ones too), and the one member when there is only one. The column is spelled out: in a one-table select drizzle would print a bare "id", which inside the subquery means om.id. */
const memberCount = sql<number>`(SELECT count(*)::int FROM organization_memberships om WHERE om.organization_id = "organizations"."id")`;
const soleMemberRepId = sql<number | null>`(SELECT min(om.rep_id) FROM organization_memberships om WHERE om.organization_id = "organizations"."id")`;

/** Adds `personal`: the automatic one-person workspace of a rep (shared/organizations.ts). */
function withPersonal<T extends { slug: string; memberCount: number; soleMemberRepId: number | null }>(row: T) {
  return { ...row, personal: isPersonalOrganization(row) };
}

export async function listOrganizations(actor: OrganizationActor) {
  const columns = {
    id: organizations.id,
    name: organizations.name,
    slug: organizations.slug,
    isActive: organizations.isActive,
    printsOwnPieces: organizations.printsOwnPieces,
    distribution: organizations.distribution,
    releasedPrintModels: organizations.releasedPrintModels,
    createdByUserId: organizations.createdByUserId,
    createdAt: organizations.createdAt,
    updatedAt: organizations.updatedAt,
    memberCount,
    soleMemberRepId,
  };
  if (managesEveryOrganization(actor)) {
    return (await db.select(columns).from(organizations).orderBy(asc(organizations.name))).map(withPersonal);
  }
  const rows = await db
    .select({ ...columns, membershipRole: organizationMemberships.role })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(
      eq(organizationMemberships.repId, actor.rep.id),
      eq(organizationMemberships.isActive, true),
      sql`${organizationMemberships.blockedAt} IS NULL`,
    ))
    .orderBy(asc(organizations.name));
  return rows.map(withPersonal);
}

/**
 * One person's memberships with each organization's name, for People's
 * Organizations section. Suspended memberships are listed too (they are still
 * memberships; the organization page reactivates them).
 */
export async function organizationsForRep(repId: number) {
  const rows = await db
    .select({
      organizationId: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      organizationActive: organizations.isActive,
      role: organizationMemberships.role,
      isActive: organizationMemberships.isActive,
      blockedAt: organizationMemberships.blockedAt,
      memberCount,
      soleMemberRepId,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.repId, repId))
    .orderBy(asc(organizations.name));
  return rows.map(withPersonal);
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
  if (!managesEveryOrganization(actor)) throw new OrganizationError("Only an Xpot admin or a manager can do this.", 403, "manager_required");
  const [rep] = await db.select().from(salesReps).where(eq(salesReps.id, input.repAdminId));
  if (!rep || rep.deletedAt) throw new OrganizationError("Person not found", 404, "rep_not_found");
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

/**
 * The models to release to an organization, checked against the catalog: serialized models only (a partner never
 * prints parts), each by slug, no repeats. `null` = every model; an empty list = none.
 */
export async function validReleasedModels(slugs: readonly string[] | null): Promise<string[] | null> {
  if (slugs === null) return null;
  const unique = Array.from(new Set(slugs));
  if (!unique.length) return [];
  const known = await db.select({ slug: printModels.slug }).from(printModels)
    .where(and(inArray(printModels.slug, unique), eq(printModels.kind, "serialized")));
  const found = new Set(known.map((row) => row.slug));
  if (unique.some((slug) => !found.has(slug))) throw new OrganizationError("One of the models is not in the catalog.", 400, "print_model_unknown");
  return unique;
}

export async function updateOrganization(
  organizationId: number,
  input: { name?: string; isActive?: boolean; printsOwnPieces?: boolean; distribution?: Distribution; releasedPrintModels?: string[] | null },
  actor: OrganizationActor,
) {
  if (!managesEveryOrganization(actor)) throw new OrganizationError("Only an Xpot admin or a manager can do this.", 403, "manager_required");
  // Production is the owners' (docs/organizations-execution-plan.md): only they let a branch print its own pieces,
  // say which of our models it may print, and who handles its orders.
  if ((input.printsOwnPieces !== undefined || input.releasedPrintModels !== undefined || input.distribution !== undefined) && !actor.user.isAdmin) {
    throw new OrganizationError("Only an Xpot admin can do this.", 403, "admin_required");
  }
  const { organization } = await assertOrganizationAccess(actor, organizationId, true);
  // Who handles a partner's orders (server/tags/distribution.ts): the company is `xpot` by definition, and `own` belongs to
  // a partner that prints its own pieces (they are what it hands out), so switching printing off takes `own` with it.
  const distribution = input.distribution ?? organization.distribution;
  if (distribution === "own" && organization.slug === COMPANY_ORGANIZATION_SLUG) {
    throw new OrganizationError("The company's orders are always handled by Xpot.", 400, "distribution_company");
  }
  if (distribution === "own" && !(input.printsOwnPieces ?? organization.printsOwnPieces)) {
    throw new OrganizationError("Only a partner that prints its own pieces can handle its own distribution.", 400, "distribution_needs_production");
  }
  const { releasedPrintModels, ...rest } = input;
  // A partner only does what the platform lets it: switching printing on releases no model until the platform picks them.
  const firstRelease = input.printsOwnPieces === true && !organization.printsOwnPieces && releasedPrintModels === undefined && organization.releasedPrintModels === null;
  const [updated] = await db.update(organizations).set({
    ...rest,
    ...(releasedPrintModels !== undefined ? { releasedPrintModels: await validReleasedModels(releasedPrintModels) } : {}),
    ...(firstRelease ? { releasedPrintModels: [] } : {}),
    updatedAt: new Date(),
  }).where(eq(organizations.id, organizationId)).returning();
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
  if (!rep || rep.deletedAt) throw new OrganizationError("Person not found", 404, "rep_not_found");
  const [existing] = await db.select().from(organizationMemberships).where(and(
    eq(organizationMemberships.organizationId, organizationId),
    eq(organizationMemberships.repId, repId),
  ));
  if (existing) throw new OrganizationError("This person already belongs to the organization.", 409, "organization_member_exists");
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
    throw new OrganizationError("Make someone else an owner before removing or suspending the last one.", 409, "organization_last_admin");
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
  if (!current) throw new OrganizationError("Organization member not found", 404, "organization_member_not_found");
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
  if (!current) throw new OrganizationError("Organization member not found", 404, "organization_member_not_found");
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
  // The pieces as every Tags list gives them (with their sale and print), so each one reads as it does everywhere else.
  const { listTags } = await import("../tags/repository.js");
  return listTags({ organizationId, repId: organizationWide ? undefined : actor.rep.id, limit: 500 });
}

export async function listOrganizationKits(organizationId: number, actor: OrganizationActor) {
  const { memberships } = await assertOrganizationAccess(actor, organizationId);
  const organizationWide = canManageOrganization(actor, memberships, organizationId);
  // pieceCount: what the kit held when it went out (the rows stay when a piece comes back), so a list can say how many.
  return db.select({ ...getTableColumns(tagKits), pieceCount: sql<number>`(SELECT count(*)::int FROM tag_kit_items i WHERE i.kit_id = ${tagKits.id})` }).from(tagKits).where(organizationWide
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

export async function audit(
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
