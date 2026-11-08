# Fake development dataset

Owner rule (2026-11-07): the development database holds **fake data only**; the truth lives in production (xpot-db on Coolify). Only validated changes (migrations, code) go to production. `npm run db:pull` copies production and is for emergencies only.

## Commands

```bash
npm run db:seed:dev -- --dry-run   # do everything inside a transaction, then roll back
npm run db:seed:dev                # back up, wipe Xpot business data, recreate the fake dataset
```

Safety (`scripts/seed-dev-guard.ts`):
- refuses `NODE_ENV=production`;
- refuses any Supabase project except Xpot's development project `swqxxeivetzakglaphil`;
- never reads `DATABASE_URL` / `POSTGRES_URL`;
- saves a JSON backup to `../xpot-db-backups/` before writing; everything runs in one transaction.

## What it keeps and what it changes

- **Kept:** users and sessions (demo users are upserted by id; real admins get their admin rep back), the migration log, app branding, landing content, MCP clients and tokens, the product catalog and the print-model catalog.
- **Wiped and recreated:** every other Xpot business table (`scripts/db-pull-schema.ts` `isXpotDataTable`).
- **Switched off:** Twilio SMS, Google Places, Xphere sync and the AI chat providers, so nothing real leaves a development machine.

## Demo logins (development shows the code on screen, no SMS)

| Phone | Who | What to test |
|---|---|---|
| +15550100001 | Demo Admin | platform admin, everything |
| +15550100002 | Ana | rep with visits and pieces, kit, route in progress |
| +15550100003 | Bruno | visits only, returns home at end of route |
| +15550100004 | Carla | reseller organization admin, buys pieces (acquisition cost policy) |
| +15550100005 | Diego | seller in the reseller organization |
| +15550100006 | Elisa | print partner organization admin |
| +15550100007 | Fabio | blocked rep |
| +15550100008 … 14 | Gil, Hugo, Iris, Jo, Kai, Lia, Max | refused, deleted, inactive, and access requests in every status |

## Coverage

Every status of: leads, visits (including an open visit and one expired by the time limit), visit actions, opportunities, tasks (every type, priority and source), prospecting jobs, runs, candidates, routes and stops, consignments and their movements, sales (direct, settlement, partial, unpaid, cancelled), piece batches, pieces (every product type, face, NFC state, status/stock/ownership combination), kits and kit items, stock movements (every kind), scans, acquisitions and units, sold-piece costs, plans, journey entries, print requests and jobs, part movements, provisioning devices, jobs and events, direct writes, showcase items, and customer orders (lines, deliveries, pieces in every state, payments of every kind, artwork).

When a migration adds a table, status or required column, extend `scripts/seed-dev.ts` in the same change and run the dry run.
