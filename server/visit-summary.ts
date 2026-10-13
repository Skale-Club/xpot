import { and, eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  salesLeadContacts,
  salesLeads,
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
    const [lead] = await tx.select({ organizationId: salesLeads.organizationId })
      .from(salesLeads)
      .where(eq(salesLeads.id, input.leadId));
    if (!lead) throw new Error("Lead not found");

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
        organizationId: lead.organizationId,
        leadId: input.leadId,
        visitId: input.visitId,
        repId: input.repId,
        createdByRepId: input.repId,
        source: "manual",
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
          eq(salesTasks.organizationId, lead.organizationId),
          eq(salesTasks.source, "manual"),
          eq(salesTasks.idempotencyKey, idempotencyKey),
        )).returning();
      }
    }

    return { note, task };
  });
}
