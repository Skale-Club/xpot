import { desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { salesLeads, tagDestinationHistory, tagDirectWrites, tagProvisioningEvents, tags, type Tag } from "#shared/schema.js";
import { buildTagUrls, defaultUtmEnabled } from "#shared/tags.js";
import { activationCredit, canWorkOnTag, type TagActor } from "#shared/tagAccess.js";
import { decidePhoneWrite, type DirectWriteMethod } from "#shared/tagApp.js";
import type { DirectWriteItem } from "#shared/tagsApi.js";
import { createLeadForSale, leadUsableBy, rememberLeadPlace, TagError, type Tx } from "./repository.js";
import { journeyContext, recordJourney } from "./journey.js";
import { placeIdFromReviewUrl } from "#shared/reviewLink.js";

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
 * stays retired). Activation is operational setup; financial sale is separate.
 */
export async function quickActivateTag(id: string, input: QuickActivateInput, actor: TagActor): Promise<Tag> {
  let before: Tag | null = null;
  const updated = await db.transaction(async (tx) => {
    const [tag] = await tx.select().from(tags).where(eq(tags.id, id)).for("update");
    if (!tag) throw new TagError("Tag not found", 404);
    assertCanWork(actor, tag);
    before = tag;
    if (tag.status === "retired") throw new TagError("A retired tag cannot be edited", 409);

    let leadId = tag.leadId;
    const newName = input.leadName?.trim();
    if (input.leadId && input.leadId !== tag.leadId) {
      leadId = await pickLead(tx, actor, input.leadId);
    } else if (!input.leadId && newName) {
      // A business met in the field belongs to the reseller configuring it.
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
        ...activationCredit(tag, actor.repId),
        disabledAt: null,
        updatedAt: now,
      })
      .where(eq(tags.id, id))
      .returning();
    if (input.destinationType === "google_review") await rememberLeadPlace(tx, leadId, placeIdFromReviewUrl(input.destinationUrl));
    console.log(`[tags] quick-activate ${tag.publicCode}: ${tag.status} → active (rep ${actor.repId})`);
    return updated;
  });
  const old = before as Tag | null;
  const ctx = journeyContext(actor.userId, "field", actor.repId);
  if (old?.status === "active") {
    // Already live: only a changed destination is worth a line.
    if (old.destinationUrl !== updated.destinationUrl || old.destinationType !== updated.destinationType) {
      await recordJourney({
        kind: "execution",
        action: "destination_changed",
        title: `Destination of ${updated.publicCode} changed in the app`,
        tagId: id,
        beforeValue: old.destinationUrl,
        afterValue: updated.destinationUrl,
        metadata: { previousType: old.destinationType, newType: updated.destinationType },
      }, ctx);
    }
  } else if (old) {
    await recordJourney({
      kind: "execution",
      action: "tag_activated",
      title: `Tag ${updated.publicCode} activated in the app`,
      tagId: id,
      leadId: updated.leadId,
      beforeValue: old.status,
      afterValue: updated.status,
      metadata: { destinationType: updated.destinationType, destinationUrl: updated.destinationUrl },
    }, ctx);
  }
  return updated;
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
  let publicCode = "";
  const result = await db.transaction(async (tx) => {
    const [tag] = await tx.select().from(tags).where(eq(tags.id, id)).for("update");
    if (!tag) throw new TagError("Tag not found", 404);
    assertCanWork(actor, tag);
    publicCode = tag.publicCode;
    if (tag.nfcProvisioningStatus === "locked") throw new TagError("This chip is locked and cannot be rewritten", 409);
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
  // Only a successful write is a milestone; a refused one threw above.
  await recordJourney({
    kind: "execution",
    action: result.status === "verified" ? "nfc_verified" : "nfc_written",
    title: result.status === "verified"
      ? `NFC chip of ${publicCode} written and verified (phone)`
      : `NFC chip of ${publicCode} written, not read back (phone)`,
    tagId: id,
    afterValue: result.expectedUrl,
    metadata: { method: report.method },
  }, journeyContext(actor.userId, "field", actor.repId));
  return result;
}

/**
 * The phone made the chip read-only (Web NFC makeReadOnly). Only a written
 * chip can be locked; once locked it can never be rewritten, which is exactly
 * what an Xpot piece wants: the chip keeps /n/<code> forever and the
 * destination keeps changing on the server.
 */
export async function recordPhoneLock(id: string, actor: TagActor) {
  let publicCode = "";
  await db.transaction(async (tx) => {
    const [tag] = await tx.select().from(tags).where(eq(tags.id, id)).for("update");
    if (!tag) throw new TagError("Tag not found", 404);
    assertCanWork(actor, tag);
    publicCode = tag.publicCode;
    if (tag.nfcProvisioningStatus === "locked") return;
    if (tag.nfcProvisioningStatus !== "verified" && tag.nfcProvisioningStatus !== "programmed") {
      throw new TagError("Write the chip before locking it", 409);
    }
    const now = new Date();
    await tx.update(tags).set({ nfcProvisioningStatus: "locked", nfcLockedAt: now, updatedAt: now }).where(eq(tags.id, id));
    await tx.insert(tagProvisioningEvents).values({
      jobId: null,
      tagId: tag.id,
      deviceId: null,
      eventType: "lock_completed",
      detail: { source: "field_app", userId: actor.userId },
    });
    console.log(`[tags] phone lock ${tag.publicCode} (rep ${actor.repId})`);
  });
  await recordJourney({
    kind: "execution",
    action: "nfc_locked",
    title: `NFC chip of ${publicCode} locked (phone)`,
    tagId: id,
  }, journeyContext(actor.userId, "field", actor.repId));
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
  let ownerId: number | null = null;
  const written = await db.transaction(async (tx) => {
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
    if (leadId) await rememberLeadPlace(tx, leadId, placeIdFromReviewUrl(input.url));
    ownerId = leadId;
    return row;
  });
  await recordJourney({
    kind: "execution",
    action: "direct_write",
    title: `Direct NFC piece written${input.label ? `: ${input.label}` : ""}`,
    leadId: ownerId,
    afterValue: input.url,
    metadata: { directWriteId: written.id, method: input.method, verified: input.verified },
  }, journeyContext(actor.userId, "field", actor.repId));
  return written;
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
