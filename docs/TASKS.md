# Task operations

`sales_tasks` is Xpot's canonical follow-up queue. Manual UI actions, confirmed
visit-audio actions, and MCP calls all go through `server/tasks/service.ts` so
authorization, lifecycle timestamps, idempotency, and integration side effects
stay consistent.

## Lifecycle

- `pending` → `in_progress` → `completed`
- `cancelled` is terminal until the task is reopened.
- Reopening returns the task to `pending` and clears completion/cancellation timestamps.
- Priorities are `low`, `medium`, `high`, and `urgent`.
- Sources are `manual`, `voice`, `mcp`, `automation`, and `integration`.

## HTTP API

- `GET /api/xpot/tasks` — filters: `status` (comma-separated), `priority`, `repId`, `leadId`, `search`, `all`, `limit`.
- `GET /api/xpot/tasks/:id`
- `POST /api/xpot/tasks`
- `PATCH /api/xpot/tasks/:id`
- `POST /api/xpot/tasks/:id/start|complete|reopen|cancel`

All responses include lightweight lead, assignee, and opportunity context.
Reps operate their own assignments. Organization admins can view and assign
work across Organizations they manage; platform managers/admins retain their
global operating access.

## MCP

OAuth clients request `xpot:tasks`. The scope exposes:

- `tasks_list`, `tasks_get`, `tasks_create`, `tasks_update`
- `tasks_start`, `tasks_complete`, `tasks_reopen`, `tasks_cancel`

MCP creation records `source=mcp`. Callers should supply `idempotencyKey` when
retrying a create request. Existing OAuth connections must reconnect if their
token predates the task scope.

## Visit audio

Audio analysis still proposes actions for user confirmation. Applying a
`follow_up` action creates a `source=voice` task with the visit, lead, evidence,
and due-date intent attached. `visit-action-<id>` is the idempotency key, so a
retry cannot create the follow-up twice.

## Integrations

Task changes are best-effort mirrors. Local success never depends on GHL or
Xphere availability. GHL contact tasks are created/updated when the task has a
synced lead and due date. Xphere upserts tasks using the stable external id
`xpot-task-<id>`. Sync attempts are written to `sales_sync_events`.
