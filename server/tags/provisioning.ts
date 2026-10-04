import crypto from "crypto";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  tagEvents,
  tagProvisioningDevices,
  tagProvisioningEvents,
  tagProvisioningJobs,
  tags,
  type TagProvisioningDevice,
  type TagProvisioningJob,
} from "#shared/schema.js";
import { buildTagUrls } from "#shared/tags.js";
import {
  OPEN_JOB_STATUSES,
  PAIRING_CODE_TTL_MS,
  PROVISIONING_JOB_TTL_MS,
  decideCompletion,
  encodePairingCode,
  formatPairingCode,
  normalizePairingCode,
  statusAfterEvent,
  type CompletionReport,
  type DeviceEventType,
} from "#shared/tagProvisioning.js";
import type {
  ProvisionerDeviceItem,
  ProvisioningJobItem,
  TagProvisioningState,
} from "#shared/tagsApi.js";
import { TagError } from "./repository.js";

// Server side of the desktop NFC provisioner. Xpot owns every decision:
// which URL a chip must hold, whether a write counts as verified, and which
// devices may take part. Device tokens only reach /api/provisioner/*.

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const iso = (value: Date | string | null | undefined): string | null => (value ? new Date(value).toISOString() : null);
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

const openStatuses = [...OPEN_JOB_STATUSES];

// ─── Devices ──────────────────────────────────────────────────────────────────

function toDeviceItem(d: TagProvisioningDevice): ProvisionerDeviceItem {
  return {
    id: d.id,
    deviceName: d.deviceName,
    platform: d.platform,
    appVersion: d.appVersion,
    status: d.status,
    tokenPrefix: d.tokenPrefix,
    pairingExpiresAt: d.status === "pairing" ? iso(d.pairingExpiresAt) : null,
    lastSeenAt: iso(d.lastSeenAt),
    pairedAt: iso(d.pairedAt),
    createdAt: iso(d.createdAt)!,
    revokedAt: iso(d.revokedAt),
  };
}

/** Admin step 1: a one-time code the operator types into the desktop app. */
export async function createPairing(deviceName: string, userId: string | null) {
  const code = encodePairingCode(crypto.randomBytes(8));
  const [device] = await db
    .insert(tagProvisioningDevices)
    .values({
      deviceName,
      status: "pairing",
      pairingCodeHash: sha256(code),
      pairingExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
      createdByUserId: userId,
    })
    .returning();
  console.log(`[tags] provisioner pairing created for "${deviceName}" (user ${userId ?? "?"})`);
  return { device: toDeviceItem(device), pairingCode: formatPairingCode(code) };
}

/** Desktop step 2: trade the code for a scoped token, shown to the app once. */
export async function redeemPairing(input: { pairingCode: string; platform?: string | null; appVersion?: string | null }) {
  const code = normalizePairingCode(input.pairingCode);
  if (!code) throw new TagError("Invalid or expired pairing code", 401);
  return db.transaction(async (tx) => {
    const [device] = await tx
      .select()
      .from(tagProvisioningDevices)
      .where(and(
        eq(tagProvisioningDevices.pairingCodeHash, sha256(code)),
        eq(tagProvisioningDevices.status, "pairing"),
      ))
      .for("update");
    if (!device || !device.pairingExpiresAt || device.pairingExpiresAt.getTime() < Date.now()) {
      throw new TagError("Invalid or expired pairing code", 401);
    }
    const token = `snp_${crypto.randomBytes(32).toString("base64url")}`;
    const [updated] = await tx
      .update(tagProvisioningDevices)
      .set({
        status: "active",
        tokenHash: sha256(token),
        tokenPrefix: token.slice(0, 10),
        pairingCodeHash: null,
        pairingExpiresAt: null,
        pairedAt: new Date(),
        lastSeenAt: new Date(),
        platform: input.platform ?? null,
        appVersion: input.appVersion ?? null,
      })
      .where(eq(tagProvisioningDevices.id, device.id))
      .returning();
    console.log(`[tags] provisioner "${updated.deviceName}" paired (${input.platform ?? "?"} ${input.appVersion ?? "?"})`);
    return { token, device: toDeviceItem(updated) };
  });
}

export async function authenticateDevice(rawToken: string): Promise<TagProvisioningDevice | null> {
  if (!rawToken.startsWith("snp_") || rawToken.length > 200) return null;
  const [device] = await db
    .select()
    .from(tagProvisioningDevices)
    .where(and(eq(tagProvisioningDevices.tokenHash, sha256(rawToken)), eq(tagProvisioningDevices.status, "active")))
    .limit(1);
  return device ?? null;
}

/** last_seen_at at most once a minute; app version whenever it changes. */
export async function touchDevice(device: TagProvisioningDevice, appVersion: string | null) {
  const stale = !device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 60_000;
  const versionChanged = !!appVersion && appVersion !== device.appVersion;
  if (!stale && !versionChanged) return;
  await db
    .update(tagProvisioningDevices)
    .set({ lastSeenAt: new Date(), ...(versionChanged ? { appVersion } : {}) })
    .where(eq(tagProvisioningDevices.id, device.id));
}

export async function listDevices(): Promise<ProvisionerDeviceItem[]> {
  const rows = await db.select().from(tagProvisioningDevices).orderBy(desc(tagProvisioningDevices.createdAt));
  // Unredeemed codes past their expiry are noise; hide them.
  return rows
    .filter((d) => d.status !== "pairing" || (d.pairingExpiresAt && d.pairingExpiresAt.getTime() > Date.now()))
    .map(toDeviceItem);
}

/** Revocation is immediate: the token stops working and open jobs are cancelled. */
export async function revokeDevice(id: string, userId: string | null) {
  return db.transaction(async (tx) => {
    const [device] = await tx
      .update(tagProvisioningDevices)
      .set({ status: "revoked", revokedAt: new Date(), tokenHash: null, pairingCodeHash: null })
      .where(eq(tagProvisioningDevices.id, id))
      .returning();
    if (!device) throw new TagError("Device not found", 404);
    const cancelled = await tx
      .update(tagProvisioningJobs)
      .set({ status: "cancelled", errorCode: "device_revoked", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tagProvisioningJobs.claimedByDeviceId, id), inArray(tagProvisioningJobs.status, openStatuses)))
      .returning({ id: tagProvisioningJobs.id, tagId: tagProvisioningJobs.tagId });
    for (const job of cancelled) {
      await logEvent(tx, { jobId: job.id, tagId: job.tagId, deviceId: id, type: "job_cancelled", detail: { reason: "device_revoked" } });
    }
    console.log(`[tags] provisioner "${device.deviceName}" revoked (user ${userId ?? "?"})`);
    return toDeviceItem(device);
  });
}

// ─── Events ───────────────────────────────────────────────────────────────────

/** Keep event detail small and flat: no raw memory dumps, no unbounded blobs. */
export function sanitizeDetail(detail: unknown): Record<string, unknown> | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail).slice(0, 20)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, 300);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

async function logEvent(
  tx: DbOrTx,
  e: { jobId?: string | null; tagId?: string | null; deviceId?: string | null; type: string; detail?: Record<string, unknown> | null },
) {
  await tx.insert(tagProvisioningEvents).values({
    jobId: e.jobId ?? null,
    tagId: e.tagId ?? null,
    deviceId: e.deviceId ?? null,
    eventType: e.type,
    detail: e.detail ?? null,
  });
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

/** Open jobs past their deadline fail as `expired` (lazy: run before reads/claims). */
export async function expireStaleJobs(now = new Date()) {
  const expired = await db
    .update(tagProvisioningJobs)
    .set({ status: "failed", errorCode: "expired", errorMessage: "Job expired before completion", completedAt: now, updatedAt: now })
    .where(and(inArray(tagProvisioningJobs.status, openStatuses), lt(tagProvisioningJobs.expiresAt, now)))
    .returning({ id: tagProvisioningJobs.id, tagId: tagProvisioningJobs.tagId, status: tagProvisioningJobs.status });
  for (const job of expired) {
    await logEvent(db, { jobId: job.id, tagId: job.tagId, type: "job_expired" });
  }
}

/** Admin: "send this tag to the provisioner". Replaces any open job for the tag. */
export async function createJob(tagId: string, userId: string | null, baseUrl: string, targetDeviceId?: string | null) {
  return db.transaction(async (tx) => {
    const [tag] = await tx.select().from(tags).where(eq(tags.id, tagId)).for("update");
    if (!tag) throw new TagError("Tag not found", 404);
    if (tag.status === "retired") throw new TagError("A retired tag cannot be programmed", 409);
    if (tag.nfcProvisioningStatus === "locked") throw new TagError("This chip is locked and cannot be rewritten", 409);
    if (targetDeviceId) {
      const [device] = await tx
        .select({ status: tagProvisioningDevices.status })
        .from(tagProvisioningDevices)
        .where(eq(tagProvisioningDevices.id, targetDeviceId));
      if (device?.status !== "active") throw new TagError("That provisioner is not paired or was revoked", 409);
    }
    const previous = await tx
      .update(tagProvisioningJobs)
      .set({ status: "cancelled", errorCode: "superseded", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tagProvisioningJobs.tagId, tagId), inArray(tagProvisioningJobs.status, openStatuses)))
      .returning({ id: tagProvisioningJobs.id });
    for (const p of previous) {
      await logEvent(tx, { jobId: p.id, tagId, type: "job_cancelled", detail: { reason: "superseded" } });
    }
    const [job] = await tx
      .insert(tagProvisioningJobs)
      .values({
        tagId,
        expectedUrl: buildTagUrls(baseUrl, tag.publicCode).nfcUrl,
        status: "pending",
        requestedByUserId: userId,
        targetDeviceId: targetDeviceId ?? null,
        expiresAt: new Date(Date.now() + PROVISIONING_JOB_TTL_MS),
      })
      .returning();
    await logEvent(tx, { jobId: job.id, tagId, type: "job_created", detail: { publicCode: tag.publicCode } });
    console.log(`[tags] provisioning job for ${tag.publicCode} created (user ${userId ?? "?"})`);
    return job;
  });
}

export async function cancelJob(jobId: string, userId: string | null) {
  const [job] = await db
    .update(tagProvisioningJobs)
    .set({ status: "cancelled", errorCode: "cancelled_by_admin", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tagProvisioningJobs.id, jobId), inArray(tagProvisioningJobs.status, openStatuses)))
    .returning();
  if (!job) throw new TagError("Job is not open", 409);
  await logEvent(db, { jobId, tagId: job.tagId, type: "job_cancelled", detail: { reason: "admin", userId } });
  return job;
}

export interface ClaimedJob {
  id: string;
  tagId: string;
  publicCode: string;
  productType: string;
  expectedUrl: string;
  status: string;
  expiresAt: string;
}

async function toClaimed(tx: DbOrTx, job: TagProvisioningJob): Promise<ClaimedJob> {
  const [tag] = await tx
    .select({ publicCode: tags.publicCode, productType: tags.productType })
    .from(tags)
    .where(eq(tags.id, job.tagId));
  return {
    id: job.id,
    tagId: job.tagId,
    publicCode: tag.publicCode,
    productType: tag.productType,
    expectedUrl: job.expectedUrl,
    status: job.status,
    expiresAt: iso(job.expiresAt)!,
  };
}

/**
 * Device: the job to work on next. A job this device already holds comes back
 * first (app restarted mid-job); otherwise the oldest pending job addressed to
 * this device or to any device. SKIP LOCKED keeps two devices from racing.
 */
export async function claimNextJob(deviceId: string): Promise<ClaimedJob | null> {
  await expireStaleJobs();
  return db.transaction(async (tx) => {
    const [held] = await tx
      .select()
      .from(tagProvisioningJobs)
      .where(and(
        eq(tagProvisioningJobs.claimedByDeviceId, deviceId),
        inArray(tagProvisioningJobs.status, ["claimed", "writing", "verifying"]),
      ))
      .orderBy(tagProvisioningJobs.claimedAt)
      .limit(1);
    if (held) return toClaimed(tx, held);

    const [next] = await tx
      .select()
      .from(tagProvisioningJobs)
      .where(and(
        eq(tagProvisioningJobs.status, "pending"),
        or(isNull(tagProvisioningJobs.targetDeviceId), eq(tagProvisioningJobs.targetDeviceId, deviceId)),
      ))
      .orderBy(tagProvisioningJobs.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;
    const [claimed] = await tx
      .update(tagProvisioningJobs)
      .set({ status: "claimed", claimedByDeviceId: deviceId, claimedAt: new Date(), updatedAt: new Date() })
      .where(eq(tagProvisioningJobs.id, next.id))
      .returning();
    await logEvent(tx, { jobId: claimed.id, tagId: claimed.tagId, deviceId, type: "job_claimed" });
    return toClaimed(tx, claimed);
  });
}

async function lockOwnOpenJob(tx: Tx, jobId: string, deviceId: string): Promise<TagProvisioningJob> {
  const [job] = await tx.select().from(tagProvisioningJobs).where(eq(tagProvisioningJobs.id, jobId)).for("update");
  if (!job || job.claimedByDeviceId !== deviceId) throw new TagError("Job not found for this device", 404);
  if (!openStatuses.includes(job.status as (typeof openStatuses)[number])) {
    throw new TagError(`Job is already ${job.status}`, 409);
  }
  if (job.expiresAt.getTime() < Date.now()) throw new TagError("Job expired; send it again from the website", 409);
  return job;
}

/** Device progress/audit event; write_started / write_completed advance the job. */
export async function recordDeviceEvent(
  deviceId: string,
  input: { jobId?: string | null; type: DeviceEventType; detail?: unknown },
) {
  const detail = sanitizeDetail(input.detail);
  if (!input.jobId) {
    await logEvent(db, { deviceId, type: input.type, detail });
    return null;
  }
  return db.transaction(async (tx) => {
    const job = await lockOwnOpenJob(tx, input.jobId!, deviceId);
    const next = statusAfterEvent(job.status, input.type);
    if (next && next !== job.status) {
      await tx
        .update(tagProvisioningJobs)
        .set({ status: next, updatedAt: new Date() })
        .where(eq(tagProvisioningJobs.id, job.id));
    }
    await logEvent(tx, { jobId: job.id, tagId: job.tagId, deviceId, type: input.type, detail });
    return next ?? job.status;
  });
}

/** Device: final result. Success is decided here by comparing the read-back URL. */
export async function completeJob(
  deviceId: string,
  jobId: string,
  report: CompletionReport & { tagType?: string | null },
) {
  return db.transaction(async (tx) => {
    const job = await lockOwnOpenJob(tx, jobId, deviceId);
    const decision = decideCompletion(job, report);
    const now = new Date();
    const [updated] = await tx
      .update(tagProvisioningJobs)
      .set({
        status: decision.status,
        readbackUrl: report.readbackUrl?.slice(0, 2048) ?? null,
        tagType: report.tagType?.slice(0, 40) ?? null,
        errorCode: decision.status === "failed" ? decision.errorCode : null,
        errorMessage: decision.status === "failed" ? decision.errorMessage?.slice(0, 500) ?? null : null,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(tagProvisioningJobs.id, job.id))
      .returning();

    if (decision.status === "succeeded") {
      await tx
        .update(tags)
        .set({
          nfcProvisioningStatus: "verified",
          nfcProgrammedAt: now,
          nfcVerifiedAt: now,
          nfcProvisioningDeviceId: deviceId,
          updatedAt: now,
        })
        .where(eq(tags.id, job.tagId));
      await logEvent(tx, { jobId: job.id, tagId: job.tagId, deviceId, type: "verification_passed", detail: { source: "server" } });
    } else {
      if (decision.tagStatus) {
        await tx
          .update(tags)
          .set({ nfcProvisioningStatus: decision.tagStatus, nfcVerifiedAt: null, nfcProvisioningDeviceId: deviceId, updatedAt: now })
          .where(eq(tags.id, job.tagId));
      }
      await logEvent(tx, {
        jobId: job.id,
        tagId: job.tagId,
        deviceId,
        type: decision.errorCode === "verification_mismatch" ? "verification_failed" : "error",
        detail: { source: "server", errorCode: decision.errorCode },
      });
    }
    console.log(`[tags] provisioning job ${job.id} ${decision.status}${decision.status === "failed" ? ` (${decision.errorCode})` : ""}`);
    return updated;
  });
}

// ─── Admin read model ─────────────────────────────────────────────────────────

export async function getTagProvisioning(tagId: string): Promise<TagProvisioningState | null> {
  await expireStaleJobs();
  const [tag] = await db
    .select({
      status: tags.nfcProvisioningStatus,
      programmedAt: tags.nfcProgrammedAt,
      verifiedAt: tags.nfcVerifiedAt,
      lockedAt: tags.nfcLockedAt,
      deviceId: tags.nfcProvisioningDeviceId,
      deviceName: tagProvisioningDevices.deviceName,
    })
    .from(tags)
    .leftJoin(tagProvisioningDevices, eq(tagProvisioningDevices.id, tags.nfcProvisioningDeviceId))
    .where(eq(tags.id, tagId));
  if (!tag) return null;

  const jobs = await db
    .select({
      job: tagProvisioningJobs,
      deviceName: tagProvisioningDevices.deviceName,
    })
    .from(tagProvisioningJobs)
    .leftJoin(tagProvisioningDevices, eq(tagProvisioningDevices.id, tagProvisioningJobs.claimedByDeviceId))
    .where(eq(tagProvisioningJobs.tagId, tagId))
    .orderBy(desc(tagProvisioningJobs.createdAt))
    .limit(10);

  const jobIds = jobs.map((j) => j.job.id);
  const events = jobIds.length
    ? await db
        .select()
        .from(tagProvisioningEvents)
        .where(inArray(tagProvisioningEvents.jobId, jobIds))
        .orderBy(tagProvisioningEvents.createdAt)
    : [];

  // Final QA: a real QR scan and a real NFC tap reaching this tag after the
  // chip was verified prove both resolve to the same record.
  let tapTestAt: string | null = null;
  let qrTestAt: string | null = null;
  if (tag.verifiedAt) {
    const [qa] = await db
      .select({
        nfc: sql<Date | null>`min(${tagEvents.occurredAt}) FILTER (WHERE ${tagEvents.accessMethod} = 'nfc')`,
        qr: sql<Date | null>`min(${tagEvents.occurredAt}) FILTER (WHERE ${tagEvents.accessMethod} = 'qr')`,
      })
      .from(tagEvents)
      .where(and(
        eq(tagEvents.tagId, tagId),
        eq(tagEvents.isBot, false),
        sql`${tagEvents.occurredAt} >= ${tag.verifiedAt}`,
      ));
    tapTestAt = iso(qa?.nfc);
    qrTestAt = iso(qa?.qr);
  }

  return {
    status: tag.status,
    programmedAt: iso(tag.programmedAt),
    verifiedAt: iso(tag.verifiedAt),
    lockedAt: iso(tag.lockedAt),
    deviceName: tag.deviceName ?? null,
    tapTestAt,
    qrTestAt,
    jobs: jobs.map(({ job, deviceName }): ProvisioningJobItem => ({
      id: job.id,
      status: job.status,
      expectedUrl: job.expectedUrl,
      readbackUrl: job.readbackUrl,
      tagType: job.tagType,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      deviceName: deviceName ?? null,
      createdAt: iso(job.createdAt)!,
      claimedAt: iso(job.claimedAt),
      completedAt: iso(job.completedAt),
      expiresAt: iso(job.expiresAt)!,
      events: events
        .filter((e) => e.jobId === job.id)
        .map((e) => ({ id: e.id, type: e.eventType, detail: e.detail ?? null, createdAt: iso(e.createdAt)! })),
    })),
  };
}
