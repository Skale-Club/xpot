# Telegram operations

Xpot uses the shared `@skaleclubbot` for outbound notifications to its own group. There is no inbound webhook or approval workflow. Existing signup facts, HTML escaping, WhatsApp buttons, abandoned-draft timing (30 minutes, scanned every five minutes), and delivery acknowledgment remain unchanged; their headings now use the shared severity vocabulary.

## Configuration

GitHub repository secrets: `XPOT_TELEGRAM_BOT_TOKEN`, `XPOT_TELEGRAM_CHAT_ID` (numeric group ID). Repository variable `OPS_TELEGRAM_ENABLED=true` explicitly enables operations delivery. The helper additionally requires `OPS_ENVIRONMENT=production`, `GITHUB_ACTIONS=true`, and `GITHUB_REF=refs/heads/main`. Development never sends operations messages. Runtime signup notices (completed applications and abandoned drafts) are sales leads, not operations: they go only to the **Xpot | Leads** group in `XPOT_LEADS_TELEGRAM_CHAT_ID` (negative group ID, different from `XPOT_TELEGRAM_CHAT_ID`), with the same shared bot token. A missing, malformed or Ops-equal value disables them; they never fall back to the Ops group.

The stdlib-only helper bounds network timeouts and response reads, refuses redirects, validates credentials, and never prints transport exception strings or Telegram response bodies. Messages use plain text. Delivery is best effort and never converts a failed health probe or deployment into success. Runtime signup delivery and abandoned-draft scanning are production-only, even if credentials are accidentally present in development.

`/api/health/ready` uses a separate read-only PostgreSQL slot (max one), with 1.5-second connection and two-second query/statement deadlines. A ten-second cache and shared in-flight query bound public probe traffic without consuming the business connection pool. Provider errors and connection details are never returned. Liveness stays independent of database readiness.

## Deployments and CI

CI runs on main, dev and pull requests; production deployment remains main-only and gated on successful push CI (manual dispatch retains the existing emergency path). Deployment source checkout follows the validated SHA. Existing current-main guard and deployment concurrency remain in place. Superseded/unconfigured skipped deployments send no success message. Start, verified completion, failure/cancellation, and failed main CI gates use Portuguese severity messages.

Success requires the canonical `https://xpot.place` liveness, readiness/database and HTML probes plus exact `/api/version` equality to the expected 40-character SHA. Missing `SOURCE_COMMIT` fails verification. Coolify finishing alone cannot claim success. Readiness checks are implemented separately by the server and do not equate process liveness with database health.

## External uptime

The production uptime workflow runs every ten minutes (GitHub schedules can be delayed). It probes only `https://xpot.place`, retries down results twice, and classifies readiness/database failures or unreachable/non-HTML public pages as down. Readiness degradation or database latency above 1500 ms is degraded; two consecutive degraded observations are required before alerting. A cold healthy baseline is silent. Down, degraded and recovery notifications are transition-only; failed delivery remains unacknowledged and retries next run.

GitHub Actions cache persists observed health separately from the last acknowledged notification. Cache eviction can reset the baseline and can repeat an active incident notification. Recovery is announced only after an acknowledged incident. Workflow failure and its summary retain the actual health result regardless of delivery. There is no duplicate host watchdog; shared infrastructure monitoring covers managed containers.

## Verification

Run `python3 -m unittest discover -s scripts/ops -p "test_*.py"` offline. Tests cover the production gate, credential validation, Telegram acknowledgment, readiness vs liveness, exact/missing SHA, and incident/recovery deduplication including delivery retry.
