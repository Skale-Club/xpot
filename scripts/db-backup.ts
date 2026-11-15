// Where db:pull and db:seed:dev keep the JSON copy of the local database they
// take before overwriting it. Inside the repo, under the git-ignored .cache/,
// and only the newest few are kept: production is the source of truth, these
// only guard local-only test data against one bad pull or seed.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";

export const BACKUP_DIR = resolve(process.cwd(), ".cache", "db-backups");
export const BACKUPS_KEPT = 5;

/** Write `<prefix>-<timestamp>.json`, then delete all but the newest BACKUPS_KEPT backups. */
export function writeDbBackup(prefix: string, takenAt: Date, tables: Record<string, unknown[]>): string {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, `${prefix}-${takenAt.toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ takenAt: takenAt.toISOString(), tables }));
  pruneDbBackups();
  return file;
}

/** Names carry a timestamp after the prefix; its digits, padded, order backups by age. */
export function pruneDbBackups(dir = BACKUP_DIR, keep = BACKUPS_KEPT): string[] {
  const stamp = (name: string) => name.replace(/\D/g, "").padEnd(17, "0");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => stamp(b).localeCompare(stamp(a)));
  const removed = files.slice(keep);
  for (const name of removed) rmSync(join(dir, name));
  return removed;
}
