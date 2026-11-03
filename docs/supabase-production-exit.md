# Supabase production exit — execution record

Date: 2026-11-03 (America/New_York).
Branch: codex/xpot-development-database.
Baseline: e6feb84646d2 (local main and fetched origin/main at initial inventory).
Portfolio plan: xmail/docs/supabase-exit-plan.md in the Xmail repository.

## Target

Production keeps its private Hetzner PostgreSQL and phone/Google identity through
Google Identity Platform. Supabase remains the development database. Production
files move fully to independent object storage; application identity must not
depend on Supabase Auth in either environment.

Use Google project skaleclub unless a suitable dedicated project is already in
place. Preserve app account IDs, Google identity associations, phone verification,
approvals and customer/team separation.

## Verified facts

- Production Xpot image tag matched baseline e6feb84646d2.
- The read-only runtime inspection reported Google authentication enabled,
  project skaleclub, complete public client configuration, R2 configured and
  legacy Supabase Storage still configured. The production database URL was not
  a Supabase URL. No credentials were logged.
- The shared host reported 7,751 MiB total RAM, 1,390 MiB available RAM,
  approximately 1,200 MiB swap used, and 20 GiB available disk at 73% use.
  This is a snapshot, not a capacity guarantee for additional databases.
- The existing local database connection selected Supabase. A read-only database
  transaction verified PostgreSQL 17.6, 108 public tables and 57 recorded Xpot
  migrations. No schema or application data was written by the inspection.
- Existing development-copy code documents a shared development schema. Do not
  assume all 108 public tables belong to Xpot or truncate/reset this database.
- Local Google configuration was absent. Only the public SDK configuration was
  copied from the running Xpot configuration into the ignored local .env, and
  Google authentication was enabled there. No OAuth client secret, production
  database credential or production encryption key was copied.

## Implemented first increment

1. Development requires DEV_DATABASE_URL and DEV_SUPABASE_PROJECT_REF. The
   explicit approved project must match the direct Supabase host or session
   pooler username/host. Database URLs are never included in validation errors.
2. npm run dev runs migrate:dev, which sets NODE_ENV=development before loading
   the migration runner. The same selector protects dev:server and the explicit
   db:pull destination. Development never falls back to DATABASE_URL/POSTGRES_URL.
3. Production and test URL precedence remain unchanged. Production stays on its
   own configured PostgreSQL target.
4. The development session pooler uses port 5432. Port 6543 is rejected for this
   common development/migration target because the migration runner holds a
   session advisory lock. The local development URL was switched to the session
   endpoint and verified read-only.
5. npm run dev does not copy production data. npm run local also preserves
   development data by default; its existing timed snapshot behavior requires
   XPOT_REFRESH_DEV_SNAPSHOT=true. npm run db:pull remains an explicit operation.
   That copy still needs a separate sanitization/side-effect review before use.
6. Child processes launched by the local shortcut hide helper windows on Windows.

## Validation and resource budget

- 22 focused tests passed across database-target, db-pull-schema and
  migration-baseline, with maxWorkers=1 and file parallelism disabled.
- Targeted TypeScript checking passed for database-target.ts.
- git diff --check passed (Git reports normal LF/CRLF conversion notices).
- A live read-only development database transaction succeeded. An earlier
  connection attempt reset; the subsequent attempt succeeded. No configuration
  was inferred from a failed database connection.
- No development server, full build, Docker database, bulk file copy, migration,
  background worker, real login or real SMS was run locally for this increment.
- No production configuration, data, Google provider settings or deployment was
  changed. Public SDK configuration alone does not prove browser OAuth/SMS works.

## Remaining work before production exit

- Review pending development migrations against the existing shared schema before
  allowing startup to apply them. The read-only probe verifies reachability only.
- Verify authorized localhost/production domains and SMS regions in Google Cloud;
  test phone/Google in a controlled development account and real device where
  applicable, preserving pending/blocked access checks and avoiding real outreach.
- Inventory Supabase public/private objects and persisted references. Record
  object count, bytes, ownership and hashes; do not download all objects to this PC.
- Verify R2 public branding/avatars and private photo/audio behavior; plan explicit
  development bucket separation and legacy-link compatibility.
- Rehearse copying production files and updating references, then remove production
  Supabase boot requirements/fallbacks. Keep the development DB configuration.
- Confirm external backups and a restore, not just configured backup schedules.
- Review copied integration settings and jobs so development cannot issue real
  SMS, Telegram, Xphere, Stuscle or other production side effects accidentally.
- Complete cross-user/customer/team tests and production end-to-end smoke checks;
  observe the cutover before revoking obsolete production Supabase credentials.

## Second increment: storage inventory and public R2 preparation

The live Supabase inventory found 50 objects totaling 27,871,172 bytes:

| Source | Objects | Bytes | Content |
| --- | --- | --- | --- |
| Public uploads | 3 | 489,672 | One branding icon, one avatar, one audio |
| Private uploads | 47 | 27,381,500 | Print files |

The metadata-only scan found Supabase public URL references in app_branding's
favicon_url, sales_reps.avatar_url, sales_visit_notes.audio_url and
users.profile_image_url (one row per column). Avatar/user references may share
the same object. Stored supabase: references and JSON content need separate
reconciliation before any source objects are retired. The source manifest is a
temporary file inside the running container, not a durable backup. No objects
were downloaded to this PC and no source files or database rows were changed.

New public uploads can use R2_PUBLIC_BUCKET and R2_PUBLIC_BASE_URL. They require
a separate bucket from private files; existing R2 credentials must be authorized
for both. Avatar/branding routes share this implementation, with owner-aware
avatar cleanup and legacy URL compatibility. The change stays inactive until
both public settings are deliberately configured; invalid partial configuration
and R2 failures do not silently fall back to Supabase. R2 public provisioning,
object migration, live validation and production activation remain pending.

The migration runner now supports npm run migrate:dev:plan. Its read-only
transaction confirmed 29 pending migration files; it does not acquire the
migration lock, create the ledger or execute any migration SQL. Review identified
0052 (enables AI integration switches), 0056_add_admin_phone (grants admin access)
and organization/stock backfills as requiring particular care on the shared dev
schema. None of these migrations has been applied in this work.

Focused file/branding checks passed before the final verification run. A full
typecheck was attempted with a 768 MiB Node heap limit and exhausted that limit;
it is not recorded as passing. Do not increase local resource pressure to finish
it: use remote CI for complete type/build/integration validation.

The application is not marked migrated. Explicit development routing and the
public R2 implementation are prepared; remaining work above still applies.
