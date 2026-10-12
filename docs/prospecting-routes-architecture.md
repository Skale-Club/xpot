# Xpot prospecting maps and daily routes

Status: end-to-end first version implemented and the production engine connection verified;
application rollout and field acceptance remain.

The adaptive cold-prospecting experience and mini-form are specified in
[`prospecting-planner-ux.md`](./prospecting-planner-ux.md).
Production setup, smoke checks, failure handling and worker cutover are in
[`prospecting-engine-runbook.md`](./prospecting-engine-runbook.md).

## Architectural decision

Xpot is completely independent from XScraper. It does not call XScraper, does not use Apify and
does not require a second user account or an account link. Every active Xpot Visits user receives
prospecting capability through the existing Xpot identity and authorization model.

The reusable intelligence originally developed around the Home Lab has been incorporated into
Xpot: job construction, single-slot FIFO queue, status polling, CSV parsing, normalization,
deduplication, candidate scoring and persistence. The external process is deliberately dumb: it
only executes `gosom/google-maps-scraper` jobs.

```text
Xpot user
   |
   v
Xpot prospecting API -> Xpot queue/database -> Google Maps execution engine
   |                                           Home Lab today
   |                                           hosted server later
   v
candidate ranking -> daily route -> lead/visit -> existing Xphere sync
```

Changing from the Home Lab to a hosted server changes `PROSPECTING_ENGINE_URL` and credentials,
not the Xpot database, client API, users or route workflow.

## Ownership boundaries

| Component | Owns |
| --- | --- |
| Xpot | Users, search intent, global FIFO queue, normalized results, deduplication, ranking, routes, stops and field execution |
| Execution engine | Running Google Maps extraction and returning status/CSV only |
| Xphere | Existing CRM history and downstream opportunity synchronization |
| Xmail | No dependency; it may consume CRM events later |
| XScraper | No dependency and no role in this flow |

## User flow

1. The rep selects only a city and sectors for today's route.
2. Xpot creates one internal run per sector; all runs share a global, single-slot FIFO queue.
3. The background worker starts the oldest run directly on the configured execution engine.
4. Xpot polls status. When complete, it downloads and normalizes the CSV into candidates.
5. Candidates receive an explainable score based on route readiness, contact data, rating and
   review volume. Raw source data remains available for audit.
6. The rep selects a completed job, individual candidates and/or existing Xpot prospects.
7. Xpot uses internal full-day assumptions to order useful visits and saves today's draft route.
8. Publishing the route promotes selected candidates into owned Xpot prospects, deduplicating by
   Google Place ID, and stores their primary location.
9. The mobile route uses the existing visit/check-in workflow. Outcomes continue through the
   existing Xphere synchronization path.

## Execution-engine contract

Xpot talks directly to the open-source engine API:

```text
POST /api/v1/jobs
GET  /api/v1/jobs/:jobId
GET  /api/v1/jobs/:jobId/download
```

The payload uses `keywords`, `lang`, `depth`, `email`, `max_time` and `fast_mode`. Depth scales
with the requested result count and is capped by configuration. The client accepts the engine's
`pending`, `working`, `ok` and `failed` states and parses RFC-4180 CSV output, including quoted
fields and embedded newlines.

Server-only configuration:

```text
PROSPECTING_ENGINE_URL
PROSPECTING_ENGINE_CF_CLIENT_ID       optional
PROSPECTING_ENGINE_CF_CLIENT_SECRET   optional
PROSPECTING_ENGINE_MAX_TIME_SECONDS   default 1800
PROSPECTING_ENGINE_DEPTH              default 10
PROSPECTING_ENGINE_POLL_MS            default 30000, minimum 10000
```

The Cloudflare headers are optional so a future hosted worker can use a private network or another
edge authentication strategy without exposing secrets to the browser.

## Queue and failure behavior

- There is at most one `starting` or `running` engine run across all Xpot accounts.
- A PostgreSQL advisory lock and a partial unique index protect that invariant across replicas.
- Runs are FIFO by creation time and id. A queued run expires after 24 hours.
- A running run fails after engine `max_time` plus a ten-minute grace period.
- Starting a remote job is never automatically retried: a lost response might otherwise create a
  duplicate expensive job. The failure remains visible and the rep can explicitly place only the
  failed physical searches back in the queue.
- Polling is performed by the in-process worker and can also be advanced by the authenticated
  refresh endpoint. A process restart is safe because state and engine job ids live in PostgreSQL.
- If the engine is not configured or temporarily unavailable, existing candidates, prospects and
  routes remain fully usable.

## Data model

| Table | Purpose |
| --- | --- |
| `prospecting_jobs` | One rep request containing territory, sector searches, filters and hypothesis |
| `prospecting_runs` | One queued physical engine run per sector, including progress and engine job id |
| `prospecting_candidates` | Normalized businesses kept separate from the working lead list |
| `prospecting_routes` | One persisted route for one rep and day, with optimization totals |
| `prospecting_route_stops` | Ordered business snapshots linked to candidate, promoted lead and eventual visit |

Candidates stay outside `sales_leads` until a route is published. This prevents a large discovery
round from polluting the rep's operational lead list.

Publishing is the bridge into the existing visit workflow. Each accepted stop is promoted to a
lead/location when necessary and materialized as a `sales_visits` row with status `planned`, its
estimated arrival in `scheduled_at`, and `source = prospecting-route`. The stop stores the resulting
`visit_id`. The Visits screen remains the single agenda/execution surface; prospecting does not own
a parallel calendar. Starting a planned visit updates that same row to `in_progress`, so the route
does not create duplicate visit history. Check-in moves the linked stop to `checked_in` and starts
the route; checkout completes the stop, while cancellation skips it. The route closes automatically
after its final open stop.

## API foundation

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/xpot/prospecting/jobs` | Queue a territory with one or more sector searches |
| GET | `/api/xpot/prospecting/jobs` | List the acting rep's jobs |
| GET | `/api/xpot/prospecting/jobs/:id` | Return owned job, physical runs and ranked candidates |
| POST | `/api/xpot/prospecting/jobs/:id/refresh` | Advance the queue/poller and return current details |
| POST | `/api/xpot/prospecting/jobs/:id/retry` | Explicitly requeue this job's failed physical searches |
| POST | `/api/xpot/prospecting/routes` | Build a draft from a job, candidate ids and/or owned lead ids |
| GET | `/api/xpot/prospecting/routes` | List owned routes |
| GET | `/api/xpot/prospecting/routes/:id` | Return a route with ordered stops |
| PATCH | `/api/xpot/prospecting/routes/:id/status` | Publish, start, complete or cancel a route |
| PATCH | `/api/xpot/prospecting/routes/:routeId/stops/:stopId` | Record stop execution and optional visit link |

## Google route optimization

The daily route is calculated by the Google Route Optimization API when
`GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID` is configured. Xpot sends one vehicle,
the seller's current position, the selected shift boundary, every eligible
candidate, and a 20-minute service duration for each visit. Road travel time,
traffic, visit order, return travel, and the encoded road polyline come back in
one response. The old deterministic Haversine optimizer remains available only
for local environments where Google is not configured.

Xpot persists the response before presenting it. A unique database index on
`(rep_id, route_date)` and an API reuse check enforce **one optimization per
seller per day**. Browser refreshes, retries, a second scrape, and route publish
actions reuse that row and cannot generate a second Google optimization. The
web map renders the stored encoded polyline with a referrer-restricted Maps
JavaScript key; it does not call Directions or optimize the route again.

Required deployment variables:

- `GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID`
- one of `GOOGLE_ROUTE_OPTIMIZATION_CREDENTIALS_FILE` (preferred) or
  `GOOGLE_ROUTE_OPTIMIZATION_CREDENTIALS_JSON`
- `VITE_GOOGLE_MAPS_API_KEY` at client build time

The Google Cloud project should enable Route Optimization API and Maps
JavaScript API. Keep the service-account JSON in the platform secret store, not
in Git. Restrict the browser key to the production origins and Maps JavaScript
API. Billing budgets are alerts, not hard caps; Xpot's daily uniqueness rule is
the cost-control boundary.

All endpoints are rep-scoped and protected by the Visits module gate. Managers do not silently gain
access to another customer's queue or route through these endpoints.

## Route optimizer

The first version is deterministic and explainable. It combines candidate score with proximity,
uses Haversine distance and a conservative average speed, and accepts a stop only when the visit
and return to the configured end still fit inside the shift. Storage and API contracts isolate the
optimizer so a road-time matrix can replace it later.

Recommended evolution:

1. Mobile execution: today's route, skip reason and check-in handoff.
2. Road-aware travel matrix plus business hours and historical duration learning.
3. CRM revisit agenda, kept separate from new-business prospecting.
4. Organization/team quotas and manager assignment after organization tenancy exists.
5. Move the same engine container from Home Lab to the hosted server by changing configuration.

## Acceptance criteria for this foundation

- An active Xpot Visits user can queue several sectors without any XScraper account.
- No XScraper or Apify URL, token, provider type or data model exists in the Xpot flow.
- Only one physical extraction runs at a time and queue ownership survives restarts.
- Completed CSV data becomes normalized, scored, deduplicated candidates owned by the rep.
- Routes can mix newly discovered candidates and existing Xpot prospects.
- Publishing a route promotes candidates to prospects without duplicating a Google Place ID.
- Repeating route creation for the same rep, discovery job and day reuses the existing active route.
- Publishing materializes ordered planned visits; check-in and checkout update the same visit and stop.
- Routes respect maximum stops and total working time and exclude missing coordinates visibly.
