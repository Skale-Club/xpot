# Xpot

Mobile-first field sales companion. Reps check in with GPS, log visits with voice notes, manage leads, and push pipeline updates that sync to GoHighLevel.

**Extracted from `skaleclub` on 2026-05-18** as a standalone project. See `EXTRACTION-NOTES.md` for the migration history.

---

## Stack

- **Frontend:** React 18 + Vite + Wouter + Tailwind + shadcn/ui primitives
- **Backend:** Express + Drizzle ORM + Supabase Auth
- **DB:** PostgreSQL on a dedicated Supabase project (`Xpot`, ref `swqxxeivetzakglaphil`, us-east-1) — independent from Skale Club (own database **and** Auth)
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
- Runtime environment variables: `POSTGRES_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `GOOGLE_PLACES_API_KEY` (optional).
  No build-time variables are needed.

Migrations are not applied by the deploy: run `npm run migrate` against the
production `POSTGRES_URL` before deploying code that needs them.

The Vercel setup (`vercel.json`, `api/`, `npm run build:vercel`) stays until the
domain moves to Coolify, then it is removed.
