// One-time move of business photos and voice notes into private storage
// (server/lib/files.ts). Until a row is moved, its old public URL keeps
// working: the app shows legacy https:// values as they are.
//
// Production: the database has no public port, so run it inside the app
// container (Coolify › xpot › Terminal), where the env is already set:
//   node dist/migrate-files.cjs                     dry run: counts what would move
//   node dist/migrate-files.cjs --apply             copy each file, point the row at it
//   node dist/migrate-files.cjs --apply --delete-old
//                                                   ...and delete the old copy, which
//                                                   is what actually closes the public links
// Locally, against a database you can reach: npm run files:migrate -- <same flags>.
//
// Needs POSTGRES_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and, for R2, the
// R2_* variables (without them files go to the private Supabase bucket).
// Moves: legacy public URLs (Supabase "uploads" bucket) and "supabase:" refs
// when R2 is now configured. Safe to re-run: moved rows are skipped, and a row
// that changed meanwhile is left alone.

import "dotenv/config";
import { isNotNull, sql } from "drizzle-orm";
import { db, pool } from "../server/db.js";
import { salesLeads, salesVisitNotes } from "#shared/schema.js";
import { activeStore, isValidKey, makeRef, parseRef, publicStore, storeFor, type FileStore } from "../server/lib/files.js";

const apply = process.argv.includes("--apply");
const deleteOld = process.argv.includes("--delete-old");

type Source = { store: FileStore; key: string };

function sourceOf(ref: string, target: FileStore): Source | null | "skip" {
  const parsed = parseRef(ref);
  if (!parsed) return null;
  if (parsed.kind === "stored") {
    if (parsed.backend === target.backend) return "skip";
    const store = storeFor(parsed.backend);
    return store ? { store, key: parsed.key } : null;
  }
  const store = publicStore();
  return store && parsed.publicPath && isValidKey(parsed.publicPath) ? { store, key: parsed.publicPath } : null;
}

const contentTypeOf = (key: string) => {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "webm") return "audio/webm";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return `image/${ext || "jpeg"}`;
};

async function main() {
  const target = activeStore();
  if (!target) throw new Error("No private store configured (set R2_* or SUPABASE_*).");
  console.log(`Target: ${target.backend}. ${apply ? "Applying" : "Dry run"}${deleteOld ? ", deleting old copies" : ""}.`);

  const stats = { moved: 0, alreadyPrivate: 0, unmovable: 0, failed: 0, oldDeleted: 0 };
  // Rows moved by an earlier --apply run: their old copies sit at the same key.
  const leftovers: Source[] = [];

  /** Copy one file; returns its new reference, or null if it stays as it is. */
  async function move(ref: string): Promise<{ next: string; source: Source } | null> {
    const source = sourceOf(ref, target!);
    if (source === "skip") {
      stats.alreadyPrivate++;
      const key = (parseRef(ref) as { key: string }).key;
      const old = [publicStore(), target!.backend === "r2" ? storeFor("supabase") : null];
      for (const store of old) if (store) leftovers.push({ store, key });
      return null;
    }
    if (!source) {
      stats.unmovable++;
      console.warn(`  not ours or no store for it, left as is: ${ref}`);
      return null;
    }
    if (!apply) {
      stats.moved++;
      return null;
    }
    try {
      const bytes = await source.store.get(source.key);
      await target!.put(source.key, bytes, contentTypeOf(source.key));
      stats.moved++;
      return { next: makeRef(target!.backend, source.key), source };
    } catch (err) {
      stats.failed++;
      console.error(`  failed: ${ref}:`, (err as Error).message);
      return null;
    }
  }

  async function dropOld(sources: Source[]) {
    if (!deleteOld) return;
    for (const { store, key } of sources) {
      try {
        await store.remove([key]);
        stats.oldDeleted++;
      } catch (err) {
        console.error(`  old copy not deleted: ${key}:`, (err as Error).message);
      }
    }
  }

  // Lead photos.
  const leads = await db
    .select({ id: salesLeads.id, photos: salesLeads.photos })
    .from(salesLeads)
    .where(sql`jsonb_array_length(coalesce(${salesLeads.photos}, '[]'::jsonb)) > 0`);
  for (const lead of leads) {
    const photos = lead.photos ?? [];
    const next = [...photos];
    const moved: Source[] = [];
    for (let i = 0; i < photos.length; i++) {
      const result = await move(photos[i]);
      if (result) {
        next[i] = result.next;
        moved.push(result.source);
      }
    }
    if (!moved.length) continue;
    // Only if nobody changed the photos meanwhile.
    const updated = await db
      .update(salesLeads)
      .set({ photos: next })
      .where(sql`${salesLeads.id} = ${lead.id} AND ${salesLeads.photos} = ${JSON.stringify(photos)}::jsonb`)
      .returning({ id: salesLeads.id });
    if (updated.length) await dropOld(moved);
    else console.warn(`  lead #${lead.id} changed during the move; run again`);
  }

  // Voice notes.
  const notes = await db
    .select({ id: salesVisitNotes.id, audioUrl: salesVisitNotes.audioUrl })
    .from(salesVisitNotes)
    .where(isNotNull(salesVisitNotes.audioUrl));
  for (const note of notes) {
    const result = await move(note.audioUrl!);
    if (!result) continue;
    const updated = await db
      .update(salesVisitNotes)
      .set({ audioUrl: result.next })
      .where(sql`${salesVisitNotes.id} = ${note.id} AND ${salesVisitNotes.audioUrl} = ${note.audioUrl}`)
      .returning({ id: salesVisitNotes.id });
    if (updated.length) await dropOld([result.source]);
    else console.warn(`  note #${note.id} changed during the move; run again`);
  }

  if (apply) await dropOld(leftovers);

  console.log(apply ? "Done:" : "Would move:", stats);
  if (!deleteOld && apply && stats.moved) {
    console.log("Old public copies are still reachable. Check the app, then run again with --apply --delete-old.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
