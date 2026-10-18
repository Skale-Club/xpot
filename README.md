# Xpot

Field sales and QR/NFC pieces in one app, for Skale Club's reps and resellers.
Two modules share one account:

- **Visits**: GPS check-in at a business, voice notes, companies, direct sales and
  consigned stock, the day's route and dashboard. Visits and sales mirror into the
  **Xphere** CRM; GoHighLevel is a legacy pipeline sync that still works and is
  marked Legacy.
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
| [UI_KIT.md](docs/UI_KIT.md) | The shared UI kit: colour rules, tokens, components, tone maps and formatters |
| [UX_OVERHAUL.md](docs/UX_OVERHAUL.md) | The October 2026 UX overhaul: what changed and why, the product decisions taken, the menu tree and how to verify it, in Portuguese |
| [MODULES.md](docs/MODULES.md) | The plan that split Visits and Tags into distinct panels (#31), and what was decided, in Portuguese |
| [prospecting-routes-architecture.md](docs/prospecting-routes-architecture.md) | The daily prospecting route end to end: discovery jobs, candidates, routes, stops and check-in |
| [prospecting-planner-ux.md](docs/prospecting-planner-ux.md) | How the route planner behaves for the rep (city + sectors, expansion, review) |
| [prospecting-engine-runbook.md](docs/prospecting-engine-runbook.md) | Operating the prospecting engine connection |
| [TAG_SALES_EXECUTION_PLAN.md](docs/TAG_SALES_EXECUTION_PLAN.md) | Execution plan for linking physical pieces to sales, Stuscle acquisitions and partner margins, in Portuguese |
| [DESKTOP.md](docs/DESKTOP.md) | The plan that brought the rep app to the desktop (#17 to #27), in Portuguese |
| [AUDITORIA.md](docs/AUDITORIA.md) | The 2026-09-01 technical audit; a historical snapshot, in Portuguese |
| [nfc-provisioner/README.md](nfc-provisioner/README.md) | The desktop NFC writer app |

## Stack

- **Frontend:** React 18 + Vite + Wouter + TanStack Query + Tailwind + shadcn/ui primitives. EN/PT/ES.
- **Backend:** Express + Drizzle ORM, sessions in Postgres (`connect-pg-simple`).
- **Sign-in:** phone number + a 6-digit SMS code (Twilio). See "Auth model".
- **DB:** PostgreSQL. Production runs on a Coolify database on the Hetzner host
  (see "Database on the Hetzner host"). Xpot's own Supabase project
  (`Xpot`, ref `swqxxeivetzakglaphil`) keeps public Storage (avatars, the
  branding icon) and the Auth accounts behind the legacy email sign-in and the
  password change. Business photos and voice notes are private, on Cloudflare
  R2 (see "Files"). Nothing is shared with Skale Club.
- **Integrations:**
  - Xphere CRM: prospects in, companies, sales and visit outcomes out. One
    connection per person, set up by the Xpot admin only: Platform › Integrations ›
    Xphere, or the Xphere section of the person's page in People. Inbound keys
    are masked and can be rotated; reps have nothing to configure.
  - GoHighLevel: **Legacy** pipeline sync. It still works for accounts that use
    it, and is folded under "Legacy" in the Integrations CRM section.
  - Twilio: SMS for sign-in codes (marked "Required for sign-in").
  - Stuscle: the store where approved reps buy kits at wholesale with a personal code.
  - Google Places: business search at check-in and address autocomplete.
  - AI: Groq Whisper transcribes visit audio (OpenAI Whisper as fallback);
    OpenRouter runs the language model, with Gemini as fallback. Each runs only
    when switched on with a key; the order is decided in `server/lib/providerChoice.ts`.
  - MCP: an MCP server for AI assistants (Tags production log, prospecting,
    tasks; see "AI access (MCP)").

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
   are set in the app by the Xpot admin, under Platform › Integrations
   (`/admin/integrations`); Xphere is one connection per person. The matching env
   vars are fallbacks, except the OpenRouter and Gemini keys, which override the
   panel; each card says when the server environment is the one in force
   ("Set by server environment").
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

Every screen's place in the menu comes from one map,
`client/src/components/xpot/moduleNav.ts`: the sidebar, the phone tab bars, the
command palette (Ctrl/⌘+K), the top bar's crumb and the page title all read it,
so a screen has one name everywhere. The menu tree is drawn in
[`docs/UX_OVERHAUL.md`](docs/UX_OVERHAUL.md).

Visits module (sidebar order: Dashboard, Route, Companies, Visits, Tasks, Sales):
- `/dashboard`: KPIs and the day; the Visits home.
- `/route`: today's route: the cold-prospecting planner (city + sectors),
  background discovery, the map and the stops. `?routeId=` / `?jobId=` open one.
  The old `/prospecting`, `/leads/prospecting…` and `/leads/prospects` redirect here.
- `/route/check-in?leadId=…`: the visit being run ("Visit"): GPS check-in, notes,
  voice, sale, check-out. The old `/check-in` and `/route?leadId=` redirect here.
  Check-out lands back on the route when the visit was a route stop, otherwise on
  the visit.
- `/leads`, `/leads/:id`: Companies (prospects, leads and customers), with a
  detail pane on desktop. Opened from a route, a task or a visit, its back link
  returns there.
- `/dashboard/history`, `/dashboard/history/:id`: Visits, the visit history, with
  a detail pane; the old `/visits` redirects here. The phone tab bar leaves it
  out (six tabs don't fit); it is one tap away on the Dashboard, the sidebar and the palette.
- `/tasks`: follow-up tasks.
- `/sales`, `/sales/<tab>[/<id>]`: overview, `sales`, `stock` (consignments) and `pipeline`.

Tags module:
- `/tags`: the Tags home.
- `/tags/customers`, `/tags/customers/:id`: the companies holding the reseller's pieces.
- `/tags/pieces`, `/tags/pieces/:code`: My pieces, always the person's own (the
  list asks for `?mine=1`, so management mode never widens it).
- `/tags/t/:code`: one piece on the phone (on desktop, `/tags/pieces/:code`). It
  is the same piece screen as the admin's, with the sections the viewer may use.
- `/tags/direct`: "Write a plain chip": the customer's own link on a chip, with
  no Xpot code (`tag_direct_writes`). Reached from the Tags home and the palette.

Settings (everyone): `/settings` with the tabs Profile (name, photo, contact
phone), Sign-in (the sign-in phone, read only; a password only for email
logins), Language and Memberships (`?tab=memberships`: role, modules,
organizations with their role, the wholesale code). For a manager, Memberships
also holds the management mode switch and the links to Administration and
Platform; that is how management mode is turned on from a phone.

**Management mode.** Managers and the Xpot admin see Xpot as a rep does until
they turn management mode on (sidebar, Settings › Memberships, or the scope
chip). While it is on, an amber bar shows on every screen, each module gets its
Manage group (on the phone, a Manage tab in the Visits and Tags tab bars), and
the lists that widen to the whole team (Companies, Visits, Sales, Tasks with
"Whole team", the Tags home and customers) show a scope chip, "Viewing:
everyone / only me", that also switches the mode. Opening an `/admin/...` URL
turns the mode on with a toast; leaving it on a management screen goes to the
matching rep screen; signing out turns it off. It only narrows what a person
sees: the server still decides what each account may open or change.

Management screens keep their `/admin` URLs; `moduleNav.ts` decides where each
one sits:
- Visits › Manage (managers): `/admin/overview` (Overview: period picker, team
  numbers and one row per rep; `/admin` alone too), `/admin/products`,
  `/admin/settings` (check-in rules).
- Tags › Manage (managers), in a piece's life order: `/admin/tags/overview`
  (Needs action queues, stock funnel, scans, analytics and one activity feed;
  each queue count opens `/admin/tags/overview/<queue>`), `batches` (Xpot admin:
  the batch pipeline; a batch has tabs Summary, Print, Receive, Pieces, Hand out
  and Activity in `?tab=`), `pieces` (Inventory; a piece is `/admin/tags/pieces/:id`),
  `kits` (Distribution: Hand out, Stuscle orders, Kits history and Take back in
  `?view=`), `team` (Resellers), then the Xpot admin's `journey` (Production log)
  and `provisioners` (NFC writers).
- Administration (managers): `/admin/reps` and `/admin/reps/:repId` (People, the
  one place for a person: access, role and modules, organizations, Tags cost rule
  and wholesale code, Xphere, activity; filters in `?q=&status=&role=&module=`)
  and `/organizations` (organizations; personal workspaces hidden behind a switch).
- Platform (Xpot admin only, tagged "Xpot admin" once on the group heading):
  `/admin/integrations` (Integrations; tabs Services, Xphere at
  `/admin/integrations/xphere`, AI assistants at `/admin/integrations/mcp`; the
  old `/admin/xphere` still works), `/admin/branding` (Brand & public site:
  Identity, Installed app at `?tab=app`, and the landing page editor at
  `/admin/landing`) and `/admin/health` (Status).

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

58 tables, all defined in `shared/schema/` (the session store included), plus
the `_xpot_migrations` bookkeeping table the migration runner creates.

**Visits** (prefix `sales_`)
- `sales_reps`: every person: rep, reseller, manager or admin (FK → `users.id`), with their `modules`
- `organizations`, `organization_memberships`, `organization_audit_log`
- `sales_leads` (companies), `sales_lead_locations`, `sales_lead_contacts`
- `sales_visits`, `sales_visit_notes`: GPS-validated check-ins and outcome notes
- `sales_visit_actions`: what the AI extracted from a voice note, pending confirmation
- `sales_opportunities_local`: pipeline, mirrored to the CRM when configured
- `sales_tasks`, `sales_sync_events` (integration audit log), `sales_app_settings` (check-in rules),
  `sales_push_subscriptions`
- Sales module (migration 0017): `sales_products`, `sales_product_price_tiers`,
  `sales_sales`, `sales_sale_items`, `sales_consignments`, `sales_consignment_movements`;
  `sales_sale_tags` links a sale to the exact Tags pieces it sold
- `xphere_integrations`: one Xphere connection per person, set up by the Xpot admin
- Prospecting: `prospecting_jobs`, `prospecting_runs`, `prospecting_candidates`,
  `prospecting_routes`, `prospecting_route_stops`

**Tags**
- `tag_batches`, `tags`, `tag_destination_history`, `tag_events` (scans)
- `tag_kits` (numbered K-0001…) and `tag_kit_items` (what each kit handed out, and
  when and why each piece left it; migration 0054)
- `tag_stock_movements` (append-only stock ledger), `tag_acquisitions`,
  `tag_acquisition_lines`, `tag_acquisition_units` (what a reseller paid per piece)
- `tag_direct_writes`
- `tag_provisioning_devices`, `tag_provisioning_jobs`, `tag_provisioning_events` (NFC writer)
- `tag_plans`, `tag_journey_entries` (the Production log and the automatic activity)

**Account and infrastructure**
- `users`, `sessions`, `auth_phone_codes`, `auth_access_requests`
- `chat_integrations` (AI providers), `integration_settings` (other services),
  `integration_checks` (each provider's last Test, migration 0053)
- `app_branding`, `landing_page_contents`
- `system_events` (the app's own error log, read by Status)
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

A piece sold in Tags ("Sell this piece") is a sale here too: it creates one
`sales_sales` row and links each exact piece through `sales_sale_tags`, so it
shows in Sales, and the piece screen links to it ("Open in Sales"). Putting a
piece live is **never** a sale; only a recorded sale counts as "sold", in every
screen and report. Cancelling a Tags sale puts each piece back in stock with
its seller and the ownership it had before (a `restore` stock movement), so it
can be sold again. The rules for pieces, visits, Stuscle acquisitions and
partner margins are in `docs/TAG_SALES_EXECUTION_PLAN.md`.

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
- Role hierarchy: `rep` < `manager` < `admin`. The `admin` role is the
  **Xpot admin**: saving it also sets `users.is_admin` (and signs the person out
  so the new access takes effect), and People warns and asks before doing so.
  Only the Xpot admin changes roles, and nobody changes their own; managers
  don't edit managers or admins. An **org admin** is a role inside one
  organization (`organization_memberships.role = 'admin'`), not a platform role.
  A "reseller" is not a separate role: it is a `rep` whose modules are just Tags.
- People also refuses sign-ups (a separate "Refused" state) and deletes an
  account only after the confirmation word is typed.
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
  approved or created by an admin. The wholesale card at the bottom of Tags ›
  My pieces shows it with a link to `{STUSCLE_PUBLIC_URL}/wholesale?code=…`, and
  Settings › Memberships shows it too. The Tags section of the person's page in
  People shows it and can issue a new one (the old one stops working).
- Stuscle asks `POST /api/integrations/stuscle/wholesale/verify`
  (`Authorization: Bearer $XPOT_WHOLESALE_SECRET`, body `{code}`) when the code
  is entered and again at checkout. Answer: `{valid:true, reseller:{id,name}}`
  or `{valid:false, reason:"unknown"|"inactive"}`. Pending or blocked reps get
  `inactive`, so blocking someone closes wholesale at once.
- After payment, Stuscle sends `POST /api/integrations/stuscle/wholesale/orders`
  with the same bearer secret, the external order id, wholesale code, currency,
  date and SKU lines. The order is idempotent. When physical codes are included,
  Xpot assigns the pieces immediately; otherwise it waits in Tags › Manage ›
  Distribution › Stuscle orders (with a count badge) to be separated. Fulfilling
  it writes the kit's piece list like any hand-out. The net line subtotal
  becomes the partner's exact per-piece acquisition cost.
- Without `XPOT_WHOLESALE_SECRET` the endpoint answers 503 and the store sells
  retail only. Code in `server/wholesale/`, `shared/wholesale.ts`.

## Files (photos, voice notes, avatars)

Business photos and voice notes are **private** (`server/lib/files.ts`). The DB
keeps a storage reference, never a URL: `r2:photos/12/lead_7_….jpg`,
`r2:audio/12/visit_40_….webm` (or `supabase:…` when R2 isn't configured). The
client loads them through `GET /api/xpot/files?ref=…`
(`server/routes/xpot/files.ts`), which finds the lead or visit holding that
reference, applies the usual access rule (a lead: its owner, managers, admins;
a voice note: the visit's rep, managers, admins) and redirects to a signed URL
valid for 5 minutes. A key that no lead or visit holds is never signed.

- **Where:** Cloudflare R2 when `R2_ACCOUNT_ID` (or `R2_ENDPOINT`),
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` are set; otherwise
  the private Supabase bucket `private-uploads` (created private at boot).
  R2 setup: a dedicated bucket with no public access and no r2.dev URL, and an
  R2 API token with Object Read & Write on that bucket only.
- **Avatars and branding logos stay public** in the Supabase bucket `uploads`:
  they show all over the app chrome and on public pages, and a profile picture
  is something the person chose to show. A replaced avatar's file is deleted;
  avatars go with the account.
- **Cleanup:** removing a photo, deleting a lead or a visit, and re-recording a
  voice note delete the stored files after the DB change, best-effort; a storage
  error is logged as `[files] …` and does not fail the request.
- **Existing rows** still hold public Supabase URLs, which keep working (the
  client shows `https://` values as they are) until moved:
  1. Set the `R2_*` variables in Coolify and deploy (new uploads go private).
  2. The database has no public port, so run it in the app container
     (Coolify › xpot › Terminal), where the env is already set:
     `node dist/migrate-files.cjs` (dry run, counts), then
     `node dist/migrate-files.cjs --apply` (copies each file, points the row at it).
  3. Check photos and voice notes in the app, then
     `node dist/migrate-files.cjs --apply --delete-old`: deletes the old public
     copies, which is what actually closes the old links. Re-runnable.
     Locally, against a database you can reach: `npm run files:migrate -- <flags>`.

## Deleting an account

Administration › People › a blocked person › Access › **Delete account**
(the Xpot admin only, after typing the confirmation word;
`DELETE /api/xpot/admin/reps/:id` with `{ "confirm": "DELETE" }`,
`server/accountDeletion.ts`). It deletes the sign-in identity (users row,
sessions, sign-in codes, Supabase Auth user, MCP OAuth grants, Xphere
connection), the rep's visits, notes, voice notes, opportunities, tasks and
suggested actions, the businesses they own, and every file they uploaded
(including their photos on other reps' businesses and anything left under
their folders). Sales, sale items, consignments and stock movements are kept
for accounting: a business that has them stays, unassigned, and the rep row
stays as an anonymous "Deleted account" placeholder (`deleted_at` set, hidden
from People) so those rows keep a valid `rep_id`. With nothing to keep,
the rep and user rows are deleted outright. Data already synced to a CRM
(GoHighLevel, Xphere) is not touched there.

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
- **Batches and intake.** The Xpot admin creates batches (the manufacturing CSV
  and QR ZIP are under a batch's Print tab) and receives the pieces at the
  batch's Receive tab, a scan station: a camera that stays open, a box for typed
  or pasted codes, and a beep per read. A retried read never counts twice.
  **Undo last read** puts the piece back to "not received" (it stays registered
  to the batch; reading it again receives it again). Undo is refused unless the
  batch is open, the read is under 30 minutes old and nothing else has happened
  to the piece (`DELETE /api/xpot/admin/tag-batches/:id/tags/:tagId`). Stock
  movements are never edited or deleted (a database trigger enforces it).
- **Distribution** (Tags › Manage, managers): pieces leave house stock in a kit.
  - *Hand out*: typed or scanned codes, or "next N from a batch", checked first
    by a dry run that says why each code can't go (`POST /api/xpot/admin/tag-kits/check`,
    then `POST /api/xpot/admin/tag-kits`). The kit is consignment or purchase; a
    purchase, or a reseller on the acquisition cost rule, needs a unit cost, and
    a cost entered for house stock is recorded for reference.
  - *Stuscle orders*: wholesale orders waiting to be separated into pieces.
  - *Kits*: history. Each kit has a number (K-0001) and keeps the list of what
    it handed out (`tag_kit_items`), with what was returned, moved or is still
    with the reseller (`GET /api/xpot/admin/tag-kits/:id/items` is its packing list).
  - *Take back*: a scan station that returns unsold pieces to house stock, with
    its own dry run (`POST /api/xpot/admin/tag-kits/return/check`).
- A reseller only reaches the pieces in their own kit, their own companies and
  the companies holding their pieces; managers and admins reach everything.
- **One piece screen** for every role (`client/src/components/piece/`): a header
  with three labelled chips (Digital, Physical stock, Chip), Customer &
  destination, Chip, Sale, Performance, and for managers Management (custody,
  Transfer, Take back to house stock, settings, QR downloads, More actions:
  Retire, Restore, Mark damaged) and Activity (one timeline of destinations,
  sales, stock movements and the production log). Each viewer gets the sections
  they may use; the reseller URL and the admin URL cross-link.
- Putting a piece live (`POST /api/xpot/tags/:id/quick-activate`) links it to a
  company and a destination, but is **not a sale**. Selling one or more physical
  pieces uses `POST /api/xpot/tag-sales` with an idempotency key; this creates one
  financial sale, links every exact piece and freezes its cost. When management
  sells a piece, the sale is recorded in the name of the reseller who holds it.
  A seller's explicit cost policy is `zero` for the app owners or `acquisition`
  for a partner. Partner cost comes from a Stuscle order or a manual kit delivery.
- Every count of pieces (Overview, Batches, a batch, Distribution, Resellers, a
  kit) comes from one set of rules, `shared/tagMetrics.ts` (house, with
  resellers, sold, live, not received, damaged, can hand out, returnable);
  "sold" is only a recorded financial sale.
- Tags › Manage (`/admin/tags/*`, managers; batches, the Production log and the
  NFC writers are the Xpot admin's): Overview, Batches, Inventory, Distribution,
  Resellers, Production log, NFC writers (`/api/provisioner/*`, device token;
  see `nfc-provisioner/`).
- New accounts start switched off: signing up grants nothing. An admin
  enables people in People, choosing at least one module.

Environment:
- `TAG_PUBLIC_BASE_URL`: domain printed on pieces (default `https://xpot.place`).
  Never change it once pieces are printed.
- `TAG_HASH_SECRET`: key for the daily anonymous visitor hash (falls back to one
  derived from `SESSION_SECRET`).
- `TAG_COUNTRY_HEADER`: optional; only if a trusted edge (e.g. Cloudflare's
  `CF-IPCountry`) sets the scanner's country.

## Platform: Integrations, Brand & public site, Status

The Xpot admin's own screens (the Platform group; managers get a 403).

- **Integrations** (`/admin/integrations`) is organised by job, one section
  each: Sign-in by SMS (Twilio, required), Maps & places (Google Places, plus a
  read-only route-optimisation line), Voice transcription (Groq, then OpenAI),
  AI writing (OpenRouter, then Gemini), CRM (an Xphere summary, with
  GoHighLevel folded under Legacy), AI assistants (MCP) and Infrastructure
  (file storage, prospecting engine, push, Stuscle wholesale, Telegram: only
  "configured" or not, never a value). Voice and AI say the order the providers
  are tried in and which one is "In use now", computed on the server with
  `server/lib/providerChoice.ts`. Each provider card shows its status, where the
  settings come from (panel or server environment), the last Test (kept in
  `integration_checks`), the last error, what stops working without it, and
  Test / Save / Replace key / Remove key; a saved key reads "Key saved, ending
  in 1234". Incomplete services are listed at the top. A card can be linked as
  `/admin/integrations#service-<id>`.
- **Brand & public site** (`/admin/branding`): Identity (icon and logo on dark
  and light, "Restore default"), Installed app (`?tab=app`: name and colours,
  with phone previews) and Landing page (`/admin/landing`: the public page's
  editor; it warns before leaving with unpublished changes). Changes can take
  up to 5 minutes to show in the installed app.
- **Status** (`/admin/health`): a banner that names its causes (prospecting
  worker, services, CRM sync), the services list, the prospecting worker and
  searches (a stuck route gets "Build the route again"), CRM sync problems with
  Retry, and the error log with a plain-language summary on each event.
- Integrations and Status read one services list,
  `GET /api/xpot/admin/integrations/services` (`server/observability/services.ts`),
  so the two screens never disagree.

## AI access (MCP)

`POST /mcp` is an MCP server (Streamable HTTP, stateless) for AI assistants.
Admin only, and an assistant acts as the admin who connected it. Code:
`server/mcp/`, `shared/schema/mcp.ts`. Three tool families, each behind its own
OAuth scope (`xpot:journey`, `xpot:prospecting`, `xpot:tasks`): the Tags
production log below (`server/mcp/tools/tagJourney.ts`), prospecting searches
(`prospecting_*`, `server/mcp/tools/prospecting.ts`) and tasks (`tasks_*`,
`server/mcp/tools/tasks.ts`). The production-log tools:

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
  Platform › Integrations › AI assistants (`/admin/integrations/mcp`); the
  secret is shown once and the box closes only on "I've copied it"
  (`migrations/0015_mcp_tokens.sql`).

Both are listed with the scopes they were granted, and revocable, in that same
tab; revoked ones sit behind "Show revoked". Codes, tokens and client secrets
are stored as SHA-256 hashes only.

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
| `R2_ACCOUNT_ID` (or `R2_ENDPOINT`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | no | Private storage for photos and voice notes (see "Files"); unset, they go to the private Supabase bucket |
| `PGSSLMODE`, `POSTGRES_SSL` | no | Force TLS on (`require` / `true`) or off (`PGSSLMODE=disable`); by default it follows the URL |
| `PORT` | no | Listen port (2110 by default; the Docker image sets 8888) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` | no | SMS fallback when Platform › Integrations has no Twilio |
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

The voice providers (Groq first, OpenAI Whisper as its fallback, each only when
switched on) and GoHighLevel are read from the Integrations panel only; they
have no env var.

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
for inactivity. Supabase stays for Storage (avatars; photos and voice notes are on R2) and the legacy
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
