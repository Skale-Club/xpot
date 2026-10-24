# Xpot architecture

A map for someone new to the code. It says where things live and why they are
shaped the way they are; the README has setup, env vars and deploy steps.

## 1. Two modules and the account

Xpot is two products in one app, with one sign-in:

| Part | For | What it holds |
|---|---|---|
| **Visits** | Field reps | The day's route, GPS check-in at a company, voice notes, companies, tasks, direct sales and consigned stock, the dashboard. Mirrors into the Xphere CRM |
| **Tags** | Resellers and Skale Club | Physical QR/NFC pieces: batches and intake, Distribution (kits handed to resellers and taken back), selling and pointing a piece, writing its chip, the Production log |
| **Account** | Everyone | Settings (Profile, Sign-in, Language, Memberships); for managers Administration (People, Organizations); for the Xpot admin Platform (Integrations, Brand & public site, Status) |

The two modules are kept apart in the interface because their audiences differ:
a reseller may sell pieces and never make a visit. They share three things on
purpose. **People** are one table (`sales_reps`) whatever they do. **Companies**
are one table (`sales_leads`): the shop a rep visits is the shop that buys a
piece, and Tags creates its customers there (`source: "tag_sale"`). **Sales**
are one table (`sales_sales`): selling Tags pieces creates a sale there and
links each exact piece through `sales_sale_tags`, so it shows in Sales too.

Putting a piece live (`tags.status = 'active'`) is **not a sale** and never
counts as one: "sold" means an active `sales_sale_tags` row (the sale service
also owns `tags.sold_at`), on every screen and in every report
(`shared/tagMetrics.ts`). Cancelling the sale puts the piece back in stock with
its seller and its former ownership. The history of the module
split is in [MODULES.md](./MODULES.md); the October 2026 UX overhaul is in
[UX_OVERHAUL.md](./UX_OVERHAUL.md).

### Roles

| Role (UI name) | How it is stored | Reach |
|---|---|---|
| Rep | `sales_reps.role = 'rep'` with `visits` in `modules` | Their own companies, visits, sales and tasks |
| Reseller | Not a role: a `rep` whose `modules` is just `{tags}` | The pieces in their own kit, their own companies and the companies holding their pieces |
| Manager | `role = 'manager'` | In management mode: everything in both modules, each module's Manage group and Administration (People, Organizations), minus the Xpot admin's items below. Out of it, the same screens as a rep |
| Xpot admin | `role = 'admin'`, which always goes with `users.is_admin` (`storage.updateSalesRepAccountProfile` writes both and signs the person out when it changes) | What a manager has, plus the items only it sees: the Platform group (Integrations, Brand & public site, Status), Xphere, Tags batches, the Production log, the NFC writers (and writing a piece's chip from the desktop), MCP, changing roles, acting on managers and admins, deleting an account. The "Xpot admin" tag marks these in the UI. Client: `isSuperAdmin()` and `adminOnly` nav items; server: `requireSuperAdmin` and `requireTagAdmin` answer 403 to everyone else |
| Org admin | `organization_memberships.role = 'admin'` in one organization; not a platform role | Manages that organization's members (suspend, remove, org role) and opens its records. In management mode their Companies, Sales (summary, sales, consignments) and Tasks lists show that organization (below); out of it, their own. Adding existing people and creating accounts stay with managers (an org admin who posts a new account gets 403) |

Every person also needs `is_active` and no `blocked_at`. A phone that signs up
starts pending; a manager approves it in People (`/admin/reps`), choosing at
least one module, or refuses it (shown as "Refused", apart from "Blocked").
Nobody can change their own role, and only the Xpot admin changes roles.

### Organizations and personal workspaces

Every person belongs to at least one organization (`organizations`,
`organization_memberships`, with an audit log). New records go to the person's
newest active membership (`organizationIdForRep`). A person who was never
assigned gets an automatic one-person workspace (`ensureOrganizationForRep`,
slug `rep-<id>`); `isPersonalOrganization` (`shared/organizations.ts`) treats
it as personal while that person is its only member, or it has none. The
Organizations screen hides personal workspaces behind "Show personal
workspaces", and People shows them with a "Personal workspace" pill. Plain reps
don't see Organizations in their navigation; it is under Administration for
managers.

### Management mode

Managers, the Xpot admin and org admins also work as reps, so the app has a
view switch: **management mode** (`client/src/lib/adminMode.ts`, kept per
device, off after sign-out). One rule for everyone: off is the person's own
records; on is the scope they manage. Every API call carries `X-Xpot-View: rep`
while it is off and `X-Xpot-View: manage` while it is on. The server reads it
through `listScope(req, actor)` in `server/routes/xpot/middleware.ts`:

- `everyone`: a manager or the Xpot admin with the mode on. A call without the
  header counts as on for them, as before (`listsEveryone`, `viewsAsRep`;
  `listActor` and `TagActor.inManagement` in Tags).
- `organizations`: an org admin of a real team (`runsATeam`, an organization
  other than their personal workspace) with `manage`: the organizations they
  run (`managedOrganizationIds`), never another. Only `manage` widens theirs,
  so a call without the header gets their own records.
- `own`: everyone else, and both of the above with the mode off.

`recordFilters` turns the scope into the sales and consignment filters;
`?repId=` of yourself is always your own records (the Dashboard asks for it,
so it stays personal in every mode). The header only chooses the view: what
someone may open or change is still `isManagerOrAdmin` and the ownership rules
(an org admin opens and settles their organization's consignments, as with its
sales). An org admin's mode grants nothing else: no Manage screens, no
Administration, no admin endpoints (`useViewerAccess().canManage` stays false;
`reach` is `"organization"`).

The lists that widen in a manager's management mode are Companies (`/leads`,
with `?organizationId=` to pick one organization, the Companies filter
`?org=`), Visits, Sales (`/sales` also takes `?organizationId=`) and
consignments, opportunities, the sync log, the Tags home and Tags customers,
and Tasks, which also needs its "Whole team" filter (`?team=1`; the server
ignores `all` and `repId` while the mode is off). An org admin's widens only
the ones with an organization: Companies, Sales' summary, sales and
consignments, and Tasks ("Whole team"); visits, opportunities and Tags stay
their own (`organizationWideList`). My pieces never widens (it always asks for
`?mine=1`), and a piece's stock movements are shown only in management mode.
The amber bar across the top (`AdminModeBar`) is what says a list shows more
than the person's own records; lists carry no per-screen scope label.
One teammate's work is at Organizations › an organization › Team › the person
(`OrganizationPerson`, `/organizations/:id/people/:repId`, reached from Settings ›
Administration › Organizations and team): Companies, Visits, Tasks and Sales from
the usual endpoints with `?repId=`, in management mode (the page turns it on). A
manager gets anyone's; a Rep Admin only inside the organizations they run, visits
included through their company (`visitsInOrganizations`).
Opening an `/admin/...` page turns a manager's mode on with a toast
(`AdminApp`); leaving it on a management screen goes to `repScreenFor(path)`.
An org admin turns it on from the sidebar or Settings › Administration and
stays on the same screen; the amber bar says "lists show your
organization".
Putting a house piece live in management mode keeps it in house stock; a
manager out of management mode who puts one live becomes its holder, as before
(`activationCredit`, `shared/tagAccess.ts`).

## 2. Granting and enforcing modules

**Granting.** `sales_reps.modules` is a `text[]` that defaults to both modules
and is checked against `{visits, tags}` (migration 0010). One function reads
it everywhere, `repModules()` in `shared/modules.ts`: managers and admins
always get both, whatever the column says, so a manager can never lock
themselves out of a module.

**Enforcing.** The client and the server both apply the rule, and only the
server's answer counts:

- Client: `useXpotModules()` (`client/src/components/ModuleSwitch.tsx`) calls
  `repModules` on `/api/xpot/me`. The shell hides what is off, and a Tags-only
  reseller who lands on a Visits URL is redirected to `/tags` (`App.tsx`).
- Server, Visits: `requireVisitsModule` is mounted in front of every path in
  `VISITS_ONLY_PATHS` (`server/routes/xpot/middleware.ts`, wired in
  `server/routes/xpot/index.ts`). A rep without Visits gets
  `403 {code: "module_off"}`. `/leads` and place search are deliberately not in
  the list, because Tags picks and creates its customers there.
- Server, Tags: `server/tags/access.ts` has `requireTagUser` (active, and Tags
  on or manager/admin), `requireTagManager` and `requireTagAdmin` (the Journey
  and MCP admin). They read the rep from the database on every request, so
  switching someone off takes effect at once.
- Below the module gate, ownership rules decide which rows a person reaches:
  `canAccessLead` / `loadAccessibleLead` for Visits, `canWorkOnTag` /
  `canUseLead` in `shared/tagAccess.ts` for Tags.

## 3. The shell

One layout, `client/src/components/xpot/AppLayout.tsx`, frames every signed-in
screen: on desktop a sidebar and a top bar, on the phone a header and a bottom
tab bar per module (`MobileTabBar`).

- **`moduleNav.ts` is the single map from URL to module.** `contextOfPath(path)`
  says whether a path is Visits, Tags or the account; `moduleGroups()` lists a
  module's screens and, for managers, its Manage group; `accountGroups()` gives
  Administration (`administrationItems()`: People, Organizations) to managers
  and Platform (`platformItems()`: Integrations, Brand & public site, Status) to
  the Xpot admin; `accountSection()` says which of Settings, Administration or
  Platform an account page is; `paletteExtras()` adds the screens no sidebar
  lists (the visit, a plain chip, the landing editor). The sidebar, the phone
  tab bars (`VisitsTabBar`, `TagsTabBar`, each with a Manage tab in management
  mode), the command palette (Ctrl/⌘+K), the crumb, the page title and
  `AdminApp` all read it, so a screen has one name everywhere, and
  `tests/module-nav.test.ts` covers it. URLs carry
  no module prefix on purpose: management pages keep their `/admin/...` URLs
  (saved links, the installed app's `start_url`), and the map decides that
  `/admin/products` is Visits and `/admin/tags/kits` is Tags.
- **`MODULE_HOME`** (`client/src/lib/xpot.ts`): each module's start page,
  `/dashboard` for Visits and `/tags` for Tags. `getXpotHomePath()` returns the
  home of the module used last.
- **`MODULE_ACCENT`** (`client/src/components/xpot/surface.ts`): Visits blue,
  Tags violet, the account neutral. It colours the active item, the module
  switch, the line at the top and the phone's tab bar, so you always know which
  module you are in. Tags is not green because green already means money,
  "live" and success across the app.
- **`ModuleBadge`** (`client/src/components/xpot/ModuleBadge.tsx`): a small
  label in the other module's colour wherever a screen shows that module's data
  (the Tags card on the dashboard, a company's pieces, "Set up a piece" at
  check-in), so crossing from one module to the other is visible.
- **The UI kit** (tokens, Button, Pill and its tone maps, EmptyState,
  ConfirmDialog, Field, CompactDataTable, formatters…) is indexed in
  [UI_KIT.md](./UI_KIT.md). New screens use it.
- On desktop the sidebar has a segmented Visits | Tags switch
  (`SidebarModuleSwitch`), and the top bar shows the path ("Tags › Batches"),
  which also goes into the browser tab's title.
- **`ScreenErrorBoundary`** wraps each screen: a render error shows a "Reload"
  card in place of that screen while the sidebar and tab bar stay, instead of
  React unmounting the whole app. The path is its `resetKey` (moving to another
  path clears the error), not a React `key`: a key would remount the screen on
  every in-screen navigation, such as opening a detail pane (`/leads/12`).
- **`SessionGate`**: what a module shows while `/api/xpot/me` loads, or a way
  back to sign-in when it fails.
- **Errors from the API.** The server answers `{ message }` for every error,
  with an English sentence, and never sends internal error text on a 500. Two
  additions let the client word it in the user's language:
  - Refusals people hit carry a stable `code` and its `params`
    (`{ message, code, params }`): `TagError` / `tagErrorBody()` in
    `server/tags/errors.ts`, `TagSaleError`, the stock transitions and the
    Visits routes. `serverErrorText()` in `client/src/lib/apiErrors.ts` looks up
    `srv_<code>` in `i18n/messages/apiErrors.ts` and falls back to the server's
    message. `tests/server-error-codes.test.ts` checks that every code the
    server sends has a translation.
  - A failed validation answers `{ message, code: "invalid_input", errors:
    [{ path, message, code, params }] }` (`server/lib/validation.ts`), with field
    codes such as `required`, `too_long`, `invalid_url`, `invalid_color`.
    `parseFieldErrors()` and `describeApiError()` in `client/src/lib/apiErrors.ts`
    read it (and the older Zod shapes) and name the field in the toast.

  `apiRequest` (`client/src/lib/queryClient.ts`) throws `ApiError` with the HTTP
  `status`, the `code`, the field errors and a message that is already
  translated; the Tags fetch helpers (`HttpError` in `pages/tags/lib.ts`,
  `AdminHttpError` in `pages/admin/tags/api.ts`) translate the same way. So a
  toast can show `err.message` as is.

## 4. Directory map

```
client/                    React app (Vite)
  src/App.tsx              Top-level routes: landing, login, legal, /admin/*, /settings, /tags/*, Visits
  src/components/
    xpot/                  The shell and the UI kit: AppLayout, moduleNav, surface (colours), ModuleBadge,
                           CommandPalette, MobileTabBar, VisitsTabBar, MasterDetail,
                           StatusPill (Pill + tone maps), ConfirmDialog, Field, CompactDataTable… (UI_KIT.md)
    piece/                 The one piece screen's sections (header, customer & destination, chip,
                           sale, performance, management, activity) and pieceView.ts, its pure rules
    ModuleSwitch.tsx       Phone module switch, useXpotModules, rememberModule
    PhoneSignIn.tsx        The phone + code sign-in form
    ui/                    shadcn/ui primitives
  src/pages/
    xpot/                  Visits: check-in, dashboard, visits, leads, sales, settings, landing
    tags/                  Tags: home, pieces, piece screen, review link, NFC writing (Web NFC), QR scanner
    admin/                 Manage, Administration and Platform pages; admin/tags/ is Tags › Manage,
                           admin/platform/ holds the Integrations hub and Brand & public site,
                           PersonDetail.tsx is a person's page in People
    legal/                 Privacy and terms
  src/i18n/                EN/PT/ES messages, one file per area; apiErrors.ts words the server's codes
  src/lib/                 Query client, apiErrors (server codes and field errors), format.ts and
                           dates.ts (formatters), adminMode (management mode), PWA helpers, MODULE_HOME
server/
  index.ts                 Boot: makes sure the Supabase buckets exist (public "uploads", fallback "private-uploads"), starts Express
  app.ts                   createApp: env check, legacy-host redirect, body limits, sessions, routes
  routes.ts                Mount order: Tags, MCP, wholesale, then /api/xpot/*, health, version
  routes/xpot/             The Visits and account API (leads, visits, sales, consignments, admin,
                           Xphere in and out, GoHighLevel sync, voice actions) and its middleware
  tags/                    The Tags API, public /q and /n redirects, NFC provisioner, Journey, reports
  auth/                    Phone sign-in, SMS through Twilio, the legacy Supabase email login
  mcp/                     MCP server, OAuth 2.1, static tokens; tools/tagJourney.ts
  wholesale/               Stuscle wholesale code check
  integrations/ghl.ts      GoHighLevel client (legacy)
  lib/ai.ts                LLM client: OpenRouter, Gemini fallback
  lib/providerChoice.ts    Pure chooser: which saved provider does voice (Groq, then OpenAI) and AI
                           text (OpenRouter, then Gemini); each only when switched on with a key,
                           env keys override the panel for OpenRouter and Gemini. Integrations shows
                           the same answer as "In use now"
  lib/validation.ts        The one 400 shape for invalid input: { message, code, errors[] }
  observability/           events.ts (system_events, the app's error log), health.ts (prospecting
                           worker and searches), services.ts (one list of outside services, read by
                           Integrations and Status), syncProblems.ts (CRM records whose last sync failed)
  organizations/           Organizations, memberships, personal workspaces, who may manage which
  lib/files.ts             Private files (photos, voice notes): R2 or the private Supabase bucket,
                           references, signed URLs, best-effort cleanup
  routes/xpot/files.ts     GET /api/xpot/files?ref=…: access check, then a 5-minute signed URL
  accountDeletion.ts       Deleting a person's account and data; sales and consignments are kept
  storage.ts               Data access for Visits and the account; storage-sales.ts for the sales module
  canonicalHost.ts         301 from xpot.skale.club to xpot.place
shared/                    Code both sides import
  schema/                  Drizzle tables: auth, sales, prospecting, organizations, integrations, branding, tags, mcp
  modules.ts               XPOT_MODULES, repModules
  tags.ts, tagAccess.ts, tagApp.ts, tagFace.ts, tagJourney.ts, tagProvisioning.ts, tagsApi.ts
                           Tags rules: codes and URLs, who may act, scanned payloads, faces,
                           the Journey, the NFC writer protocol, API response shapes
  tagMetrics.ts            One definition per stock number (house, with resellers, sold, live, not
                           received, damaged, hand out, returnable); server/tags/metrics.ts turns
                           it into SQL, the screens apply it to loaded pieces
  tagKits.ts, tagDistribution.ts, tagQueues.ts, tagSales.ts
                           Kit cost rule and kit codes (K-0001), per-code hand-out/take-back refusals,
                           the Overview "Needs action" queues, which customer a sale suggests
  visit-status.ts, organizations.ts, system-health.ts
                           Which visit statuses count as finished, personal workspaces, Status types
  pricing.ts, visit-actions.ts, xpot.ts
                           Sales arithmetic, the LLM ↔ sales contract, Visits validation schemas
  integrations-registry.ts The Integrations panel's providers, used by server and client
  phone.ts, wholesale.ts, reviewLink.ts
migrations/                Plain SQL, applied in order by scripts/migrate.ts
scripts/                   build.ts (dist/index.cjs, dist/migrate.cjs, dist/public), migrate.ts
tests/                     Vitest; tests/tags/ for Tags
nfc-provisioner/           Electron app that writes and verifies NFC chips over USB
```

## 5. Tables

59 tables, all in `shared/schema/`, plus `_xpot_migrations`, which the migration
runner creates for its own bookkeeping.

| Group | Tables |
|---|---|
| People, organizations and companies | `organizations`, `organization_memberships`, `organization_audit_log`, `sales_reps`, `sales_leads`, `sales_lead_locations`, `sales_lead_contacts` |
| Visits | `sales_visits`, `sales_visit_notes`, `sales_visit_actions`, `sales_tasks`, `sales_opportunities_local`, `sales_app_settings`, `sales_push_subscriptions` |
| Prospecting | `prospecting_jobs`, `prospecting_runs`, `prospecting_candidates`, `prospecting_routes`, `prospecting_route_stops` |
| Sales module | `sales_products`, `sales_product_price_tiers`, `sales_sales`, `sales_sale_items`, `sales_sale_tags`, `sales_consignments`, `sales_consignment_movements` |
| Integrations | `xphere_integrations`, `sales_sync_events`, `chat_integrations`, `integration_settings`, `integration_checks` (each provider's last Test) |
| Tags | `tag_batches`, `tags`, `tag_kits`, `tag_kit_items` (what each kit handed out, and when and why each piece left it), `tag_destination_history`, `tag_events`, `tag_direct_writes`, `tag_acquisitions`, `tag_acquisition_lines`, `tag_acquisition_units`, `tag_stock_movements` (append-only: a trigger refuses updates and deletes) |
| NFC writer | `tag_provisioning_devices`, `tag_provisioning_jobs`, `tag_provisioning_events` |
| Tags Journey | `tag_plans`, `tag_journey_entries` |
| Account and public site | `users`, `sessions`, `auth_phone_codes`, `auth_access_requests`, `app_branding`, `landing_page_contents` |
| Observability | `system_events` |
| MCP | `mcp_tokens`, `mcp_oauth_clients`, `mcp_oauth_codes`, `mcp_oauth_tokens` |

**Kit history.** A kit used to be "the pieces whose `tags.kit_id` points at
it", so returns and moves made a kit's counts shrink and nothing kept what was
handed out. Since migration 0054 each kit has a sequential `kit_number` (shown
as K-0001, `kitCode()` in `shared/tagKits.ts`) and `tag_kit_items` gets one row
per piece at the hand-over (a kit given out, or a Stuscle order fulfilled),
written once; returns and moves set `left_at` / `left_reason`. Distribution ›
Kits reads handed out / returned / moved / still with the reseller from it.

Files are not in the database: business photos (`sales_leads.photos`) and voice
notes (`sales_visit_notes.audio_url`) hold a storage reference such as
`r2:photos/12/lead_7_….jpg`, read through `GET /api/xpot/files` (README → Files).
Rows from before that hold the old public Supabase URL until
`npm run files:migrate` moves them.

Every table has RLS on and no policies. That blocks the public Supabase anon key
from reading them through PostgREST; the app is unaffected because it connects
as the owner, which has `BYPASSRLS`. Run it as any other role and every query
returns zero rows, with no error.

## 6. Migrations

Plain SQL in `migrations/`, applied in file order by `scripts/migrate.ts`, each
in its own transaction, under a Postgres advisory lock so two containers
starting together never apply one twice. Files are written to be re-runnable
(`IF NOT EXISTS`).

| File | What it does |
|---|---|
| `0000_create_users_and_sessions` | `users`, `sessions`, `chat_integrations`, `integration_settings` |
| `0001_create_sales_schema` | Enums and the first sales tables (an "accounts" model, replaced by 0003) |
| `0002_add_sales_visit_audio_columns` | Audio URL, duration and transcription on visit notes |
| `0003_refactor_accounts_to_leads` | Rebuilds the sales tables on the "leads" model the code uses (the tables were empty) |
| `0004_enable_rls_on_sales_tables` | RLS on every `sales_` table |
| `0005_sales_leads_xphere_ref` | `sales_leads.xphere_ref`, the link back to the Xphere record |
| `0006_xphere_integrations` | Per-user Xphere keys |
| `0007_enable_rls_on_shared_tables` | RLS on the remaining tables, including the ones holding API keys |
| `0008_app_branding` | Single-row branding table (icon, PWA manifest) |
| `0009_tags` | The Tags tables: batches, kits, pieces, history, scan events, NFC writer, direct writes |
| `0010_rep_modules` | `sales_reps.modules` |
| `0011_lead_google_place` | `sales_leads.google_place_id`, backfilled from notes |
| `0012_phone_login` | `users.phone`, blocking columns, `auth_phone_codes`; backfills phones |
| `0013_wholesale_code` | `sales_reps.wholesale_code` for Stuscle |
| `0014_tag_journey` | `tag_plans`, `tag_journey_entries` |
| `0015_mcp_tokens` | Static MCP tokens (hashed) |
| `0016_integration_config` | `integration_settings.config` (Twilio's non-secret settings) |
| `0017_products_sales_consignments` | The sales module: products, price tiers, sales, consignments, the stock ledger |
| `0018_mcp_oauth` | OAuth 2.1 clients, codes and tokens for MCP |
| `0019_tag_face` | `tag_batches.face`, `tags.face`: what is printed on a piece |
| `0020_rep_deleted_at` | `sales_reps.deleted_at`: a deleted account kept as an anonymous placeholder for its sales |
| `0020_tag_product_models` … `0051_system_events` | Not listed one by one here: Tags models, sales and acquisitions, organizations, batch intake and the stock ledger, prospecting routes, tasks, the landing page, push and the error log. Most files open with a comment saying what they do |
| `0052_honour_ai_provider_switches` | Switches on Groq and Gemini rows that already have a key, because the switch is now honoured (`server/lib/providerChoice.ts`) and nothing that worked should stop |
| `0053_integration_checks` | `integration_checks`: each provider's last Test result, kept apart from its settings row |
| `0054_tag_kit_items` | `tag_kits.kit_number` and `tag_kit_items` (kit history), backfilled from the kit journey entries, the kit stock movements and the pieces still in each kit |

Two files can share a number (`0020`, `0033`, `0035`, `0047`): the runner
tracks migrations by file name, so both apply, in name order.

## 7. MCP

`POST /mcp` serves Streamable HTTP, statelessly: a fresh server per request,
so any instance can answer any call (`server/mcp/server.ts`). Callers are
admins only, through an OAuth 2.1 connection or a static token, and an
assistant acts as the admin who connected it. Journey tools live in
`server/mcp/tools/tagJourney.ts`, account-bound prospecting tools in
`server/mcp/tools/prospecting.ts` and task tools (`tasks_list`, `tasks_get`,
`tasks_create`, `tasks_update` and the status shortcuts) in
`server/mcp/tools/tasks.ts`. The card is Platform › Integrations › AI
assistants (`/admin/integrations/mcp`); it lists each connection's scopes.

OAuth connections are least-privilege: `xpot:journey` exposes only the Tags Journey family,
`xpot:prospecting` only the prospecting family and `xpot:tasks` only the task family
(`MCP_TOKEN_SCOPES` in `shared/tagsApi.ts`). Static admin tokens keep every family
for backwards compatibility.

| Tool | What it does |
|---|---|
| `tags_journey_get` | Read the Journey timeline and plans, scoped to a batch, tag, kit, lead or reseller |
| `tags_journey_record` | Add an entry for what happened outside the app (art, slicing, printing, tests), or a decision |
| `tags_journey_review` | Approve a proposed entry or mark one superseded; entries are otherwise immutable |
| `tags_plans_list` | List plans by status |
| `tags_plan_create` | Create a plan; it is written to the Journey as a decision |
| `tags_plan_update` | Patch a plan; status changes are written to the Journey |
| `tags_batch_create` | Create a batch of new pieces in house stock, with fresh codes and an optional face |
| `tags_batches_list` | List batches with their counts |
| `tags_get` | Read one piece by id or printed code, with its history |
| `prospecting_create_today` | Start a cold-prospecting discovery job for the Xpot account that authorized the MCP connection |
| `prospecting_job_get` | Read the latest or a specific prospecting job, its runs, progress and ranked candidates |

## 8. Tests

`npm test` runs Vitest over `tests/**/*.test.ts`.

- **Unit tests** need nothing outside the process. Pure rules in `shared/` are
  tested directly; route tests run the real Express routers against a mocked
  storage layer (for example `tests/authorization.test.ts`), so what is checked
  is the handler's own decision. `tests/routes-composition.test.ts` mounts the
  whole `/api/xpot` composition, because a guard in one router can leak onto the
  routers mounted after it (#32).
- **Integration tests** (`*.integration.test.ts`, 22 files). The ones built on
  PGlite, an in-memory Postgres (People, Status, tasks scope, routes, lead
  location and follow-ups, organizations…), run in the normal `npm test`. The
  others run against a real Postgres and skip themselves unless
  `TAGS_INTEGRATION=1`: point `DATABASE_URL` at a disposable database and run
  `npm run migrate` first. CI does this for seven of them with a throwaway
  Postgres 17 service (`.github/workflows/ci.yml`). Run them one file at a time
  (`--no-file-parallelism`): several truncate the same tables.
- **Schema changes are SQL migrations, never `drizzle-kit push`.** About 25
  indexes and partial unique constraints exist only in `migrations/*.sql` (one
  active consignment per lead, unique phone, one open provisioning job per
  tag…); a push from the TypeScript schema would drop them, so the script was
  removed.

## 9. Deploy

- Production is one always-on Docker container on Coolify, on the Hetzner host,
  next to its Postgres database. Always-on because the QR/NFC redirects printed
  on pieces must answer at once; a cold serverless start can't promise that.
- CI (`.github/workflows/ci.yml`) runs on every PR and every push to `main`:
  type check, unit tests, integration tests, build. When CI passes on `main`,
  `.github/workflows/deploy.yml` tells Coolify to build and run `main`, waits,
  then checks `/api/health` and that `/api/version` reports the new commit.
- Migrations run on every container start, before the server: the
  Dockerfile's `CMD` is `node dist/migrate.cjs && exec node dist/index.cjs`.
  A failing migration stops the new container from starting, so Coolify keeps
  the old one serving.
- Business photos and voice notes live in a private Cloudflare R2 bucket
  (`R2_*` variables; README → Files). Supabase is still used for public Storage
  (avatars, the branding icon), as the private fallback when R2 isn't set, and
  for the legacy email Auth;
  `.github/workflows/keepalive.yml` pings it every 12 hours so the free project
  does not pause.
