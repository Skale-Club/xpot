# Prospecting engine runbook

This runbook operates Xpot's direct connection to `gosom/google-maps-scraper`. XScraper and Apify
are not part of this path. The engine is an execution worker only; Xpot owns users, the FIFO queue,
candidates, routes and visits.

## Production configuration

Set these server-side variables in Coolify and redeploy Xpot:

```text
PROSPECTING_ENGINE_URL=https://scraper.example.com
PROSPECTING_ENGINE_CF_CLIENT_ID=<Cloudflare Access service-token id>
PROSPECTING_ENGINE_CF_CLIENT_SECRET=<Cloudflare Access service-token secret>
PROSPECTING_ENGINE_MAX_TIME_SECONDS=1800
PROSPECTING_ENGINE_DEPTH=10
PROSPECTING_ENGINE_POLL_MS=15000
GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID=skaleclub
GOOGLE_ROUTE_OPTIMIZATION_CREDENTIALS_FILE=/run/secrets/google-route-optimizer.json
VITE_GOOGLE_MAPS_API_KEY=<referrer-restricted browser key>
```

The two Cloudflare values are optional only when the worker is reachable through a trusted private
network or another server-side boundary. Never place them in a client variable, browser request,
log message or screenshot.

The current Home Lab can remain behind its existing Cloudflare Access application. Migrating later
to a hosted worker requires changing only the URL and, if applicable, its credentials.

### Current Home Lab connection

Configured on 2026-10-12:

- engine endpoint: `https://scraper.skale.club`;
- dedicated Cloudflare service token: `Xpot Production`;
- Cloudflare Access policy: `Xpot Production (service token)`, action `Service Auth`, attached only
  to the `Homelab scraper (Xcraper)` application;
- the URL, client id and client secret are stored as runtime variables in Coolify for both
  production and preview deployments;
- the Xpot container was redeployed successfully and passed its health check;
- a server-side probe to a deliberately nonexistent engine job returned HTTP `422` with
  `application/json`. An unauthenticated or rejected request returns `302`, so this verifies that
  Cloudflare accepted the dedicated Xpot credential and forwarded the request to the engine.

The token secret is intentionally not recorded in this repository. Rotate the id and secret
together if the token is replaced.

## Deployment behavior

The Docker entrypoint runs `dist/migrate.cjs` before starting the server. Migration
`0032_prospecting_routes.sql` and `0033_google_daily_route_optimization.sql` are transactional and
tracked by `_xpot_migrations`. The latter enforces one route optimization per rep/day. The server starts
the queue worker after Express begins listening. One PostgreSQL advisory lock plus a partial unique
index permits only one `starting` or `running` physical extraction across all Xpot accounts.

If the engine URL is missing or invalid:

- existing routes and visits continue to work;
- a new discovery request returns HTTP 503 instead of sitting indefinitely in the queue;
- failed searches cannot be retried until configuration is restored.

## First smoke run

1. Redeploy Xpot with the engine variables.
2. Sign in as any active user with the Visits module.
3. Open **Prospecção**.
4. Enter a small city and one sector, for example `Framingham, MA` and `barber shop`.
5. Confirm the job moves from **Na fila** to **Buscando**.
6. Leave the screen and return; the persisted state must still be visible.
7. After completion, confirm the route is prepared automatically and select **Usar esta rota**.
8. Open **Visitas de hoje** and confirm the ordered stops appear as `Planejadas`.
9. On a phone, start one planned visit. Confirm the same visit becomes `Em andamento`, without a
   second history row.
10. Complete the visit and confirm the route stop becomes complete.

Do the first production smoke with one sector. The Home Lab runs one browser job at a time and may
take several minutes because email enrichment visits company websites.

## Database checks

Use read-only queries during diagnosis:

```sql
SELECT id, rep_id, status, location, result_count, error_message, created_at
FROM prospecting_jobs
ORDER BY id DESC
LIMIT 20;

SELECT id, job_id, status, niche, location, engine_job_id, progress, error_message
FROM prospecting_runs
ORDER BY id DESC
LIMIT 30;

SELECT id, route_id, position, status, lead_id, visit_id, name
FROM prospecting_route_stops
ORDER BY route_id DESC, position;
```

Never copy Cloudflare credentials or raw environment output into an incident report.

## Failure handling

- **Engine not configured:** restore the server variables and redeploy.
- **Cloudflare rejected request:** verify the Access application accepts the service token and that
  both token fields were rotated together.
- **Network/timeout while starting:** the run is marked failed and is not retried automatically,
  because the remote engine might have accepted the job before the response was lost. The rep can
  explicitly choose **Tentar novamente**.
- **Remote job exceeded its deadline:** the run fails after `max_time` plus ten minutes of grace,
  freeing the Xpot queue slot.
- **Some sectors completed and one failed:** completed candidates remain available; retry requeues
  only the failed physical run.
- **Google optimization fails:** verify the Route Optimization API, service-account role, project id,
  and mounted credential. Xpot does not silently publish an estimated route when Google is configured.
- **Map preview fails but the route exists:** verify `VITE_GOOGLE_MAPS_API_KEY` was present at build
  time and is restricted to `https://xpot.place/*`, `https://*.xpot.place/*`, and Maps JavaScript API.

## Cutover to a hosted worker

1. Deploy the same engine version with concurrency `1` and bounded CPU/memory.
2. Protect the endpoint with a private network or server-to-server authentication.
3. Run a direct engine smoke outside Xpot.
4. Change `PROSPECTING_ENGINE_URL` and credentials in Xpot.
5. Redeploy and run the one-sector smoke above.
6. Keep the Home Lab endpoint available until a full Xpot route completes.

No candidate, lead, route or visit migration is necessary during the cutover.

## MCP execution

The same persisted job service used by `POST /api/xpot/prospecting/jobs` is available through the
Xpot MCP server. The credential is bound to the Xpot user that created the static token or approved
the OAuth connection, so jobs are created for that user's representative profile. OAuth clients
should request only the `xpot:prospecting` scope; this does not expose the Tags Journey tools:

- `prospecting_create_today`: accepts `location`, 1-5 `sectors`, an optional `shiftHours`
  (2/4/6/8/10/12, default 8), and an optional idempotency key;
- `prospecting_job_get`: reads a specific job or the newest job for that account.

Example arguments for a small smoke run:

```json
{
  "location": "Framingham, MA",
  "sectors": ["barber shop"],
  "shiftHours": 8,
  "idempotencyKey": "today:2026-10-12:framingham:barber-shop"
}
```

Legacy static tokens without a creator cannot run prospecting. Replace them with a token created by
the intended Xpot account, or use OAuth. The Tags Journey tools remain available as before.

## Rollback

Point the environment variables back to the previous worker and redeploy. If no worker is safe,
unset `PROSPECTING_ENGINE_URL`; Xpot will reject new discovery while preserving every route and
visit already created.
