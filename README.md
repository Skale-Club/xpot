# Xpot

Mobile-first field sales companion. Reps check in with GPS, log visits with voice notes, manage leads, and push pipeline updates that sync to GoHighLevel.

**Extracted from `skaleclub` on 2026-05-18** as a standalone project.

---

## Stack

- **Frontend:** React 18 + Vite + Wouter + Tailwind + shadcn/ui primitives
- **Backend:** Express + Drizzle ORM + Supabase Auth
- **DB:** PostgreSQL on a dedicated Supabase project (`Xpot`, ref `swqxxeivetzakglaphil`, us-east-1) — independent from Skale Club (own database **and** Auth)
- **Integrations:** Xphere CRM (prospects in, sales + visit outcomes out), GoHighLevel (legacy pipeline sync), Google Places (address autocomplete)

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

19 tables. The sales domain is prefixed `sales_`:

**Field sales**
- `sales_reps` — vendors (FK → `users.id`)
- `sales_leads` — accounts/customers, `sales_lead_locations`, `sales_lead_contacts`
- `sales_visits`, `sales_visit_notes` — GPS-validated check-ins + outcome notes
- `sales_visit_actions` — what the AI extracted from a voice note, pending confirmation
- `sales_opportunities_local` — legacy pipeline mirroring GHL
- `sales_tasks` — to-dos
- `sales_sync_events` — integration audit log
- `sales_app_settings` — global config (GPS required? geofence radius?)

**Sales module** (migration 0009)
- `sales_products` — catalog: digital services and physical goods
- `sales_product_price_tiers` — volume pricing by quantity
- `sales_sales`, `sales_sale_items` — closed sales with line items
- `sales_consignments` — stock left at an establishment
- `sales_consignment_movements` — the stock ledger

**Infrastructure**
- `users`, `sessions`, `chat_integrations`, `integration_settings`,
  `xphere_integrations`, `app_branding`

All tables RLS-protected. The app connects as the owner (BYPASSRLS), so RLS
blocks direct PostgREST access with the public anon key without affecting
application queries.

## Sales module

Reps sell digital services on the spot and leave physical goods on consignment.
A consignment is settled by counting what is left on the shelf: sold = stock
minus counted, billed at the agreed unit price, with optional restock. Money is
stored in integer cents; profit is (price − production cost), frozen onto the
sale item so repricing a product never rewrites past figures.

Sales can be recorded from three places: the active check-in card, the company
card in Leads, and the Sales tab. They can also be **captured by voice** — the
visit's audio is transcribed, read against the catalog and the shop's live
stock, and turned into proposed actions the rep confirms with one tap.

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
