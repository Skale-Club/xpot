import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { tagBatches, tagStockMovements, tags, type Tag } from "#shared/schema.js";
import { pieceAccess, receiveBlocker, receiveTargets, type ReceiveBlocker, type ReceiveTarget } from "#shared/tagCustody.js";
import type { TagActor } from "#shared/tagAccess.js";
import { tagSystemReason } from "#shared/tagReasons.js";
import { TagError } from "./errors.js";
import { journeyContext, recordJourney } from "./journey.js";
import { receivedCountOf, setTagRep } from "./repository.js";

// Custody from the phone (docs/TAG_CUSTODY_EXECUTION_PLAN.md, phase 1):
// receive a piece that was printed but never received, into the house's stock
// or the receiver's own, and hand a piece back to the house. Testing a chip
// never comes through here: receiving is always its own, explicit request.

const RECEIVE_ERRORS: Record<ReceiveBlocker, { message: string; status: number; code: string }> = {
  not_pending: { message: "This piece is already in stock", status: 409, code: "tag_not_pending" },
  no_batch: { message: "This piece has no batch to be received into", status: 409, code: "tag_no_batch" },
  batch_closed: { message: "This piece's batch is closed and no longer receives pieces", status: 409, code: "batch_closed" },
  other_organization: { message: "This piece is not in your organization", status: 403, code: "tag_not_yours" },
};

/**
 * Receive a pending piece into stock: the house's (management only) or the actor's own. The same
 * movement the intake station records (an `intake` against the piece's open batch), with the
 * piece's holder set when it goes into the actor's own stock. Custody only: no acquisition or cost
 * is recorded, so selling it still needs whatever cost the seller's policy asks for.
 * A repeat by the same person (a retried request) answers with the piece as it is.
 */
export async function receivePiece(id: string, into: ReceiveTarget, actor: TagActor): Promise<Tag> {
  let receivedCount = 0;
  let batchCount = 0;
  const result = await db.transaction(async (tx) => {
    const [tag] = await tx.select().from(tags).where(eq(tags.id, id)).for("update");
    if (!tag) throw new TagError("Tag not found", 404, "tag_not_found");
    if (pieceAccess(actor, tag) === "none") throw new TagError("This piece is not in your organization", 403, "tag_not_yours");
    if (tag.stockStatus !== "pending" && tag.registeredByUserId === actor.userId) return { tag, received: false };
    if (!receiveTargets(actor).includes(into)) {
      throw new TagError("Only management receives pieces for the house", 403, "tag_receive_house_forbidden");
    }
    const [batch] = tag.batchId
      ? await tx.select().from(tagBatches).where(eq(tagBatches.id, tag.batchId)).for("update")
      : [];
    const blocker = receiveBlocker(actor, tag, batch?.status ?? null);
    if (blocker) {
      const e = RECEIVE_ERRORS[blocker];
      throw new TagError(e.message, e.status, e.code);
    }
    if (!batch) throw new TagError(RECEIVE_ERRORS.no_batch.message, 409, RECEIVE_ERRORS.no_batch.code);
    const holder = into === "me" ? actor.repId : null;
    const now = new Date();
    const [received] = await tx.update(tags).set({
      stockStatus: "available",
      ownershipType: "company",
      repId: holder,
      custodianRepId: holder,
      kitId: null,
      registeredAt: now,
      registeredByUserId: actor.userId,
      stockUpdatedAt: now,
      updatedAt: now,
    }).where(eq(tags.id, id)).returning();
    await tx.insert(tagStockMovements).values({
      tagId: tag.id,
      movementType: "intake",
      fromStockStatus: "pending",
      toStockStatus: "available",
      fromOwnershipType: tag.ownershipType,
      toOwnershipType: "company",
      fromCustodianRepId: tag.custodianRepId,
      toCustodianRepId: holder,
      referenceType: "batch",
      referenceId: batch.id,
      actorUserId: actor.userId,
      reason: tagSystemReason("received_field"),
    });
    await tx.update(tagBatches).set({ updatedAt: now }).where(eq(tagBatches.id, batch.id));
    receivedCount = await receivedCountOf(tx, batch.id);
    batchCount = batch.quantity;
    console.log(`[tags] ${tag.publicCode} received in the app into ${into === "me" ? `rep ${actor.repId}` : "house"} (user ${actor.userId})`);
    return { tag: received, received: true };
  });
  if (result.received) {
    await recordJourney({
      kind: "execution",
      action: "piece_received_in_field",
      title: `Piece ${result.tag.publicCode} received into ${into === "me" ? "a reseller's" : "house"} stock from the phone (${receivedCount}/${batchCount})`,
      batchId: result.tag.batchId,
      tagId: result.tag.id,
      repId: result.tag.repId,
      beforeValue: "pending",
      afterValue: "available",
      metadata: { into, receivedCount, batchCount },
    }, journeyContext(actor.userId, "field", actor.repId));
  }
  return result.tag;
}

/**
 * Hand a piece back to house stock from the phone: the management side's Take back (setTagRep to
 * the house), asked by whoever may work on the piece. Its own rules refuse a sold, set-up or
 * out-of-stock piece.
 */
export async function returnPieceToHouse(id: string, actor: TagActor): Promise<Tag> {
  const [tag] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  if (!tag) throw new TagError("Tag not found", 404, "tag_not_found");
  if (pieceAccess(actor, tag) !== "full") throw new TagError("This piece is not in your kit.", 403, "tag_not_yours");
  if (tag.repId === null) throw new TagError("This piece is already in house stock", 409, "tag_already_house");
  return setTagRep(id, null, actor.userId, "field", tagSystemReason("returned_field"));
}
