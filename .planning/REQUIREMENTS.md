# Requirements — v1.0 Task Operations

## Data and lifecycle

- [x] TASK-01 Tasks belong to an organization and an assignee, and record creator and source.
- [x] TASK-02 Tasks support priority, typed work, due date, in-progress, completion, cancellation, and lifecycle timestamps.
- [x] TASK-03 Existing rows are safely backfilled and indexed for inbox queries.
- [x] TASK-04 Task reads can include linked lead, opportunity, visit, and assignee context.

## Service and API

- [x] TASK-05 One task service owns validation, authorization, lifecycle timestamps, and side effects.
- [x] TASK-06 HTTP clients can list/filter/search, create, read, edit, reassign, complete, reopen, and cancel tasks.
- [x] TASK-07 Reps are limited to their organization and own assignments; authorized managers can work across their organization.
- [x] TASK-08 Mutations are idempotent when an external caller supplies an idempotency key.

## Audio and integrations

- [x] TASK-09 Applying a follow-up extracted from visit audio creates a voice-sourced task through the shared service.
- [x] TASK-10 Audio-created tasks preserve visit/lead evidence and due-date intent.
- [x] TASK-11 Task creation and lifecycle changes synchronize to GHL when configured without blocking local success.
- [x] TASK-12 Task changes mirror to Xphere when configured with a stable external identity.

## MCP

- [x] TASK-13 OAuth exposes an explicit task scope with clear consent copy.
- [x] TASK-14 MCP provides tools to list/get/create/update/complete/reopen/cancel tasks.
- [x] TASK-15 MCP tools are account-bound, organization-aware, validated, and idempotent.

## User experience

- [x] TASK-16 Xpot has a dedicated Tasks destination in desktop and mobile navigation.
- [x] TASK-17 The task inbox groups open work by overdue, today, tomorrow, upcoming, and no date.
- [x] TASK-18 Users can search/filter and create/edit/assign/change task state from the Tasks screen.
- [x] TASK-19 Existing embedded sales follow-up functionality continues to work with the richer model.

## Quality

- [x] TASK-20 Automated tests cover authorization, lifecycle behavior, MCP access, and audio task creation.
- [x] TASK-21 Type checking, targeted tests, full tests, and production build pass.
