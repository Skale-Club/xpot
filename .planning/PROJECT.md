# Xpot Task Operations

## Vision

Turn follow-ups into a first-class operational workflow in Xpot. A task has one authoritative lifecycle regardless of whether it was created manually, extracted from a visit audio, or requested by an MCP client.

## Current milestone

**v1.0 — Task Operations**

Deliver an organization-scoped task inbox, reusable task service, MCP tools, visit-audio creation, and best-effort CRM synchronization without importing Xphere's unrelated project-management complexity.

## Users

- Reps manage their own daily follow-ups.
- Organization admins coordinate and assign work across their team.
- Connected AI clients use MCP to create, list, update, complete, and cancel tasks within the authorizing account.
- Visit audio analysis proposes tasks; applying the proposal creates them through the same service as every other channel.

## Product decisions

- `sales_tasks` remains the canonical Xpot task table.
- Tasks are organization-scoped and assigned to a representative.
- Lifecycle: pending, in progress, completed, cancelled.
- Priorities: low, medium, high, urgent.
- Sources are recorded for auditability: manual, voice, MCP, automation, integration.
- Lead, visit, and opportunity links remain explicit relational columns.
- External synchronization is best effort and must never make a valid local task mutation fail.
- The dedicated Tasks screen is mobile-first and supports the operational buckets overdue, today, tomorrow, upcoming, and no date.

## Non-goals

- Project boards, subtasks, dependencies, time tracking, and Xphere project-management features.
- Automatic application of every AI suggestion without the existing user confirmation step.
- Replacing Xpot tasks with a remote CRM as the system of record.

## Constraints

- Preserve existing task API compatibility where practical.
- Enforce organization and assignee authorization on every entry point.
- Use one task service for HTTP, MCP, and visit-audio actions.
- Keep GHL and Xphere failures observable but non-blocking.
