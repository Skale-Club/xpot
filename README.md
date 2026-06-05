# Xpot

Mobile-first field sales CRM. Reps check in with GPS, log visits with voice notes, manage leads, and push pipeline updates that sync to GoHighLevel.

**Extracted from `skaleclub` on 2026-05-18** as a standalone project. See `EXTRACTION-NOTES.md` for the migration history.

---

## Stack

- **Frontend:** React 18 + Vite + Wouter + Tailwind + shadcn/ui primitives
- **Backend:** Express + Drizzle ORM + Supabase Auth
- **DB:** PostgreSQL (Supabase) — currently shared with Skale Club; standalone migration TBD
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

Reuses Supabase Auth from Skale Club:
- User signs in → session stored in `sessions` table (`connect-pg-simple`)
- `salesReps.userId` FK → `users.id` links the auth user to a rep profile
- Role hierarchy: `rep` < `manager` < `admin`
- Middleware `requireXpotUser` enforces session + rep existence on all `/api/xpot/*` routes

## Notes for future Supabase migration

If/when Xpot gets its own Supabase project:
1. Export the 9 `sales_*` tables + `users` rows that have a matching `salesReps.user_id`
2. Import into the new project
3. Update `POSTGRES_URL` + `SUPABASE_*` env vars
4. The `salesReps.userId` FK will need to point to the new project's `users` table — handled by re-running the migrations against the new DB

Until then, this app shares the Skale Club DB and Supabase Auth project.
