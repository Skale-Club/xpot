# Xpot architecture

A map for someone new to the code. It says where things live and why they are
shaped the way they are; the README has setup, env vars and deploy steps.

## 1. Two modules and the account

Xpot is two products in one app, with one sign-in:

| Part | For | What it holds |
|---|---|---|
| **Visits** | Field reps | GPS check-in at a business, voice notes, leads, direct sales and consigned stock, the dashboard. Mirrors into the Xphere CRM |
| **Tags** | Resellers and Skale Club | Physical QR/NFC pieces: batches, kits handed to resellers, selling and pointing a piece, writing its chip, the production Journey |
| **Account** | Everyone | Settings (profile, language, password), and for managers the Organization pages: People, Integrations, Branding |

The two modules are kept apart in the interface because their audiences differ:
a reseller may sell pieces and never make a visit. They share two things on
purpose. **People** are one table (`sales_reps`) whatever they do. **Businesses**
are one table (`sales_leads`): the shop a rep visits is the shop that buys a
piece, and Tags creates its customers there (`source: "tag_sale"`).

What looks shared but is not: a Visits "sale" is a row in `sales_sales`; a
Tags "sale" is a piece going live (`tags.sold_at`) and never becomes a
`sales_sales` row. Whether it should is decision D5 (backlog MOD-21).
The history of this split is in [MODULES.md](./MODULES.md).

### Roles

| Role | How it is stored | Reach |
|---|---|---|
| rep | `sales_reps.role = 'rep'` with `visits` in `modules` | Their own leads, visits, sales |
| reseller | Not a role: a `rep` whose `modules` is just `{tags}` | The pieces in their own kit and the leads they own |
| manager | `role = 'manager'` | Everything in both modules, plus each module's Manage group and Organization |
| admin | `role = 'admin'`, or `users.is_admin` (a global admin) | Everything a manager has, plus acting on managers and admins, the Tags Journey and MCP |

Every person also needs `is_active` and no `blocked_at`. A phone that signs up
starts pending; an admin approves it in People (`/admin/reps`).

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
  module's screens and, for managers, its Manage group; `organizationItems()`
  lists the Organization pages. The sidebar, the command palette (Ctrl/⌘+K) and
  `AdminApp` all read it, and `tests/module-nav.test.ts` covers it. URLs carry
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
  (the Tags card on the dashboard, a lead's pieces, "Sell a piece" at check-in),
  so crossing from one module to the other is visible.
- On desktop the sidebar has a segmented Visits | Tags switch
  (`SidebarModuleSwitch`), and the top bar shows the path ("Tags › Batches"),
  which also goes into the browser tab's title.

## 4. Directory map

```
client/                    React app (Vite)
  src/App.tsx              Top-level routes: landing, login, legal, /admin/*, /settings, /tags/*, Visits
  src/components/
    xpot/                  The shell: AppLayout, moduleNav, surface (colours), ModuleBadge,
                           CommandPalette, MobileTabBar, MasterDetail (list + detail pane)
    ModuleSwitch.tsx       Phone module switch, useXpotModules, rememberModule
    PhoneSignIn.tsx        The phone + code sign-in form
    ui/                    shadcn/ui primitives
  src/pages/
    xpot/                  Visits: check-in, dashboard, visits, leads, sales, settings, landing
    tags/                  Tags: home, pieces, piece screen, direct link, NFC writing (Web NFC), QR scanner
    admin/                 Manage and Organization pages; admin/tags/ is Tags › Manage
    legal/                 Privacy and terms
  src/i18n/                EN/PT/ES messages, one file per area
  src/lib/                 Query client, PWA helpers, MODULE_HOME, Supabase client
server/
  index.ts                 Boot: creates the Supabase uploads bucket, starts Express
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
  storage.ts               Data access for Visits and the account; storage-sales.ts for the sales module
  canonicalHost.ts         301 from xpot.skale.club to xpot.place
shared/                    Code both sides import
  schema/                  Drizzle tables: auth, sales, integrations, branding, tags, mcp
  modules.ts               XPOT_MODULES, repModules
  tags.ts, tagAccess.ts, tagApp.ts, tagFace.ts, tagJourney.ts, tagProvisioning.ts, tagsApi.ts
                           Tags rules: codes and URLs, who may act, scanned payloads, faces,
                           the Journey, the NFC writer protocol, API response shapes
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

39 tables, all in `shared/schema/`, plus `_xpot_migrations`, which the migration
runner creates for its own bookkeeping.

| Group | Tables |
|---|---|
| People and businesses (shared by both modules) | `sales_reps`, `sales_leads`, `sales_lead_locations`, `sales_lead_contacts` |
| Visits | `sales_visits`, `sales_visit_notes`, `sales_visit_actions`, `sales_tasks`, `sales_opportunities_local`, `sales_app_settings` |
| Sales module | `sales_products`, `sales_product_price_tiers`, `sales_sales`, `sales_sale_items`, `sales_consignments`, `sales_consignment_movements` |
| Integrations | `xphere_integrations`, `sales_sync_events`, `chat_integrations`, `integration_settings` |
| Tags | `tag_batches`, `tags`, `tag_kits`, `tag_destination_history`, `tag_events`, `tag_direct_writes` |
| NFC writer | `tag_provisioning_devices`, `tag_provisioning_jobs`, `tag_provisioning_events` |
| Tags Journey | `tag_plans`, `tag_journey_entries` |
| Account | `users`, `sessions`, `auth_phone_codes`, `app_branding` |
| MCP | `mcp_tokens`, `mcp_oauth_clients`, `mcp_oauth_codes`, `mcp_oauth_tokens` |

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

## 7. MCP

`POST /mcp` serves Streamable HTTP, statelessly: a fresh server per request,
so any instance can answer any call (`server/mcp/server.ts`). Callers are
admins only, through an OAuth 2.1 connection or a static token. The tools all
live in `server/mcp/tools/tagJourney.ts`:

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

## 8. Tests

`npm test` runs Vitest over `tests/**/*.test.ts`.

- **Unit tests** need nothing outside the process. Pure rules in `shared/` are
  tested directly; route tests run the real Express routers against a mocked
  storage layer (for example `tests/authorization.test.ts`), so what is checked
  is the handler's own decision. `tests/routes-composition.test.ts` mounts the
  whole `/api/xpot` composition, because a guard in one router can leak onto the
  routers mounted after it (#32).
- **Integration tests** (`*.integration.test.ts`, seven files) run against a
  real Postgres and skip themselves unless `TAGS_INTEGRATION=1`. Point
  `DATABASE_URL` at a disposable database and run `npm run migrate` first. CI
  does this with a throwaway Postgres 17 service (`.github/workflows/ci.yml`)
  for five of the seven; `tests/tags/journey.integration.test.ts` and
  `tests/mcp.integration.test.ts` are run by hand.

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
- Supabase is still used for Storage and the legacy email Auth;
  `.github/workflows/keepalive.yml` pings it every 12 hours so the free project
  does not pause.
