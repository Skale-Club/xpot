// Deleting a rep's account on request (Admin › Reps › Delete account).
//
// What goes:
//   - the sign-in identity: the users row (or its personal fields, see below),
//     open sessions, pending sign-in codes, the Supabase Auth user, MCP access,
//     the Xphere connection;
//   - everything the rep recorded: their visits with notes, transcripts and
//     voice notes, opportunities, tasks, suggested visit actions;
//   - the businesses (leads) they own, with everything under them, EXCEPT a
//     business that has sales or consignment records (see below);
//   - every file they uploaded: voice notes, business photos (also when the
//     photo sits on someone else's lead), their profile picture.
//
// What stays, and why:
//   - sales, sale items, consignments and stock movements: Skale Club's
//     financial records, kept for accounting. A business they belong to stays
//     too, without an owner (an admin can reassign it).
//   - tag kits and pieces the rep held (physical inventory).
//   Those rows need a valid rep_id, so when any exist the sales_reps row stays
//   as an anonymous placeholder ("Deleted account", no name, phone, email,
//   photo or codes; deleted_at set) and the users row loses every personal
//   field. When nothing references them, both rows are deleted outright.
//
// The database part is one transaction; files and the Supabase Auth user are
// removed after it commits, best-effort and logged (storage can be retried by
// running the migration/sweep again; the rows are already gone).

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db.js";
import { deleteLeadRows } from "./storage.js";
import {
  authPhoneCodes,
  mcpOauthCodes,
  mcpOauthTokens,
  mcpTokens,
  salesConsignments,
  salesLeads,
  salesOpportunitiesLocal,
  salesReps,
  salesSales,
  salesSyncEvents,
  salesTasks,
  salesVisitActions,
  salesVisitNotes,
  salesVisits,
  users,
  xphereIntegrations,
} from "#shared/schema.js";
import { discardFiles, sweepRepFiles, uploaderRepId } from "./lib/files.js";
import { getSupabaseAdmin } from "./lib/supabase.js";

export class AccountDeletionError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface AccountDeletionResult {
  repId: number;
  /** "deleted": rows removed. "anonymized": kept as a placeholder for retained records. */
  account: "deleted" | "anonymized";
  leadsDeleted: number;
  /** Businesses kept (they have sales/consignments), now without an owner. */
  leadsUnassigned: number;
  visitsDeleted: number;
  files: { deleted: number; failed: number };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const isForeignKeyViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23503" || e?.cause?.code === "23503";
};

/** Try a statement inside a savepoint; false if a foreign key still points at the row. */
async function tryDelete(tx: Tx, run: (sp: Tx) => Promise<unknown>): Promise<boolean> {
  try {
    await tx.transaction(async (sp) => {
      await run(sp);
    });
    return true;
  } catch (err) {
    if (isForeignKeyViolation(err)) return false;
    throw err;
  }
}

/** The database half. Exported for tests; use deleteRepAccount. */
export async function deleteRepAccountRows(repId: number) {
  return db.transaction(async (tx) => {
    const [rep] = await tx.select().from(salesReps).where(eq(salesReps.id, repId));
    if (!rep || rep.deletedAt) throw new AccountDeletionError("Rep not found", 404);
    const [user] = await tx.select().from(users).where(eq(users.id, rep.userId));
    const files: string[] = [rep.avatarUrl, user?.profileImageUrl].filter((f): f is string => Boolean(f));

    // Businesses the rep owns: delete, unless sales/consignments must be kept.
    const ownedLeadIds = (await tx.select({ id: salesLeads.id }).from(salesLeads).where(eq(salesLeads.ownerRepId, repId))).map((l) => l.id);
    const retainedLeadIds = new Set<number>();
    if (ownedLeadIds.length) {
      const [withSales, withConsignments] = await Promise.all([
        tx.selectDistinct({ id: salesSales.leadId }).from(salesSales).where(inArray(salesSales.leadId, ownedLeadIds)),
        tx.selectDistinct({ id: salesConsignments.leadId }).from(salesConsignments).where(inArray(salesConsignments.leadId, ownedLeadIds)),
      ]);
      for (const row of [...withSales, ...withConsignments]) retainedLeadIds.add(row.id);
    }
    const deletableLeadIds = ownedLeadIds.filter((id) => !retainedLeadIds.has(id));
    let visitsDeleted = deletableLeadIds.length
      ? (await tx.select({ id: salesVisits.id }).from(salesVisits).where(inArray(salesVisits.leadId, deletableLeadIds))).length
      : 0;
    for (const leadId of deletableLeadIds) files.push(...(await deleteLeadRows(tx, leadId)));
    if (retainedLeadIds.size) {
      await tx.update(salesLeads).set({ ownerRepId: null, updatedAt: new Date() }).where(inArray(salesLeads.id, Array.from(retainedLeadIds)));
    }

    // The rep's own visits on businesses that stay (someone else's, or retained).
    const visitIds = (await tx.select({ id: salesVisits.id }).from(salesVisits).where(eq(salesVisits.repId, repId))).map((v) => v.id);
    if (visitIds.length) {
      const notes = await tx.select({ audioUrl: salesVisitNotes.audioUrl }).from(salesVisitNotes).where(inArray(salesVisitNotes.visitId, visitIds));
      files.push(...notes.map((n) => n.audioUrl).filter((u): u is string => Boolean(u)));
      // Other people's follow-ups outlive the visit, as in deleteSalesVisit.
      await tx.update(salesTasks).set({ visitId: null }).where(inArray(salesTasks.visitId, visitIds));
      await tx.update(salesOpportunitiesLocal).set({ visitId: null }).where(inArray(salesOpportunitiesLocal.visitId, visitIds));
      await tx.delete(salesVisitNotes).where(inArray(salesVisitNotes.visitId, visitIds));
      // sales_visit_actions cascade; sales and stock movements keep the sale, visit_id → NULL.
      await tx.delete(salesVisits).where(inArray(salesVisits.id, visitIds));
      visitsDeleted += visitIds.length;
    }

    // Opportunities, tasks and suggested actions the rep owns anywhere.
    const opportunityIds = (await tx.select({ id: salesOpportunitiesLocal.id }).from(salesOpportunitiesLocal).where(eq(salesOpportunitiesLocal.repId, repId))).map((o) => o.id);
    if (opportunityIds.length) {
      await tx.delete(salesTasks).where(inArray(salesTasks.opportunityId, opportunityIds));
      await tx.delete(salesSyncEvents).where(and(eq(salesSyncEvents.entityType, "sales_opportunity"), inArray(salesSyncEvents.entityId, opportunityIds.map(String))));
      await tx.delete(salesOpportunitiesLocal).where(inArray(salesOpportunitiesLocal.id, opportunityIds));
    }
    await tx.delete(salesTasks).where(eq(salesTasks.repId, repId));
    await tx.delete(salesVisitActions).where(eq(salesVisitActions.repId, repId));
    await tx.update(salesVisitNotes).set({ createdByRepId: null }).where(eq(salesVisitNotes.createdByRepId, repId));

    // Photos the rep uploaded to businesses that stay.
    const withTheirPhotos = await tx
      .select({ id: salesLeads.id, photos: salesLeads.photos })
      .from(salesLeads)
      .where(sql`${salesLeads.photos}::text LIKE ${`%photos/${repId}/%`}`);
    for (const lead of withTheirPhotos) {
      const theirs = (lead.photos ?? []).filter((p) => uploaderRepId(p) === repId);
      if (!theirs.length) continue;
      files.push(...theirs);
      await tx.update(salesLeads).set({ photos: (lead.photos ?? []).filter((p) => !theirs.includes(p)), updatedAt: new Date() }).where(eq(salesLeads.id, lead.id));
    }

    // Sign-in identity and connections.
    await tx.execute(sql`DELETE FROM sessions WHERE sess->>'userId' = ${rep.userId}`);
    if (user?.phone) await tx.delete(authPhoneCodes).where(eq(authPhoneCodes.phone, user.phone));
    await tx.delete(xphereIntegrations).where(eq(xphereIntegrations.userId, rep.userId));
    await tx.delete(mcpOauthCodes).where(eq(mcpOauthCodes.userId, rep.userId));
    await tx.delete(mcpOauthTokens).where(eq(mcpOauthTokens.userId, rep.userId));
    // Static MCP tokens are an admin's audit trail: revoke, don't erase.
    await tx.update(mcpTokens).set({ revokedAt: new Date() }).where(and(eq(mcpTokens.createdByUserId, rep.userId), isNull(mcpTokens.revokedAt)));

    // The rows themselves: gone if nothing retained points at them, else anonymized.
    const repGone = await tryDelete(tx, (sp) => sp.delete(salesReps).where(eq(salesReps.id, repId)));
    if (repGone) {
      if (!(await tryDelete(tx, (sp) => sp.delete(users).where(eq(users.id, rep.userId))))) {
        throw new Error(`users row ${rep.userId} is still referenced after its rep was deleted`);
      }
    } else {
      await tx.update(salesReps).set({
        displayName: "Deleted account",
        email: null,
        phone: null,
        team: null,
        vcardId: null,
        avatarUrl: null,
        ghlUserId: null,
        wholesaleCode: null,
        isActive: false,
        blockedAt: rep.blockedAt ?? new Date(),
        blockedReason: null,
        deletedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(salesReps.id, repId));
      await tx.update(users).set({
        email: null,
        phone: null,
        firstName: null,
        lastName: null,
        profileImageUrl: null,
        isAdmin: false,
        updatedAt: new Date(),
      }).where(eq(users.id, rep.userId));
    }

    return {
      rep,
      files,
      account: (repGone ? "deleted" : "anonymized") as AccountDeletionResult["account"],
      leadsDeleted: deletableLeadIds.length,
      leadsUnassigned: retainedLeadIds.size,
      visitsDeleted,
    };
  });
}

/**
 * Delete a rep's account and data. Platform admins only, never yourself.
 * Throws AccountDeletionError for a refusal (status says why).
 */
export async function deleteRepAccount(
  repId: number,
  actor: { userId: string; isAdmin: boolean },
): Promise<AccountDeletionResult> {
  if (!actor.isAdmin) throw new AccountDeletionError("Only an admin can delete an account.", 403);
  const [target] = await db.select({ userId: salesReps.userId }).from(salesReps).where(eq(salesReps.id, repId));
  if (target?.userId === actor.userId) throw new AccountDeletionError("You can't delete your own account here.", 400);

  const result = await deleteRepAccountRows(repId);
  const context = `account of rep #${repId} deleted`;

  const listed = await discardFiles(result.files, context);
  // Anything else under their folders: replaced voice notes, removed photos from before cleanup existed.
  const swept = await sweepRepFiles(repId, context);

  // Google sign-ins have a Supabase Auth user with the same id; phone accounts don't.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { error } = await getSupabaseAdmin().auth.admin.deleteUser(result.rep.userId);
      if (error && error.status !== 404) console.error(`[accounts] ${context}: Supabase Auth user not deleted:`, error.message);
    } catch (err) {
      console.error(`[accounts] ${context}: Supabase Auth user not deleted:`, (err as Error).message);
    }
  }

  const summary: AccountDeletionResult = {
    repId,
    account: result.account,
    leadsDeleted: result.leadsDeleted,
    leadsUnassigned: result.leadsUnassigned,
    visitsDeleted: result.visitsDeleted,
    files: { deleted: listed.deleted + swept.deleted, failed: listed.failed + swept.failed },
  };
  console.log(`[accounts] rep #${repId} deleted by ${actor.userId}:`, JSON.stringify(summary));
  return summary;
}
