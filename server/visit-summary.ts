import { and, eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  salesDailyRoutes,
  salesDailyRouteStops,
  salesLeadContacts,
  salesTasks,
  salesVisitNotes,
  salesVisits,
} from "#shared/schema.js";
import type { XpotVisitSummaryInput } from "#shared/xpot.js";

export async function saveVisitSummaryTransaction(input: {
  repId: number;
  visitId: number;
  leadId: number;
  input: XpotVisitSummaryInput;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select ${salesVisits.id} from ${salesVisits}
      where ${salesVisits.id} = ${input.visitId} and ${salesVisits.repId} = ${input.repId}
      for update`);
    const [visit] = await tx.select().from(salesVisits).where(and(
      eq(salesVisits.id, input.visitId),
      eq(salesVisits.repId, input.repId),
      eq(salesVisits.leadId, input.leadId),
    ));
    if (!visit) throw new Error("Visit not found");
    if (!visit.checkedOutAt) throw new Error("Finish the visit before saving its summary");

    const summaryValues = {
      visitId: input.visitId,
      createdByRepId: input.repId,
      attendeeName: input.input.attendeeName,
      summary: input.input.summary,
      outcome: input.input.outcome,
      nextStep: input.input.nextStep,
      followUpRequired: input.input.followUpRequired ?? Boolean(input.input.quickTask),
      summaryCompletedAt: new Date(),
      updatedAt: new Date(),
    };
    const [note] = await tx.insert(salesVisitNotes).values(summaryValues).onConflictDoUpdate({
      target: salesVisitNotes.visitId,
      set: summaryValues,
    }).returning();

    if (input.input.attendeeName) {
      const normalizedName = input.input.attendeeName.trim().toLowerCase();
      const [contact] = await tx.select({ id: salesLeadContacts.id }).from(salesLeadContacts).where(and(
        eq(salesLeadContacts.leadId, input.leadId),
        sql`lower(trim(${salesLeadContacts.name})) = ${normalizedName}`,
      )).limit(1);
      if (!contact) {
        const [existingContact] = await tx.select({ id: salesLeadContacts.id }).from(salesLeadContacts)
          .where(eq(salesLeadContacts.leadId, input.leadId)).limit(1);
        await tx.insert(salesLeadContacts).values({
          leadId: input.leadId,
          name: input.input.attendeeName,
          isPrimary: !existingContact,
        });
      }
    }

    let task = null;
    if (input.input.quickTask) {
      const idempotencyKey = `visit-summary:${input.visitId}`;
      const values = {
        leadId: input.leadId,
        visitId: input.visitId,
        repId: input.repId,
        createdByRepId: input.repId,
        idempotencyKey,
        type: input.input.quickTask.type ?? "follow_up",
        title: input.input.quickTask.title,
        dueAt: input.input.quickTask.dueAt ? new Date(input.input.quickTask.dueAt) : null,
        priority: input.input.quickTask.priority ?? "medium",
        status: "pending" as const,
        updatedAt: new Date(),
      };
      [task] = await tx.insert(salesTasks).values(values).onConflictDoNothing().returning();
      if (!task) {
        [task] = await tx.update(salesTasks).set(values).where(and(
          eq(salesTasks.repId, input.repId),
          eq(salesTasks.idempotencyKey, idempotencyKey),
        )).returning();
      }
    }

    const [stop] = await tx.update(salesDailyRouteStops).set({ status: "visited", updatedAt: new Date() })
      .where(eq(salesDailyRouteStops.visitId, input.visitId)).returning();
    if (stop) {
      const [route] = await tx.select().from(salesDailyRoutes).where(eq(salesDailyRoutes.id, stop.routeId));
      if (route) {
        const [remaining] = await tx.select({ count: sql<number>`count(*)::int` }).from(salesDailyRouteStops).where(and(
          eq(salesDailyRouteStops.routeId, route.id),
          eq(salesDailyRouteStops.version, route.version),
          sql`${salesDailyRouteStops.status} IN ('planned', 'in_progress', 'summary_pending')`,
        ));
        if ((remaining?.count ?? 0) === 0) {
          await tx.update(salesDailyRoutes).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
            .where(eq(salesDailyRoutes.id, route.id));
        }
      }
    }
    return { note, task };
  });
}
