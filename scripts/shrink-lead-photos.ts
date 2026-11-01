// Shrinks the lead photos already in storage (server/lib/photoShrink.ts). New
// uploads are shrunk in the browser; these came straight from the phone.
//
// Production: the database has no public port, so run it inside the app
// container (Coolify › xpot › Terminal), where the env is already set:
//   node dist/shrink-photos.cjs               dry run: downloads every photo, measures, writes nothing
//   node dist/shrink-photos.cjs --apply       writes a smaller copy of each and points the row at it
//   node dist/shrink-photos.cjs --delete-old  deletes the originals --apply replaced, for good
// Check the photos in the app between the last two; they refuse to run together.
// Locally, against a database you can reach: npm run files:shrink -- <same flag>.
//
// Safe to re-run: shrunk photos are skipped, and a lead that changed meanwhile
// is left alone until the next run.

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db.js";
import { salesLeads } from "#shared/schema.js";
import { shrinkLeadPhotos } from "../server/lib/photoShrink.js";

const apply = process.argv.includes("--apply");
const deleteOld = process.argv.includes("--delete-old");

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  console.log(apply ? "Applying." : deleteOld ? "Deleting replaced originals." : "Dry run: nothing is written.");
  const leads = await db
    .select({ id: salesLeads.id, photos: salesLeads.photos })
    .from(salesLeads)
    .where(sql`jsonb_array_length(coalesce(${salesLeads.photos}, '[]'::jsonb)) > 0`);

  const stats = await shrinkLeadPhotos({
    leads,
    apply,
    deleteOld,
    log: console.log,
    savePhotos: async (leadId, previous, next) => {
      const updated = await db
        .update(salesLeads)
        .set({ photos: next })
        .where(sql`${salesLeads.id} = ${leadId} AND ${salesLeads.photos} = ${JSON.stringify(previous)}::jsonb`)
        .returning({ id: salesLeads.id });
      return updated.length > 0;
    },
  });

  console.log(`${leads.length} leads with photos.`, stats);
  console.log(`Measured photos: ${mb(stats.bytesNow)} now, ${mb(stats.bytesAfter)} after shrinking.`);
  if (apply && stats.shrunk) console.log("Originals are still there. Check the app, then run again with --delete-old.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
