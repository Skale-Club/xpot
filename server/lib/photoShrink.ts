// Shrinks the lead photos already in storage, the way shrinkImageForUpload
// (client/src/lib/files.ts) shrinks new ones. scripts/shrink-lead-photos.ts runs it.
//
// A shrunk photo is a NEW file next to the original (lead_7_123.jpg ->
// lead_7_123-1600.jpg), so a run can stop anywhere and nothing is lost: the
// original is only deleted by a later, separate --delete-old run.

import sharp from "sharp";
import { activeStore, isValidKey, makeRef, parseRef, publicStore, storeFor, type FileStore } from "./files.js";

const MAX_EDGE = 1600;
const SHRUNK_SUFFIX = `-${MAX_EDGE}.jpg`;
/** Below this, and within MAX_EDGE, a photo is already fine. */
const SMALL_BYTES = 300 * 1024;
/** Re-encoding has to be worth a second generation of JPEG artifacts. */
const MIN_SAVING = 0.2;

export const isShrunkKey = (key: string) => key.endsWith(SHRUNK_SUFFIX);
export const shrunkKeyOf = (key: string) => `${key.replace(/\.[^./]+$/, "")}${SHRUNK_SUFFIX}`;

export type ShrinkResult =
  | { status: "shrunk"; bytes: Uint8Array }
  | { status: "fine" }
  /** A format sharp cannot read here (HEIC), or a broken file. It stays as it is. */
  | { status: "unreadable" };

export async function shrinkPhoto(original: Uint8Array): Promise<ShrinkResult> {
  try {
    const { width = 0, height = 0, pages = 1 } = await sharp(original).metadata();
    if (pages > 1) return { status: "fine" };
    if (original.length <= SMALL_BYTES && Math.max(width, height) <= MAX_EDGE) return { status: "fine" };
    const bytes = await sharp(original)
      // Applies the EXIF orientation before the metadata is dropped.
      .rotate()
      .flatten({ background: "#fff" })
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    if (bytes.length > original.length * (1 - MIN_SAVING)) return { status: "fine" };
    return { status: "shrunk", bytes };
  } catch {
    return { status: "unreadable" };
  }
}

type Located = { store: FileStore; key: string };

/** Where a photo reference lives; null for an external URL or a backend that isn't configured. */
function locate(ref: string): Located | null {
  const parsed = parseRef(ref);
  if (!parsed) return null;
  if (parsed.kind === "stored") {
    const store = storeFor(parsed.backend);
    return store ? { store, key: parsed.key } : null;
  }
  const store = publicStore();
  return store && parsed.publicPath && isValidKey(parsed.publicPath) ? { store, key: parsed.publicPath } : null;
}

const SIZE_BANDS = [
  { label: "under 300 KB", max: 300 * 1024 },
  { label: "300 KB - 1 MB", max: 1024 * 1024 },
  { label: "1 - 3 MB", max: 3 * 1024 * 1024 },
  { label: "over 3 MB", max: Infinity },
];

export function emptyStats() {
  return {
    photos: 0,
    bytesNow: 0,
    bytesAfter: 0,
    bySize: Object.fromEntries(SIZE_BANDS.map(({ label }) => [label, 0])) as Record<string, number>,
    shrunk: 0,
    alreadyShrunk: 0,
    fine: 0,
    unreadable: 0,
    external: 0,
    failed: 0,
    leadsChangedMeanwhile: 0,
    originalsWaiting: 0,
    originalsDeleted: 0,
  };
}

export type ShrinkLead = { id: number; photos: string[] | null };

export interface ShrinkOptions {
  leads: ShrinkLead[];
  /** Write the new files and point the rows at them. Without it, nothing is written. */
  apply: boolean;
  /** Delete originals an earlier --apply replaced. Without it, they are only counted. */
  deleteOld: boolean;
  /** Replaces the lead's photos only if they are still `previous`; false if the lead changed. */
  savePhotos: (leadId: number, previous: string[], next: string[]) => Promise<boolean>;
  log?: (message: string) => void;
}

export async function shrinkLeadPhotos({ leads, apply, deleteOld, savePhotos, log = () => undefined }: ShrinkOptions) {
  if (apply && deleteOld) throw new Error("Run --apply and --delete-old separately, and check the app in between.");
  const stats = emptyStats();
  const target = activeStore();
  if (apply && !target) throw new Error("No private store configured (set R2_* or SUPABASE_*).");

  for (const lead of leads) {
    const photos = lead.photos ?? [];
    const next = [...photos];
    for (let i = 0; i < photos.length; i++) {
      const source = locate(photos[i]);
      if (!source) {
        stats.external++;
        continue;
      }
      if (isShrunkKey(source.key)) {
        stats.alreadyShrunk++;
        continue;
      }
      try {
        const original = await source.store.get(source.key);
        stats.photos++;
        stats.bytesNow += original.length;
        stats.bySize[SIZE_BANDS.find(({ max }) => original.length <= max)!.label]++;
        const result = await shrinkPhoto(original);
        if (result.status !== "shrunk") {
          stats[result.status]++;
          stats.bytesAfter += original.length;
          continue;
        }
        stats.shrunk++;
        stats.bytesAfter += result.bytes.length;
        if (!apply) continue;
        const key = shrunkKeyOf(source.key);
        // A run that stopped before its row was saved leaves this file behind, unreferenced.
        await target!.remove([key]);
        await target!.put(key, result.bytes, "image/jpeg");
        next[i] = makeRef(target!.backend, key);
      } catch (err) {
        stats.failed++;
        log(`  failed: ${photos[i]}: ${(err as Error).message}`);
      }
    }
    if (next.some((ref, i) => ref !== photos[i]) && !(await savePhotos(lead.id, photos, next))) {
      stats.leadsChangedMeanwhile++;
      log(`  lead #${lead.id} changed during the run; run again`);
    }
  }

  await handleOriginals(leads, deleteOld, stats, log);
  return stats;
}

/**
 * The originals of photos an earlier --apply shrank: same name, any extension, in the
 * same folder. `leads` is what the rows held when this run started, so whatever this
 * run has just replaced is counted on the next one. A file any lead still points at
 * is never touched.
 */
async function handleOriginals(leads: ShrinkLead[], deleteOld: boolean, stats: ReturnType<typeof emptyStats>, log: (message: string) => void) {
  const referenced = new Set(leads.flatMap((lead) => (lead.photos ?? []).map((ref) => locate(ref)?.key)));
  const shrunk = Array.from(referenced).filter((key): key is string => Boolean(key && isShrunkKey(key)));
  const stems = new Set(shrunk.map((key) => key.slice(0, -SHRUNK_SUFFIX.length)));
  const folders = new Set(shrunk.map((key) => key.slice(0, key.lastIndexOf("/") + 1)));
  const stores = [storeFor("r2"), storeFor("supabase"), publicStore()].filter((store): store is FileStore => Boolean(store));

  for (const store of stores) {
    for (const folder of Array.from(folders)) {
      try {
        const originals = (await store.list(folder)).filter(
          (key) => !isShrunkKey(key) && !referenced.has(key) && stems.has(key.replace(/\.[^./]+$/, "")),
        );
        stats.originalsWaiting += originals.length;
        if (deleteOld && originals.length) {
          await store.remove(originals);
          stats.originalsDeleted += originals.length;
        }
      } catch (err) {
        stats.failed++;
        log(`  could not clear ${folder} in ${store.backend}: ${(err as Error).message}`);
      }
    }
  }
}
