import { createHash } from "crypto";
import { lt } from "drizzle-orm";
import { db } from "../db.js";
import { systemEvents, type SystemEventLevel, type SystemEventSource } from "#shared/schema.js";

/**
 * The app's own error log, read by Admin › System health. Every place that used
 * to only console.error a failure nobody would see (the prospecting worker, the
 * engine, route building, push, unhandled API errors, the browser) also writes
 * here. Recording never throws: observability must not take down what it watches.
 */

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
/** A failure that repeats every worker tick is one row per window, with the repeats counted. */
export const REPEAT_WINDOW_MS = 5 * 60 * 1000;
const MAX_MESSAGE = 1000;
const MAX_DETAIL = 8000;

type Repeat = { lastWrittenAt: number; suppressed: number };
const repeats = new Map<string, Repeat>();
let lastPruneAt = 0;

export type SystemEventInput = {
  level?: SystemEventLevel;
  source: SystemEventSource;
  /** A short sentence; defaults to the error's message. */
  message?: string;
  error?: unknown;
  context?: Record<string, unknown>;
  repId?: number | null;
};

/** Ids, counts and hex in a message would make every occurrence its own group. */
export function fingerprintOf(source: string, message: string) {
  const normalized = message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .replace(/\d+/g, "#")
    .slice(0, 300);
  return createHash("sha1").update(`${source}\n${normalized}`).digest("hex").slice(0, 16);
}

export function describeError(error: unknown): { message: string; detail: string | null } {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    const causeText = cause instanceof Error ? `\nCaused by: ${cause.stack ?? cause.message}` : "";
    return { message: error.message || error.name, detail: `${error.stack ?? error.message}${causeText}` };
  }
  if (typeof error === "string") return { message: error, detail: null };
  if (error === undefined || error === null) return { message: "Unknown error", detail: null };
  try {
    return { message: "Non-error value thrown", detail: JSON.stringify(error) };
  } catch {
    return { message: "Non-error value thrown", detail: String(error) };
  }
}

/** Whether this occurrence gets its own row, and how many repeats it stands for. */
export function takeRepeat(fingerprint: string, now = Date.now()): { write: boolean; suppressed: number } {
  const seen = repeats.get(fingerprint);
  if (seen && now - seen.lastWrittenAt < REPEAT_WINDOW_MS) {
    seen.suppressed += 1;
    return { write: false, suppressed: 0 };
  }
  repeats.set(fingerprint, { lastWrittenAt: now, suppressed: 0 });
  if (repeats.size > 2000) {
    for (const [key, value] of Array.from(repeats.entries())) {
      if (now - value.lastWrittenAt >= REPEAT_WINDOW_MS) repeats.delete(key);
    }
  }
  return { write: true, suppressed: seen?.suppressed ?? 0 };
}

export async function recordSystemEvent(input: SystemEventInput): Promise<void> {
  const level = input.level ?? "error";
  const described = input.error === undefined ? null : describeError(input.error);
  const message = (input.message ?? described?.message ?? "Unknown error").slice(0, MAX_MESSAGE);
  const log = level === "error" ? console.error : console.warn;
  log(`[${input.source}] ${message}`, input.error ?? "");

  const fingerprint = fingerprintOf(input.source, message);
  const repeat = takeRepeat(fingerprint);
  if (!repeat.write) return;
  const detail = input.message && described ? `${described.message}\n${described.detail ?? ""}` : described?.detail ?? null;
  try {
    await db.insert(systemEvents).values({
      level,
      source: input.source,
      message,
      detail: detail ? detail.slice(0, MAX_DETAIL) : null,
      context: repeat.suppressed ? { ...input.context, repeatsSinceLastRow: repeat.suppressed } : input.context ?? {},
      repId: input.repId ?? null,
      fingerprint,
    });
    if (Date.now() - lastPruneAt > PRUNE_EVERY_MS) {
      lastPruneAt = Date.now();
      await db.delete(systemEvents).where(lt(systemEvents.createdAt, new Date(Date.now() - RETENTION_MS)));
    }
  } catch (error) {
    console.error("[system events] could not record an event:", error);
  }
}

/** Fire-and-forget form for code paths that must not wait on the log. */
export function reportSystemEvent(input: SystemEventInput) {
  void recordSystemEvent(input);
}
