# Xpot

Mobile-first field sales companion. Reps check in with GPS, log visits with voice notes, manage leads, and push pipeline updates that sync to GoHighLevel.

**Extracted from `skaleclub` on 2026-05-18** as a standalone project. See `EXTRACTION-NOTES.md` for the migration history.

---

## Stack

- **Frontend:** React 18 + Vite + Wouter + Tailwind + shadcn/ui primitives
- **Backend:** Express + Drizzle ORM + Supabase Auth
- **DB:** PostgreSQL, moving from the dedicated Supabase project (`Xpot`, ref `swqxxeivetzakglaphil`, us-east-1) to a Coolify database on the Hetzner host (see "Database on the Hetzner host"). The Supabase project keeps Auth and Storage. Nothing is shared with Skale Club.
- **Integrations:** GoHighLevel (lead/opp/task/note sync), Google Places (address autocomplete)

## Commands

```bash
npm install          # First-time setup
npm run dev          # Dev server (client + API, one port) on http://localhost:2110
npm run check        # TypeScript typecheck
npm run build        # Production build to dist/
npm run start        # Run production build
npm run migrate      # Apply SQL migrations to the database
npm run db:push      # Push Drizzle schema changes (use with caution)
```

## Setup

1. Copy `.env.example` to `.env` and fill in values (Supabase credentials, session secret, GHL key).
2. `npm install`
3. `npm run migrate` (only on first deploy — applies sales schema + RLS)
4. `npm run dev`

## Routes

### Public app (rep-facing)
- `/login` — Supabase Auth login
- `/` — Dashboard (KPIs)
- `/leads` — Lead list + CRUD
- `/visits` — Visit history
- `/sales` — Opportunities pipeline
- `/check-in` — Geo-validated visit start
- `/profile` — Edit rep info

### Admin API (`/api/xpot/admin/*`)
For managers/admins to view all reps, sync events, GHL pipelines, etc.

## Database

9 tables, prefix `sales_`:
- `sales_reps` — vendors (FK → `users.id`)
- `sales_leads` — accounts/customers
- `sales_lead_locations`, `sales_lead_contacts` — child tables
- `sales_visits`, `sales_visit_notes` — GPS-validated check-ins + outcome notes
- `sales_opportunities_local` — pipeline mirroring GHL
- `sales_tasks` — to-dos
- `sales_sync_events` — GHL sync audit log
- `sales_app_settings` — global config (GPS required? geofence radius?)

All tables RLS-protected. Reps see only their own data; managers/admins see all.

## Auth model

Supabase Auth on the project's own Auth instance:
- User signs in → session stored in `sessions` table (`connect-pg-simple`)
- `salesReps.userId` FK → `users.id` links the auth user to a rep profile
- Role hierarchy: `rep` < `manager` < `admin`
- Middleware `requireXpotUser` enforces session + rep existence on all `/api/xpot/*` routes

## Supabase project

Xpot runs on its **own** dedicated Supabase project (`Xpot`, ref `swqxxeivetzakglaphil`)
— separate database and Auth from Skale Club. The schema is created end-to-end by
the migrations in `migrations/` (run `npm run migrate`); nothing is shared with the
Skale Club project. The split from Skale Club (see the extraction note above) is
complete — this section previously described it as TBD, which was stale.

The database itself is moving to the Hetzner host (see "Database on the Hetzner
host" below); Auth and Storage stay on this project.

## Deploy (Coolify)

Production runs as one always-on Docker container on Coolify (the same Hetzner
host as Skale Club), built from `Dockerfile`. The QR/NFC redirects printed on
physical pieces must answer instantly, which rules out cold serverless starts.

- `.github/workflows/ci.yml` runs type check, tests and build on every PR and push to `main`.
- `.github/workflows/deploy.yml` runs after CI succeeds on `main`: it triggers the
  Coolify deployment, waits for it, then checks `/api/health` and `/api/version`
  (the deployed commit, from `SOURCE_COMMIT`).
- GitHub settings it needs: secret `COOLIFY_TOKEN`; repo variables
  `COOLIFY_APP_UUID` (the Coolify app's uuid) and `XPOT_PUBLIC_URL`
  (e.g. `https://xpot.place`). Until both variables exist the deploy job only
  prints a notice. Leave Coolify's own "Automatic Deployment" off.

Coolify app settings:
- Build pack: Dockerfile. Port: `8888`. Health check: `/api/health` (also in the Dockerfile).
- Turn on "Include Source Commit in Build" so `/api/version` reports the commit.
- Runtime environment variables: `POSTGRES_URL` (the Coolify database, see below), `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `GOOGLE_PLACES_API_KEY` (optional).
  No build-time variables are needed.

Migrations run automatically: the container starts with `node dist/migrate.cjs`
(pending files only, under an advisory lock, one transaction each) and the server
starts only if they succeed, so a broken migration fails the deploy and Coolify
keeps the previous container. `npm run migrate` still works from a laptop.

## Database on the Hetzner host

Production Postgres runs as a Coolify database next to the app (not Supabase):
the QR/NFC redirect path then depends only on the box itself, and nothing pauses
for inactivity. Supabase stays for Auth and Storage (avatars, visit audio), which
the redirect path never touches.

Setup in Coolify:
1. Add a PostgreSQL 17 database in the same project as the app. Keep it off the
   public internet (no published port); the app reaches it on the internal network.
2. Put its internal connection URL in the app's `POSTGRES_URL` (no `sslmode`
   needed on the internal network).
3. Scheduled backups: daily, to an S3 storage pointing at Cloudflare R2 (endpoint
   `https://<account-id>.r2.cloudflarestorage.com`, a dedicated bucket and an R2
   API token limited to it). Keep at least 14 days. The Hetzner server backup is
   a second layer only: restoring it rolls back every app on the box.
4. Restore one backup into a scratch database once, to prove the backups work.

Moving the existing data off Supabase (one time, a few minutes of downtime):
1. Stop writes: put the old deployment in maintenance, or just do it off-hours.
2. Dump Xpot's tables from Supabase. Use the direct/session connection string,
   and a `pg_dump` at least as new as the Supabase server, e.g. via Docker:
   `docker run --rm -v "$PWD:/w" postgres:17 pg_dump "$SUPABASE_URL_DIRECT" --schema=public --no-owner --no-privileges -Fc -f /w/xpot.dump`
3. Restore into the new database from the Coolify host:
   `docker run --rm --network <coolify-network> -v "$PWD:/w" postgres:17 pg_restore --no-owner --no-privileges -d "$NEW_POSTGRES_URL" /w/xpot.dump`
   The dump carries `_xpot_migrations` and `sessions`, so no migration re-runs
   and nobody is logged out.
4. Point the app's `POSTGRES_URL` at the new database and redeploy; check
   `/api/health`, log in, open a lead.
5. Leave the Supabase tables untouched for a couple of weeks as a fallback.

The Vercel setup (`vercel.json`, `api/`, `npm run build:vercel`) stays until the
domain moves to Coolify, then it is removed.
