import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { organizationAuditLog, organizationMemberships, organizations, salesReps, users } from "#shared/schema.js";
import { PRINT_MODEL_SLUG_PATTERN } from "#shared/printProduction.js";
import { XPOT_MODULES, repModules } from "#shared/modules.js";
import { normalizePhone } from "#shared/phone.js";
import { AccountError, createResellerAccount } from "../routes/xpot/resellerAccounts.js";
import { OrganizationError, validReleasedModels, type OrganizationActor } from "./service.js";

// A new partner in one step (docs/PROFILES_EXECUTION_PLAN.md, F5): the person who owns it, the organization (it prints
// its own pieces) and the models we release to it. The next step is pairing their print station.

export const partnerInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(4).max(40),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
  /** Slugs of the models they may print (the platform's catalog); empty: none yet. */
  releasedPrintModels: z.array(z.string().regex(PRINT_MODEL_SLUG_PATTERN)).max(200).default([]),
}).strict();
export type PartnerInput = z.infer<typeof partnerInputSchema>;

function slugBase(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "partner";
}

/**
 * The owner's account: the one that already signs in with that phone, or a new one made now. Nothing is written when
 * the person cannot be the owner (blocked, or not a rep account).
 */
async function ownerAccount(input: PartnerInput, actor: OrganizationActor): Promise<{ repId: number; created: boolean }> {
  const phone = normalizePhone(input.phone, input.countryCode);
  if (!phone) throw new AccountError("Enter a valid phone number, with the country code if it isn't a US number.", 400, "phone_invalid");
  const [existing] = await db.select({ rep: salesReps }).from(users)
    .innerJoin(salesReps, eq(salesReps.userId, users.id)).where(eq(users.phone, phone)).limit(1);
  if (!existing) {
    const rep = await createResellerAccount(
      { displayName: input.ownerName, phone: input.phone, countryCode: input.countryCode, role: "rep", modules: [...XPOT_MODULES], costPolicy: "acquisition" },
      { userId: actor.user.userId, isAdmin: actor.user.isAdmin },
      { createOrganization: false },
    );
    return { repId: rep.id, created: true };
  }
  const { rep } = existing;
  if (rep.deletedAt || rep.blockedAt || !rep.isActive) {
    throw new OrganizationError("This person's access is blocked or not approved yet. Approve them in People first.", 409, "partner_owner_inactive");
  }
  // They print, so Tags must be on for them (the platform's owners always have every module).
  if (!repModules(rep).includes("tags")) {
    await db.update(salesReps).set({ modules: [...rep.modules, "tags"], updatedAt: new Date() }).where(eq(salesReps.id, rep.id));
  }
  return { repId: rep.id, created: false };
}

/**
 * Creates the partner: the owner's account (or the existing one with that phone), the organization that prints its
 * own pieces with the released models, and the owner's membership. Everything is checked before anything is written;
 * the organization, the membership and the audit trail go in one transaction. If that transaction fails after a new
 * account was made, the account stays (it is not lost: the same phone is reused on the retry).
 */
export async function createPartner(input: PartnerInput, actor: OrganizationActor) {
  if (!actor.user.isAdmin) throw new OrganizationError("Only an Xpot admin can do this.", 403, "admin_required");
  const released = (await validReleasedModels(input.releasedPrintModels)) ?? [];
  const { repId, created } = await ownerAccount(input, actor);
  const slug = `${slugBase(input.name)}-${randomBytes(3).toString("hex")}`;
  return db.transaction(async (tx) => {
    const [organization] = await tx.insert(organizations).values({
      name: input.name,
      slug,
      printsOwnPieces: true,
      releasedPrintModels: released,
      createdByUserId: actor.user.userId,
    }).returning();
    await tx.insert(organizationMemberships).values({
      organizationId: organization.id,
      repId,
      role: "admin",
      createdByUserId: actor.user.userId,
    });
    await tx.insert(organizationAuditLog).values({
      organizationId: organization.id,
      action: "partner_created",
      targetRepId: repId,
      actorUserId: actor.user.userId,
      detail: { name: organization.name, ownerRepId: repId, newAccount: created, releasedPrintModels: released },
    });
    return organization;
  });
}
