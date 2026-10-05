# Xpot

Field sales and QR/NFC pieces in one app, for Skale Club's reps and resellers.
Two modules share one account:

- **Visits**: GPS check-in at a business, voice notes, leads, direct sales and
  consigned stock, the day's dashboard. Visits and sales mirror into the
  **Xphere** CRM; GoHighLevel is a legacy pipeline sync that still exists.
- **Tags**: physical pieces (Google Review signs, NFC keychains, cards) with a
  permanent QR/NFC code. Resellers receive them in kits, sell them to
  businesses and point them at a destination; Skale Club manages batches,
  kits and the production story.

**Extracted from `skaleclub` on 2026-05-18** as a standalone project.

New here? Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first.

---

## Docs

| Doc | What it is |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the app is put together: modules and roles, the shell, directories, tables, migrations, tests, deploy |
| [BACKLOG.md](docs/BACKLOG.md) | Open and closed work items with stable codes (`VND-04`, `MOD-19`), in Portuguese |
| [MODULES.md](docs/MODULES.md) | The plan that split Visits and Tags into distinct panels (#31), and what was decided, in Portuguese |
| [DESKTOP.md](docs/DESKTOP.md) | The plan that brought the rep app to the desktop (#17 to #27), in Portuguese |
| [AUDITORIA.md](docs/AUDITORIA.md) | The 2026-09-01 technical audit; a historical snapshot, in Portuguese |
| [nfc-provisioner/README.md](nfc-provisioner/README.md) | The desktop NFC writer app |

## Stack

- **Frontend:** React 18 + Vite + Wouter + TanStack Query + Tailwind + shadcn/ui primitives. EN/PT/ES.
- **Backend:** Express + Drizzle ORM, sessions in Postgres (`connect-pg-simple`).
- **Sign-in:** phone number + a 6-digit SMS code (Twilio). See "Auth model".
- **DB:** PostgreSQL. Production runs on a Coolify database on the Hetzner host
  (see "Database on the Hetzner host"). Xpot's own Supabase project
  (`Xpot`, ref `swqxxeivetzakglaphil`) keeps Storage (avatars, visit audio, the
  branding icon) and the Auth accounts behind the legacy email sign-in and the
  password change. Nothing is shared with Skale Club.
- **Integrations:**
  - Xphere CRM: prospects in, leads, sales and visit outcomes out (per-user keys).
  - GoHighLevel: legacy pipeline sync, configured in Organization › Integrations.
  - Twilio: SMS for sign-in codes.
  - Stuscle: the store where approved reps buy kits at wholesale with a personal code.
  - Google Places: business search at check-in and address autocomplete.
  - AI: Groq Whisper transcribes visit audio (OpenAI Whisper as fallback);
    OpenRouter runs the language model, with Gemini as fallback (`server/lib/ai.ts`).
  - MCP: an MCP server for the Tags Journey (see "AI access (MCP)").

## Commands

```bash
npm install          # First-time setup
npm run dev          # Dev server (client + API, one port) on http://localhost:2110
npm run check        # TypeScript typecheck
npm test             # Unit tests (vitest run); integration tests skip themselves
npm run test:watch   # Vitest in watch mode
npm run build        # Production build to dist/
npm run start        # Run production build
npm run migrate      # Apply pending SQL migrations to the database
```

**Integration tests** need a real Postgres, so they skip unless
`TAGS_INTEGRATION=1` is set. Point `DATABASE_URL` at a **disposable** database:
the tests write to it. This is what CI does (`.github/workflows/ci.yml`):

```bash
export DATABASE_URL="postgresql://postgres@localhost:5432/xpot_ci?sslmode=disable"
export TAGS_INTEGRATION=1
npm run migrate
npx vitest run tests/tags/tags.integration.test.ts tests/resellerAccounts.integration.test.ts \
  tests/phoneAuth.integration.test.ts tests/wholesale.integration.test.ts tests/mcp.oauth.integration.test.ts
```

`tests/tags/journey.integration.test.ts` and `tests/mcp.integration.test.ts`
use the same switch but are not in CI's list; run them by hand the same way.

## Setup

1. Copy `.env.example` to `.env` and fill in at least the database URL, the
   Supabase keys and `SESSION_SECRET` (the server refuses to boot without them).
   Integrations (Xphere, GoHighLevel, Twilio, Google Places, the AI providers)
   are set in the app, under Organization › Integrations (`/admin/integrations`),
   or per user for Xphere; the matching env vars are only fallbacks.
2. `npm install`
3. `npm run migrate`. Locally you run it whenever new files appear in
   `migrations/`; in production the container runs it on every start (see "Deploy").
4. `npm run dev`. Without Twilio configured, development prints the sign-in
   code in the server log.

## Routes

### App (client)

Public:
- `/`: the landing page. Inside the installed app (PWA) with a valid session,
  it goes straight to the workspace instead.
- `/login`: phone sign-in.
- `/privacy`, `/terms`: legal pages.

Visits module:
- `/check-in`: geo-validated visit start (phones and tablets; a computer hands it to the phone).
- `/dashboard`: KPIs and the day; the Visits home.
- `/visits`, `/visits/:id`: visit history, with a detail pane on desktop.
- `/leads`, `/leads/:id`: businesses (Customers and Prospects), with a detail pane.
- `/sales`, `/sales/<tab>[/<id>]`: overview, `sales`, `stock` (consignments) and `pipeline`.

Tags module:
- `/tags`: the Tags home.
- `/tags/t/:code`: one piece on the phone. On desktop it opens as `/tags/pieces/:code`.
- `/tags/pieces`, `/tags/pieces/:code`: the reseller's pieces.
- `/tags/direct`: write the customer's own link to a chip, with no Xpot code (`tag_direct_writes`).

Account:
- `/settings`: profile, language, password change, Xphere (with Visits).

Management (managers and admins). The URLs keep their old `/admin` prefix; the
shell decides which module each one belongs to (`client/src/components/xpot/moduleNav.ts`):
- Visits › Manage: `/admin/overview` (Team; `/admin` alone too), `/admin/products`,
  `/admin/settings` (check-in rules), `/admin/xphere`.
- Tags › Manage: `/admin/tags/<tab>[/<id>]` with `overview`, `pieces`, `kits`,
  `team` (resellers report), then the global admin's `batches`, `journey` and `provisioners` (NFC writers).
- Account › Organization: `/admin/reps` (People), `/admin/integrations`, `/admin/branding`.

### Server

- `/api/xpot/*`: the app API. Session required; the Visits-only paths also
  require the Visits module (see "Auth model").
- `/api/auth/phone/*`: phone sign-in (`config`, `start`, `verify`, `register`).
- `/q/:code`, `/n/:code`: the QR and NFC redirects printed on pieces (public).
- `/api/provisioner/*`: the desktop NFC writer, with a device token.
- `/api/integrations/stuscle/wholesale/verify`: the Stuscle store checks a wholesale code.
- `/api/branding/*`: favicon, manifest and icons (public).
- `/mcp`: the MCP endpoint. `/oauth/*` and `/.well-known/oauth-*`: its OAuth 2.1 flow.
- `/api/health`, `/api/version`: health check and the deployed commit.

## Database

39 tables, all defined in `shared/schema/` (the session store included), plus
the `_xpot_migrations` bookkeeping table the migration runner creates.

**Visits** (prefix `sales_`)
- `sales_reps`: every person: rep, reseller, manager or admin (FK → `users.id`), with their `modules`
- `sales_leads` (businesses), `sales_lead_locations`, `sales_lead_contacts`
- `sales_visits`, `sales_visit_notes`: GPS-validated check-ins and outcome notes
- `sales_visit_actions`: what the AI extracted from a voice note, pending confirmation
- `sales_opportunities_local`: pipeline, mirrored to GoHighLevel when configured
- `sales_tasks`, `sales_sync_events` (integration audit log), `sales_app_settings` (check-in rules)
- Sales module (migration 0017): `sales_products`, `sales_product_price_tiers`,
  `sales_sales`, `sales_sale_items`, `sales_consignments`, `sales_consignment_movements`
- `xphere_integrations`: per-user Xphere keys

**Tags**
- `tag_batches`, `tags`, `tag_kits`, `tag_destination_history`, `tag_events` (scans)
- `tag_direct_writes`
- `tag_provisioning_devices`, `tag_provisioning_jobs`, `tag_provisioning_events` (NFC writer)
- `tag_plans`, `tag_journey_entries` (the Journey)

**Account and infrastructure**
- `users`, `sessions`, `auth_phone_codes`
- `chat_integrations` (AI providers), `integration_settings` (other services), `app_branding`
- `mcp_tokens`, `mcp_oauth_clients`, `mcp_oauth_codes`, `mcp_oauth_tokens`

Every table has RLS on with no policies. The app connects as the owner
(`BYPASSRLS`), so RLS blocks direct PostgREST access with the public anon key
without affecting application queries. The flip side: run the app as a role
without `BYPASSRLS` and every query returns zero rows, with no error.

## Sales module

Reps sell digital services on the spot and leave physical goods on consignment.
A consignment is settled by counting what is left on the shelf: sold = stock
minus counted, billed at the agreed unit price, with optional restock. Money is
stored in integer cents; profit is (price − production cost), frozen onto the
sale item so repricing a product never rewrites past figures.

Sales can be recorded from three places: the active check-in card, the company
card in Leads, and the Sales tab. They can also be **captured by voice**: the
visit's audio is transcribed, read against the catalog and the shop's live
stock, and turned into proposed actions the rep confirms with one tap.

A piece sold in Tags does not appear in Sales; whether it should is decision D5
in `docs/MODULES.md` (backlog item MOD-21).

## Auth model

Everyone signs in with their **phone**: a 6-digit code goes out by SMS
(Twilio, `server/auth/phoneAuth.ts`), no email and no password.
- `users.phone` (E.164) is the sign-in identity; `salesReps.userId` → `users.id`
  links it to the rep profile. Sessions live in the `sessions` table.
- **Approval:** a new number asks for a name and becomes a *pending* rep. It
  can't sign in until a manager approves it in People (`/admin/reps`); meanwhile
  the sign-in screen says it's under review and offers WhatsApp
  (`XPOT_SUPPORT_WHATSAPP`). `XPOT_SIGNUP_NOTIFY_PHONES` get a text per sign-up.
  Admins can also create someone's access directly (active right away).
- **Blocking:** People → Block turns the rep off and deletes their sessions,
  so they're out immediately; their sign-in screen says access is off.
- Codes: 10 minutes, 5 tries, one resend per 30 s, 5 per number and 20 per
  network per hour, stored hashed in `auth_phone_codes`.
- Settings also has a password change. It changes the Supabase Auth password
  behind the legacy email sign-in (below) and needs an email on file.
- Role hierarchy: `rep` < `manager` < `admin`. Only admins act on managers/admins.
  A "reseller" is not a separate role: it is a `rep` whose modules are just Tags.
- `requireXpotUser` / `requireXpotManager` check session, approval and blocking
  on every `/api/xpot/*` request.

**Modules.** Each rep has `sales_reps.modules` (`visits`, `tags`, or both;
migration 0010). `repModules()` in `shared/modules.ts` reads it, and managers and
admins always get both. The client hides what is off (`useXpotModules`), and the
server enforces it:
- `requireVisitsModule` sits in front of every path in `VISITS_ONLY_PATHS`
  (`server/routes/xpot/middleware.ts`) and answers `403 {code: "module_off"}`.
  Leads and place search are left out on purpose: both modules sell to the
  same businesses.
- The Tags API uses `requireTagUser` (Tags module on, or manager/admin),
  `requireTagManager` and `requireTagAdmin` (`server/tags/access.ts`).

**Switching an existing install to phone sign-in.** Migration `0012` copies
each rep's profile phone into `users.phone` when it is a full, unique number.
People flags anyone left without a sign-in phone; set it with the phone
button on their row (an admin can set their own, while still signed in). In an
emergency: `UPDATE users SET phone = '+1XXXXXXXXXX' WHERE email = 'you@…';`.
The old Supabase email sign-in endpoint (`POST /api/auth/login`) still exists
but has no screen; new accounts it creates wait for approval like any sign-up.

## Wholesale (Stuscle)

Kits and other products are sold through the **Stuscle** store, not inside
Xpot. Approved reps buy at wholesale with a personal code:
- Every rep gets a code (`XP-XXXX-XXXX`, `salesReps.wholesaleCode`) when they're
  approved or created by an admin. It shows on Tags → home with a link to
  `{STUSCLE_PUBLIC_URL}/wholesale?code=…`; People shows it and can issue a
  new one (the old one stops working).
- Stuscle asks `POST /api/integrations/stuscle/wholesale/verify`
  (`Authorization: Bearer $XPOT_WHOLESALE_SECRET`, body `{code}`) when the code
  is entered and again at checkout. Answer: `{valid:true, reseller:{id,name}}`
  or `{valid:false, reason:"unknown"|"inactive"}`. Pending or blocked reps get
  `inactive`, so blocking someone closes wholesale at once.
- Without `XPOT_WHOLESALE_SECRET` the endpoint answers 503 and the store sells
  retail only. Code in `server/wholesale/`, `shared/wholesale.ts`.

## Tags (QR/NFC pieces)

Skale Club supplies physical pieces (Google Review signs, NFC keychains, cards);
resellers sell them to businesses with the Tags module. Code:
`server/tags/`, `shared/tags*.ts`, `shared/tagFace.ts`, `shared/schema/tags.ts`,
`migrations/0009_tags.sql`.

- Each piece has a permanent public code: the QR holds `<TAG_PUBLIC_BASE_URL>/q/<code>`
  and the NFC chip `/n/<code>`. Those routes redirect to the piece's current
  destination and record one anonymous scan (no IP stored).
- Each piece has a **face**: what is printed on it (the Instagram mark, Google's
  G, a phone…). It is physical, so it never follows the destination. It is set on
  the batch (`tag_batches.face`) and can be overridden per piece (`tags.face`);
  `resolveTagFace` in `shared/tagFace.ts` reads the piece's own face, then the
  batch's, then the default of a product with one obvious print (a Google
  Review sign), else none (migration 0019).
- Pieces live in house stock until an admin hands them to a reseller in a kit
  (`POST /api/xpot/admin/tag-kits`). A reseller only reaches the pieces in their
  own kit and the leads they own; managers and admins reach everything.
- Selling a piece (`POST /api/xpot/tags/:id/quick-activate`) links it to a lead
  (created on the spot if new), sets the destination, makes it live and credits
  the sale to the reseller holding it.
- Tags › Manage (`/admin/tags/*`, managers and admins): overview and analytics,
  all pieces, batches with the manufacturing CSV and QR ZIP, kits and returns,
  the per-reseller report, the Journey (admins only) and the desktop NFC
  writers (`/api/provisioner/*`, device token; see `nfc-provisioner/`).
- New accounts start switched off: signing up grants nothing. An admin
  enables reps in People.

Environment:
- `TAG_PUBLIC_BASE_URL`: domain printed on pieces (default `https://xpot.place`).
  Never change it once pieces are printed.
- `TAG_HASH_SECRET`: key for the daily anonymous visitor hash (falls back to one
  derived from `SESSION_SECRET`).
- `TAG_COUNTRY_HEADER`: optional; only if a trusted edge (e.g. Cloudflare's
  `CF-IPCountry`) sets the scanner's country.

## AI access (MCP)

`POST /mcp` is an MCP server (Streamable HTTP, stateless) for the Tags Journey.
Admin only. Code: `server/mcp/`, `shared/schema/mcp.ts`. Its tools
(`server/mcp/tools/tagJourney.ts`):

| Tool | What it does |
|---|---|
| `tags_journey_get` | Read the timeline and plans, scoped to a batch, tag, kit, lead or reseller |
| `tags_journey_record` | Record an entry (production steps, decisions, insights…); `proposed` waits for review |
| `tags_journey_review` | Change an entry's review status (approve, supersede) |
| `tags_plans_list` | List plans |
| `tags_plan_create` | Create a plan |
| `tags_plan_update` | Patch a plan; status changes are written to the journey |
| `tags_batch_create` | Create a production batch in house stock, with fresh codes and a face |
| `tags_batches_list` | List batches with counts |
| `tags_get` | Read one tag by id or public code |

Two ways in:

- **OAuth 2.1** for apps that connect themselves (Claude, ChatGPT): add a custom
  connector with `<origin>/mcp`. The app registers itself (`/oauth/register`),
  sends you to sign in and approve on `/oauth/authorize`, then holds a 1-hour
  access token and a rotating 90-day refresh token. Only active admins can
  approve, and a token stops working as soon as its approver loses admin or is
  blocked. Discovery: `/.well-known/oauth-protected-resource` and
  `/.well-known/oauth-authorization-server`. Tables: `migrations/0018_mcp_oauth.sql`.
- **Static tokens** for clients that take a header (Claude Code): created in
  Tags › Manage › Journey › AI access; the secret is shown once
  (`migrations/0015_mcp_tokens.sql`).

Both are listed and revocable in that same card. Codes, tokens and client
secrets are stored as SHA-256 hashes only.

Environment:
- `PUBLIC_BASE_URL`: optional. Unset, the OAuth issuer and endpoints are
  advertised from the request's own origin (the `Host` the proxy routed on),
  which is what lets both production domains work. Set it only to force a
  single origin; a client connecting through another domain will then fail.

## Environment variables

Every variable the server reads. `.env.example` has the same list with a
comment on each.

| Variable | Needed | What for |
|---|---|---|
| `DATABASE_URL` or `POSTGRES_URL` | yes | Postgres. If both are set, `DATABASE_URL` wins |
| `SESSION_SECRET` | yes | Signs the session cookie |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | yes | Storage and the legacy email Auth; the server won't boot without them |
| `PGSSLMODE`, `POSTGRES_SSL` | no | Force TLS on (`require` / `true`) or off (`PGSSLMODE=disable`); by default it follows the URL |
| `PORT` | no | Listen port (2110 by default; the Docker image sets 8888) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` | no | SMS fallback when Organization › Integrations has no Twilio |
| `XPOT_SUPPORT_WHATSAPP` | no | WhatsApp shown to pending and blocked people |
| `XPOT_SIGNUP_NOTIFY_PHONES` | no | Who gets a text per sign-up (comma separated) |
| `XPOT_PUBLIC_URL` | no | Origin for the link in that text (else the request's origin) |
| `XPOT_WHOLESALE_SECRET`, `STUSCLE_PUBLIC_URL` | no | Stuscle wholesale (see above) |
| `GOOGLE_PLACES_API_KEY` (alias `GOOGLE_MAPS_API_KEY`) | no | Places fallback when the Integrations panel has no enabled key |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | no | LLM; overrides the panel's OpenRouter key |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | no | LLM fallback; overrides the panel's Gemini key |
| `TAG_PUBLIC_BASE_URL`, `TAG_HASH_SECRET`, `TAG_COUNTRY_HEADER` | no | Tags (see above) |
| `PUBLIC_BASE_URL` | no | MCP OAuth origin (see above) |
| `SOURCE_COMMIT` | no | Set by Coolify; reported by `/api/version` |
| `MIGRATIONS_DIR` | no | Where the migration runner looks (default `./migrations`) |

The voice providers (Groq, OpenAI Whisper) and GoHighLevel are read from the
Integrations panel only; they have no env var.

## Deploy (Coolify)

**Domain: `https://xpot.place`, only.** It is printed on every QR code and NFC
chip. `xpot.skale.club` is the legacy domain: the server answers it with a 301
to the same path on xpot.place (`server/canonicalHost.ts`). `/api/*` still
answers there so pinned integrations keep working; each such call is logged
as `[legacy-host]` so it can be moved before the old domain is retired.

Production runs as one always-on Docker container on Coolify (the same Hetzner
host as Skale Club), built from `Dockerfile`. The QR/NFC redirects printed on
physical pieces must answer instantly, which rules out cold serverless starts.

- `.github/workflows/ci.yml` runs type check, unit tests, the integration tests
  against a throwaway Postgres 17, and the build, on every PR and every push to `main`.
- `.github/workflows/deploy.yml` runs after CI succeeds on `main`: it triggers the
  Coolify deployment, waits for it, then checks `/api/health` and `/api/version`
  (the deployed commit, from `SOURCE_COMMIT`). Only `main` deploys.
- GitHub settings it needs: secret `COOLIFY_TOKEN`; repo variables
  `COOLIFY_APP_UUID` (the Coolify app's uuid) and `XPOT_PUBLIC_URL`
  (e.g. `https://xpot.place`). Until both variables exist the deploy job only
  prints a notice. Leave Coolify's own "Automatic Deployment" off.
- `.github/workflows/keepalive.yml` pings the Supabase project's REST API every
  12 hours so the free project doesn't pause for inactivity; it still serves
  Storage and Auth. It needs the repo secret `SUPABASE_ANON_KEY` (the public anon key).

Coolify app settings:
- Build pack: Dockerfile. Port: `8888`. Health check: `/api/health` (also in the Dockerfile).
- Turn on "Include Source Commit in Build" so `/api/version` reports the commit.
- Runtime environment variables: see "Environment variables". No build-time
  variables are needed.

Migrations run on **every container start**: the Dockerfile's `CMD` is
`node dist/migrate.cjs && exec node dist/index.cjs`. The runner applies pending
files only, under an advisory lock, one transaction each, and the server starts
only if they succeed, so a broken migration fails the deploy and Coolify keeps
the previous container. `npm run migrate` still works from a laptop.

## Database on the Hetzner host

Production Postgres runs as a Coolify database next to the app (not Supabase):
the QR/NFC redirect path then depends only on the box itself, and nothing pauses
for inactivity. Supabase stays for Storage (avatars, visit audio) and the legacy
email Auth, which the redirect path never touches.

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

How the data was moved off Supabase (done once; kept for reference, a few
minutes of downtime):
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
