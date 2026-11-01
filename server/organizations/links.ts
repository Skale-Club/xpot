import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db.js";
import { organizationAuditLog, organizationLinks, organizationMemberships, organizations, salesReps } from "#shared/schema.js";
import { managesEveryOrganization } from "#shared/organizations.js";
import { distributionForBuyer, distributionOf, type DistributionPath, type HandOutProducer } from "../tags/distribution.js";
import { OrganizationError, type OrganizationActor } from "./service.js";

// The selling organizations the platform linked to a partner whose distribution is `own` (migrations/0070,
// server/tags/distribution.ts). A link is what lets that partner's owner hand a kit to a person of the other
// organization (POST /api/xpot/admin/tag-kits); it moves no pieces and records no money by itself.

export interface OrganizationLinkItem {
  sellerId: number;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
}

async function audit(organizationId: number, action: string, actor: OrganizationActor, detail: Record<string, unknown>) {
  await db.insert(organizationAuditLog).values({ organizationId, action, actorUserId: actor.user.userId, detail });
}

function assertPlatform(actor: OrganizationActor) {
  if (!managesEveryOrganization(actor)) throw new OrganizationError("Only an Xpot admin can do this.", 403, "admin_required");
}

/** The partner the links hang from: it exists and handles its own distribution (links of an `xpot` partner mean nothing). */
async function ownProducer(producerId: number) {
  const [producer] = await db.select().from(organizations).where(eq(organizations.id, producerId));
  if (!producer) throw new OrganizationError("Organization not found", 404, "organization_not_found");
  if (distributionOf(producer).handsOutTo !== "linked_organizations") {
    throw new OrganizationError("Only a partner that handles its own distribution has linked organizations.", 400, "link_needs_own_distribution");
  }
  return producer;
}

/** The selling organizations linked to a partner, by name. Platform only. */
export async function listOrganizationLinks(producerId: number, actor: OrganizationActor): Promise<OrganizationLinkItem[]> {
  assertPlatform(actor);
  const [producer] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, producerId));
  if (!producer) throw new OrganizationError("Organization not found", 404, "organization_not_found");
  return db.select({
    sellerId: organizations.id,
    name: organizations.name,
    slug: organizations.slug,
    isActive: organizations.isActive,
    createdAt: organizationLinks.createdAt,
  })
    .from(organizationLinks)
    .innerJoin(organizations, eq(organizations.id, organizationLinks.sellerId))
    .where(eq(organizationLinks.producerId, producerId))
    .orderBy(asc(organizations.name));
}

/** Links a selling organization to a partner. Platform only; linking twice is not an error. */
export async function addOrganizationLink(producerId: number, sellerId: number, actor: OrganizationActor) {
  assertPlatform(actor);
  const producer = await ownProducer(producerId);
  if (producerId === sellerId) throw new OrganizationError("An organization can't be linked to itself.", 400, "link_self");
  const [seller] = await db.select().from(organizations).where(eq(organizations.id, sellerId));
  if (!seller) throw new OrganizationError("Organization not found", 404, "organization_not_found");
  if (!seller.isActive) throw new OrganizationError("Only an active organization can be linked.", 400, "link_inactive");
  // The company hands pieces to anyone already; linking it to a partner would only suggest the partner's pieces go there.
  if (seller.slug === "xpot-company") throw new OrganizationError("The company can't be linked to a partner.", 400, "link_company");
  const inserted = await db.insert(organizationLinks)
    .values({ producerId: producer.id, sellerId, createdByUserId: actor.user.userId })
    .onConflictDoNothing()
    .returning({ sellerId: organizationLinks.sellerId });
  if (inserted.length) await audit(producer.id, "organization_linked", actor, { sellerId });
  return listOrganizationLinks(producerId, actor);
}

/** Unlinks. Pieces already handed over stay where they are (they became the seller's). */
export async function removeOrganizationLink(producerId: number, sellerId: number, actor: OrganizationActor) {
  assertPlatform(actor);
  const removed = await db.delete(organizationLinks)
    .where(and(eq(organizationLinks.producerId, producerId), eq(organizationLinks.sellerId, sellerId)))
    .returning({ sellerId: organizationLinks.sellerId });
  if (!removed.length) throw new OrganizationError("That organization is not linked.", 404, "link_not_found");
  await audit(producerId, "organization_unlinked", actor, { sellerId });
  return listOrganizationLinks(producerId, actor);
}

/** The partners among these organizations (an owner's scope) with the sellers linked to each: what handOutSource decides on. */
export async function handOutProducers(organizationIds: readonly number[]): Promise<HandOutProducer[]> {
  if (!organizationIds.length) return [];
  const rows = await db.select({
    id: organizations.id,
    distribution: organizations.distribution,
    isActive: organizations.isActive,
    sellerId: organizationLinks.sellerId,
  })
    .from(organizations)
    .leftJoin(organizationLinks, eq(organizationLinks.producerId, organizations.id))
    .where(inArray(organizations.id, [...organizationIds]));
  const byId = new Map<number, HandOutProducer & { linkedSellerIds: number[] }>();
  for (const row of rows) {
    const producer = byId.get(row.id) ?? { id: row.id, distribution: row.distribution, isActive: row.isActive, linkedSellerIds: [] };
    if (row.sellerId !== null) producer.linkedSellerIds.push(row.sellerId);
    byId.set(row.id, producer);
  }
  return Array.from(byId.values());
}

/** A person of a linked organization, shaped like the hand-out form's reseller (client Reseller) plus the organization. */
export interface HandOutRecipient {
  id: number;
  displayName: string;
  email: string | null;
  team: string | null;
  role: string;
  isActive: boolean;
  modules: string[] | null;
  costPolicy: string;
  costPolicyConfiguredAt: Date | null;
  blockedAt: Date | null;
  organizationId: number;
  organizationName: string;
}

/**
 * Who an owner may hand a kit to besides the people of their own organizations: the active people of the selling
 * organizations linked to the partners among them that handle their own distribution. Labelled with the organization.
 */
export async function handOutRecipients(organizationIds: readonly number[]): Promise<HandOutRecipient[]> {
  const linked = (await handOutProducers(organizationIds))
    .filter((producer) => producer.isActive && distributionOf(producer).handsOutTo === "linked_organizations");
  const sellerIds = Array.from(new Set(linked.flatMap((producer) => producer.linkedSellerIds)));
  if (!sellerIds.length) return [];
  return db.select({
    id: salesReps.id,
    displayName: salesReps.displayName,
    email: salesReps.email,
    team: salesReps.team,
    role: salesReps.role,
    isActive: salesReps.isActive,
    modules: salesReps.modules,
    costPolicy: salesReps.costPolicy,
    costPolicyConfiguredAt: salesReps.costPolicyConfiguredAt,
    blockedAt: salesReps.blockedAt,
    organizationId: organizations.id,
    organizationName: organizations.name,
  })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .innerJoin(salesReps, eq(salesReps.id, organizationMemberships.repId))
    .where(and(
      inArray(organizationMemberships.organizationId, sellerIds),
      eq(organizations.isActive, true),
      eq(organizationMemberships.isActive, true),
      isNull(organizationMemberships.blockedAt),
      eq(salesReps.isActive, true),
      isNull(salesReps.deletedAt),
    ))
    .orderBy(asc(organizations.name), asc(salesReps.displayName));
}

/**
 * Which distribution path a person's orders follow: their organization's (the newest active membership, as
 * organizationIdForRep picks it), or that of an `own` partner their organization is linked to. Read-only: unlike
 * organizationIdForRep it never creates a workspace, so a verification call has no side effect. Someone with no
 * organization follows today's path.
 */
export async function distributionForRep(repId: number): Promise<{ path: DistributionPath; partner: { id: number; name: string } | null }> {
  const [membership] = await db.select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(and(
      eq(organizationMemberships.repId, repId),
      eq(organizationMemberships.isActive, true),
      isNull(organizationMemberships.blockedAt),
    ))
    .orderBy(desc(organizationMemberships.updatedAt))
    .limit(1);
  if (!membership) return { path: distributionForBuyer(null, []), partner: null };
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, membership.organizationId));
  const producers = await db.select({ id: organizations.id, name: organizations.name, distribution: organizations.distribution })
    .from(organizationLinks)
    .innerJoin(organizations, eq(organizations.id, organizationLinks.producerId))
    .where(and(eq(organizationLinks.sellerId, membership.organizationId), eq(organizations.distribution, "own"), eq(organizations.isActive, true)))
    .orderBy(asc(organizations.id));
  // An inactive partner no longer hands out, so it doesn't pull its people off Stuscle either.
  const path = distributionForBuyer(organization, producers);
  if (path.distribution !== "own") return { path, partner: null };
  const partner = organization?.distribution === "own" ? organization : producers[0];
  return { path, partner: partner ? { id: partner.id, name: partner.name } : null };
}
