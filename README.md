# Xpot

Mobile-first field sales companion. Reps check in with GPS, log visits with voice notes, manage leads, and push pipeline updates that sync to GoHighLevel.

**Extracted from `skaleclub` on 2026-05-18** as a standalone project.

---

## Stack

- **Frontend:** React 18 + Vite + Wouter + Tailwind + shadcn/ui primitives
- **Backend:** Express + Drizzle ORM + Supabase Auth
- **DB:** PostgreSQL, moving from the dedicated Supabase project (`Xpot`, ref `swqxxeivetzakglaphil`, us-east-1) to a Coolify database on the Hetzner host (see "Database on the Hetzner host"). The Supabase project keeps Auth and Storage. Nothing is shared with Skale Club.
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

**Sales module** (migration 0017)
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

Everyone signs in with their **phone**: a 6-digit code goes out by SMS
(Twilio, `server/auth/phoneAuth.ts`), no email and no password.
- `users.phone` (E.164) is the sign-in identity; `salesReps.userId` → `users.id`
  links it to the rep profile. Sessions live in the `sessions` table.
- **Approval:** a new number asks for a name and becomes a *pending* rep. It
  can't sign in until a manager approves it in Admin → Reps; meanwhile the
  sign-in screen says it's under review and offers WhatsApp
  (`XPOT_SUPPORT_WHATSAPP`). `XPOT_SIGNUP_NOTIFY_PHONES` get a text per sign-up.
  Admins can also create someone's access directly (active right away).
- **Blocking:** Admin → Reps → Block turns the rep off and deletes their
  sessions, so they're out immediately; their sign-in screen says access is off.
- Codes: 10 minutes, 5 tries, one resend per 30 s, 5 per number and 20 per
  network per hour, stored hashed in `auth_phone_codes`.
- Role hierarchy: `rep` < `manager` < `admin`. Only admins act on managers/admins.
- `requireXpotUser` / `requireXpotManager` check session, approval and blocking
  on every `/api/xpot/*` request.

## Wholesale (Stuscle)

Kits and other products are sold through the **Stuscle** store, not inside
Xpot. Approved reps buy at wholesale with a personal code:
- Every rep gets a code (`XP-XXXX-XXXX`, `salesReps.wholesaleCode`) when they're
  approved or created by an admin. It shows on Tags → home with a link to
  `{STUSCLE_PUBLIC_URL}/wholesale?code=…`; Admin → Reps shows it and can issue a
  new one (the old one stops working).
- Stuscle asks `POST /api/integrations/stuscle/wholesale/verify`
  (`Authorization: Bearer $XPOT_WHOLESALE_SECRET`, body `{code}`) when the code
  is entered and again at checkout. Answer: `{valid:true, reseller:{id,name}}`
  or `{valid:false, reason:"unknown"|"inactive"}`. Pending or blocked reps get
  `inactive`, so blocking someone closes wholesale at once.
- Without `XPOT_WHOLESALE_SECRET` the endpoint answers 503 and the store sells
  retail only. Code in `server/wholesale/`, `shared/wholesale.ts`.

**Switching an existing install to phone sign-in.** Migration `0012` copies
each rep's profile phone into `users.phone` when it is a full, unique number.
Admin → Reps flags anyone left without a sign-in phone; set it with the phone
button on their row (an admin can set their own, while still signed in). In an
emergency: `UPDATE users SET phone = '+1XXXXXXXXXX' WHERE email = 'you@…';`.
The old Supabase email sign-in endpoint (`POST /api/auth/login`) still exists
but has no screen; new accounts it creates wait for approval like any sign-up.

## Supabase project

Xpot runs on its **own** dedicated Supabase project (`Xpot`, ref `swqxxeivetzakglaphil`)
— separate database and Auth from Skale Club. The schema is created end-to-end by
the migrations in `migrations/` (run `npm run migrate`); nothing is shared with the
Skale Club project. The split from Skale Club (see the extraction note above) is
complete — this section previously described it as TBD, which was stale.

The database itself is moving to the Hetzner host (see "Database on the Hetzner
host" below); Auth and Storage stay on this project.

## Tags (QR/NFC pieces)

Skale Club supplies physical pieces (Google Review signs, NFC keychains, cards);
resellers sell them to businesses with the Tags side of the app. Code:
`server/tags/`, `shared/tags*.ts`, `shared/schema/tags.ts`, `migrations/0009_tags.sql`.

- Each piece has a permanent public code: the QR holds `<TAG_PUBLIC_BASE_URL>/q/<code>`
  and the NFC chip `/n/<code>`. Those routes redirect to the piece's current
  destination and record one anonymous scan (no IP stored).
- Pieces live in house stock until an admin hands them to a reseller in a kit
  (`POST /api/xpot/admin/tag-kits`). A reseller only reaches the pieces in their
  own kit and the leads they own; managers and admins reach everything.
- Selling a piece (`POST /api/xpot/tags/:id/quick-activate`) links it to a lead
  (created on the spot if new), sets the destination, makes it live and credits
  the sale to the reseller holding it.
- Admin: batches + manufacturing CSV/QR ZIP, kits, returns, per-reseller report,
  analytics and the desktop NFC provisioner (`/api/provisioner/*`, device token).
- New accounts start switched off: signing up no longer grants access. An admin
  enables reps in Admin → Reps.

Environment:
- `TAG_PUBLIC_BASE_URL` — domain printed on pieces (default `https://xpot.place`).
  Never change it once pieces are printed.
- `TAG_HASH_SECRET` — key for the daily anonymous visitor hash (falls back to one
  derived from `SESSION_SECRET`).
- `TAG_COUNTRY_HEADER` — optional; only if a trusted edge (e.g. Cloudflare's
  `CF-IPCountry`) sets the scanner's country.

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
  `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `GOOGLE_PLACES_API_KEY` (optional),
  `TAG_PUBLIC_BASE_URL` and `TAG_HASH_SECRET` (see "Tags").
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

Xpot runs only on Coolify; the old Vercel setup is gone.
