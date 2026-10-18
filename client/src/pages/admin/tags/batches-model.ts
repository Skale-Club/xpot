// Batches: the production pipeline (the list grouped by stage, a batch's stage stepper) and the intake station's
// read outcomes. The stage is derived from the batch's pieces and its journey (shared/tags.ts batchStage): a "Mark as
// done" button writes the journey step, which moves the stage. Pure, unit-tested (tests/admin-tags-batches.test.ts).

import { parseTagIntakeScan } from "@shared/tagIntake";
import type { TagBatchStage } from "@shared/tags";

/** The pipeline, in order; cancelled batches are listed after it. */
export const BATCH_PIPELINE = ["issued", "built", "printed", "receiving", "received"] as const satisfies readonly TagBatchStage[];

export interface StagedBatch {
  stage: string;
  pendingCount: number;
}

/** Batches grouped by stage, pipeline order then cancelled; empty stages are left out. */
export function groupBatchesByStage<B extends StagedBatch>(batches: readonly B[]): Array<{ stage: string; batches: B[] }> {
  const order: string[] = [...BATCH_PIPELINE, "cancelled"];
  const groups = new Map<string, B[]>();
  for (const b of batches) {
    const stage = order.includes(b.stage) ? b.stage : "issued";
    groups.set(stage, [...(groups.get(stage) ?? []), b]);
  }
  return order.filter((stage) => groups.has(stage)).map((stage) => ({ stage, batches: groups.get(stage)! }));
}

/** The Overview's "batches with pieces not received" list: still expecting pieces, not cancelled. */
export const isAwaitingPieces = (b: StagedBatch) => b.pendingCount > 0 && b.stage !== "cancelled";

export type StepState = "done" | "current" | "todo";

export interface StageStep {
  stage: TagBatchStage;
  state: StepState;
  /** The journey action "Mark as done" records for this step; null when the step follows from scans. */
  markAction: "art_built" | "printed" | null;
}

/**
 * The stepper of one batch. An issued batch walks the whole pipeline; Print file ready and Printed are marked by hand
 * (a journey entry), Receiving and In stock follow from scanning the pieces. A scanned batch only receives.
 */
export function stageSteps(batch: { stage: string; codeSource: string }): StageStep[] {
  const stages: TagBatchStage[] = batch.codeSource === "scanned" ? ["receiving", "received"] : [...BATCH_PIPELINE];
  // The stage is the furthest step reached: steps up to it are done, except Receiving, which stays in progress until
  // every piece is in; the step after it is the current one.
  const at = stages.indexOf(batch.stage as TagBatchStage);
  const inProgress = batch.stage === "receiving";
  return stages.map((stage, i) => ({
    stage,
    state: i < at || (i === at && !inProgress) ? "done" : (i === at && inProgress) || (i === at + 1 && !inProgress) ? "current" : "todo",
    markAction: batch.codeSource === "scanned" ? null : stage === "built" ? "art_built" : stage === "printed" ? "printed" : null,
  }));
}

/** Can "Mark as done" be offered on this step? A hand-marked step not done yet, before any piece is received. */
export function canMarkStep(step: StageStep, batchStage: string): boolean {
  if (!step.markAction || step.state === "done") return false;
  // Once pieces are coming in, printing is evidently done; the stepper shows it as such.
  return batchStage === "issued" || batchStage === "built" || batchStage === "printed";
}

// ─── Intake station ───────────────────────────────────────────────────────────

export type ReadStatus = "added" | "duplicate" | "invalid" | "other_batch" | "closed" | "error";

/** The code a read carries, when it is an Xpot code or link; null otherwise (the station says "invalid"). */
export function readCode(raw: string, extraHosts: readonly string[] = []): string | null {
  const scan = parseTagIntakeScan(raw, extraHosts);
  return scan.ok ? scan.publicCode : null;
}

/**
 * Splits typed or pasted text into reads: one per line, comma or semicolon; a chunk with spaces is several reads
 * only when every word is a code ("A7K3P9X2 B8M4Q1Z3"), otherwise it stays one read (and is reported as one).
 */
export function splitReads(text: string): string[] {
  return text.split(/[\n\r,;]+/).map((s) => s.trim()).filter(Boolean).flatMap((chunk) => {
    const words = chunk.split(/\s+/);
    return words.length > 1 && words.every((w) => readCode(w)) ? words : [chunk];
  });
}

/**
 * The station's idempotency key for a code: stable per batch and code, so a retry of the same read (a timeout, a
 * double tap) never receives twice, whoever's browser sends it.
 */
export function intakeKey(batchId: string, code: string): string {
  return `intake:${batchId}:${code}`;
}

/** A failed read's status from the server's error code. */
export function readErrorStatus(code: string | null | undefined, status?: number): ReadStatus {
  if (code === "piece_other_batch" || code === "piece_not_in_batch") return "other_batch";
  if (code === "batch_closed") return "closed";
  if (status === 400) return "invalid";
  return "error";
}

/** Reads the station keeps on screen. */
export const STATION_READS = 10;
