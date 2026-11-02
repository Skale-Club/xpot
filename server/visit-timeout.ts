import { and, eq, lte } from "drizzle-orm";
import { db } from "./db.js";
import { salesVisits } from "#shared/schema.js";
import { VISIT_MAX_SECONDS, visitDeadline } from "#shared/visit-time-limit.js";
import { markStopOfVisitFinished } from "./prospecting/visit-sync.js";

/** Safe across workers: only still-active rows are locked and changed, in one transaction. */
export async function expireOverdueVisits(repId?: number, now = new Date()) {
  return db.transaction(async (tx) => {
    const due = await tx.select().from(salesVisits).where(and(
      eq(salesVisits.status, "in_progress"),
      lte(salesVisits.checkedInAt, new Date(now.getTime() - VISIT_MAX_SECONDS * 1000)),
      repId == null ? undefined : eq(salesVisits.repId, repId),
    )).orderBy(salesVisits.id).limit(100).for("update", { skipLocked: true });
    for (const visit of due) {
      const deadline = visitDeadline(visit.checkedInAt!);
      await tx.update(salesVisits).set({
        status: "cancelled",
        expiredAt: deadline,
        checkedOutAt: deadline,
        // The actual departure is unknown. Four hours is a limit, not time spent visiting.
        durationSeconds: null,
        checkOutLat: null,
        checkOutLng: null,
        updatedAt: now,
      }).where(eq(salesVisits.id, visit.id));
      await markStopOfVisitFinished(tx, visit.id, true, "visit_timeout");
    }
    return due.length;
  });
}

/** Runs even with every browser closed; a restart catches up on overdue visits. */
export function startVisitTimeoutWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const expired = await expireOverdueVisits();
      if (expired) console.info("[visit-timeout] expired visits", { count: expired });
    } catch (error) {
      console.error("[visit-timeout] scan failed", error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 30_000);
  timer.unref();
  return () => clearInterval(timer);
}
