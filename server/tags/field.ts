import { desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { salesLeads, tagDestinationHistory, tagDirectWrites, tagProvisioningEvents, tags, type Tag } from "#shared/schema.js";
import { buildTagUrls, defaultUtmEnabled } from "#shared/tags.js";
import { canWorkOnTag, saleCredit, type TagActor } from "#shared/tagAccess.js";
import { decidePhoneWrite, type DirectWriteMethod } from "#shared/tagApp.js";
import type { DirectWriteItem } from "#shared/tagsApi.js";
import { createLeadForSale, leadUsableBy, markLeadCustomer, TagError, type Tx } from "./repository.js";

// Server side of the Tags field app: the one-shot operations behind "tap the
// piece, pick the customer, paste the link, done". Same rules as the admin
// flow, packed into what a phone needs.

function assertCanWork(actor: TagActor, tag: Pick<Tag, "repId">) {
  if (!canWorkOnTag(actor, tag)) throw new TagError("This piece is not in your kit.", 403);
}

/** An existing lead the actor may sell to. */
async function pickLead(tx: Tx, actor: TagActor, leadId: number): Promise<number> {
  if (!(await leadUsableBy(actor, leadId, tx))) throw new TagError("Customer not found", 404);
  return leadId;
}

export interface QuickActivateInput {
  destinationUrl: string;
  destinationType: string;
  /** An existing customer (Xpot lead), or… */
  leadId?: number | null;
  /** …the name of a new one, created in the same transaction. */
  leadName?: string | null;
  label?: string | null;
}

/**
 * Link + customer + activation in one transaction. Keeps every rule of the
 * step-by-step admin flow (history row, no owner change on a live tag, retired
 * stays retired) and credits the sale to the reseller holding the piece.
 */
export async function quickActivateTag(id: string, input: QuickActivateInput, actor: TagActor): Promise<Tag> {
  return db.transaction(async (tx) => {
    const [tag] = await tx.select().from(tags).where(eq(tags.id, id)).for("update");
    if (!tag) throw new TagError("Tag not found", 404);
    assertCanWork(actor, tag);
    if (tag.status === "retired") throw new TagError("A retired tag cannot be edited", 409);

    let leadId = tag.leadId;
    const newName = input.leadName?.trim();
    if (input.leadId && input.leadId !== tag.leadId) {
      leadId = await pickLead(tx, actor, input.leadId);
    } else if (!input.leadId && newName) {
      // A business met in the field belongs to the reseller who sold it.
      leadId = await createLeadForSale(tx, newName, tag.repId ?? actor.repId);
    }
    if (!leadId) throw new TagError("Choose the customer before activating", 409);

    const changingOwner = leadId !== tag.leadId;
    if (changingOwner && tag.leadId && tag.status === "active") {
      throw new TagError("Disable the tag before moving it to another customer", 409);
    }

    const now = new Date();
    if (tag.destinationUrl !== input.destinationUrl || tag.destinationType !== input.destinationType) {
      await tx.insert(tagDestinationHistory).values({
        tagId: tag.id,
        previousUrl: tag.destinationUrl,
        newUrl: input.destinationUrl,
        previousDestinationType: tag.destinationType,
        newDestinationType: input.destinationType,
        changedByUserId: actor.userId,
        reason: changingOwner && tag.leadId ? "Re-assigned to another customer (field app)" : "Configured in the field app",
      });
    }

    // UTMs follow the default the first time a destination is set (or when
    // the piece changes hands); a later manual choice is kept.
    const keepUtm = !!tag.destinationUrl && !changingOwner && tag.destinationType === input.destinationType;
    const [updated] = await tx
      .update(tags)
      .set({
        leadId,
        destinationUrl: input.destinationUrl,
        destinationType: input.destinationType,
        utmEnabled: keepUtm ? tag.utmEnabled : defaultUtmEnabled(input.destinationType),
        utmCampaign: changingOwner ? null : tag.utmCampaign,
        ...(input.label !== undefined ? { label: input.label } : {}),
        status: "active",
        assignedAt: changingOwner || !tag.assignedAt ? now : tag.assignedAt,
        activatedAt: tag.status === "active" ? tag.activatedAt : now,
        activatedByRepId: tag.status === "active" ? tag.activatedByRepId : actor.repId,
        ...saleCredit(tag, actor.repId, now),
        disabledAt: null,
        updatedAt: now,
      })
      .where(eq(tags.id, id))
      .returning();
    await markLeadCustomer(tx, leadId);
    console.log(`[tags] quick-activate ${tag.publicCode}: ${tag.status} → active (rep ${actor.repId})`);
    return updated;
  });
}

/**
 * The phone wrote (or the operator wrote through another app) the tag's NFC
 * URL into the chip. The server decides what that proves — see decidePhoneWrite.
 */
export async function recordPhoneWrite(
  id: string,
  report: { readbackUrl?: string | null; method: DirectWriteMethod },
  baseUrl: string,
  actor: TagActor,
) {
  return db.transaction(async (tx) => {
    const [tag] = await tx.select().from(tags).where(eq(tags.id, id)).for("update");
    if (!tag) throw new TagError("Tag not found", 404);
    assertCanWork(actor, tag);
    const { nfcUrl } = buildTagUrls(baseUrl, tag.publicCode);
    const decision = decidePhoneWrite(nfcUrl, report.readbackUrl);
    const now = new Date();
    await tx
      .update(tags)
      .set({
        nfcProvisioningStatus: decision.status,
        nfcProgrammedAt: decision.ok ? now : tag.nfcProgrammedAt,
        nfcVerifiedAt: decision.status === "verified" ? now : null,
        nfcProvisioningDeviceId: null,
        updatedAt: now,
      })
      .where(eq(tags.id, id));
    await tx.insert(tagProvisioningEvents).values({
      jobId: null,
      tagId: tag.id,
      deviceId: null,
      eventType: decision.status === "verified" ? "verification_passed" : decision.ok ? "write_completed" : "verification_failed",
      detail: { source: "field_app", method: report.method, userId: actor.userId },
    });
    console.log(`[tags] phone write ${tag.publicCode}: ${decision.status} (${report.method}, rep ${actor.repId})`);
    if (!decision.ok) throw new TagError(decision.error, 409);
    return { status: decision.status, expectedUrl: nfcUrl };
  });
}

// ─── Direct pieces ────────────────────────────────────────────────────────────

export interface DirectWriteInput {
  url: string;
  label?: string | null;
  leadId?: number | null;
  leadName?: string | null;
  method: DirectWriteMethod;
  verified: boolean;
}

export async function recordDirectWrite(input: DirectWriteInput, actor: TagActor): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    let leadId: number | null = null;
    const newName = input.leadName?.trim();
    if (input.leadId) leadId = await pickLead(tx, actor, input.leadId);
    else if (newName) leadId = await createLeadForSale(tx, newName, actor.repId);
    const [row] = await tx
      .insert(tagDirectWrites)
      .values({
        leadId,
        repId: actor.repId,
        url: input.url,
        label: input.label ?? null,
        method: input.method,
        verified: input.verified,
        writtenByUserId: actor.userId,
      })
      .returning({ id: tagDirectWrites.id });
    return row;
  });
}

/** A reseller sees only the direct pieces they wrote; managers see all. */
export async function listDirectWrites(actor: TagActor, limit = 30): Promise<DirectWriteItem[]> {
  const list = await db
    .select({
      id: tagDirectWrites.id,
      url: tagDirectWrites.url,
      label: tagDirectWrites.label,
      leadId: tagDirectWrites.leadId,
      leadName: salesLeads.name,
      method: tagDirectWrites.method,
      verified: tagDirectWrites.verified,
      createdAt: tagDirectWrites.createdAt,
    })
    .from(tagDirectWrites)
    .leftJoin(salesLeads, eq(salesLeads.id, tagDirectWrites.leadId))
    .where(actor.isManager ? undefined : eq(tagDirectWrites.repId, actor.repId))
    .orderBy(desc(tagDirectWrites.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return list.map((r) => ({ ...r, leadName: r.leadName ?? null, createdAt: new Date(r.createdAt).toISOString() }));
}
