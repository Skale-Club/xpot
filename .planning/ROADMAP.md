# Roadmap: Xpot Task Operations

## Overview

This milestone establishes one organization-scoped task lifecycle and then exposes it through each existing Xpot channel. Work starts with the canonical task model and shared service, adds the HTTP workflow, routes visit-audio actions and downstream CRM mirrors through that service, exposes the same capability to OAuth-authorized MCP clients, and finishes with the mobile-first task inbox plus end-to-end release validation.

## Phases

- [x] **Phase 1: Canonical Task Foundation** - Establish durable task records and one authoritative service for lifecycle rules and side effects.
- [x] **Phase 2: Authorized HTTP Operations** - Give HTTP clients a complete, organization-safe, idempotent task workflow.
- [x] **Phase 3: Visit Audio Task Creation** - Turn confirmed audio follow-ups into evidence-linked tasks through the shared service.
- [x] **Phase 4: Best-Effort CRM Mirroring** - Mirror task creation and lifecycle changes to configured CRMs without risking local success.
- [x] **Phase 5: Account-Bound MCP Tasks** - Let authorized AI clients operate tasks through explicit OAuth scope and guarded MCP tools.
- [x] **Phase 6: Operational Task Inbox** - Give reps and admins a dedicated, mobile-first place to find and act on follow-up work.
- [x] **Phase 7: Release Confidence** - Prove authorization and lifecycle behavior across channels and leave the production build green.

## Phase Details

### Phase 1: Canonical Task Foundation
**Goal**: Every task producer can rely on one durable, organization-scoped task model and one authoritative lifecycle service.
**Depends on**: Nothing (first phase)
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05
**Success Criteria** (what must be TRUE):
  1. A created task records its organization, assignee, creator, source, priority, work type, due date, lifecycle state, and applicable lifecycle timestamps.
  2. Existing task rows remain usable after migration and appear correctly in due-date and assignee-oriented inbox queries.
  3. Task details can include the linked lead, opportunity, visit, and assignee context when those relationships exist.
  4. Every caller using the shared task service receives the same validation, authorization, lifecycle timestamp behavior, and side-effect handling.
**Plans**: TBD

### Phase 2: Authorized HTTP Operations
**Goal**: Reps and managers can complete the full task workflow through the HTTP API within their permitted organization boundary.
**Depends on**: Phase 1
**Requirements**: TASK-06, TASK-07, TASK-08
**Success Criteria** (what must be TRUE):
  1. An HTTP client can list, filter, search, create, read, edit, reassign, complete, reopen, and cancel tasks.
  2. A rep can access only tasks in their organization that are assigned to them, while an authorized manager can operate across that organization.
  3. Requests cannot read or mutate tasks belonging to another organization or an unauthorized assignee.
  4. Repeating a mutation with the same caller-provided idempotency key produces one logical change rather than duplicate work.
**Plans**: TBD

### Phase 3: Visit Audio Task Creation
**Goal**: Users can confirm an audio-derived follow-up and receive a correctly sourced task without bypassing the canonical lifecycle.
**Depends on**: Phase 2
**Requirements**: TASK-09, TASK-10
**Success Criteria** (what must be TRUE):
  1. Applying a proposed follow-up from visit audio creates exactly one voice-sourced task through the shared task service.
  2. The created task retains its visit and lead evidence so the user can trace why the follow-up exists.
  3. Explicit or inferred due-date intent from the confirmed audio proposal is reflected in the task.
**Plans**: TBD

### Phase 4: Best-Effort CRM Mirroring
**Goal**: Local task operations remain authoritative while configured GHL and Xphere systems receive reliable downstream mirrors.
**Depends on**: Phase 3
**Requirements**: TASK-11, TASK-12
**Success Criteria** (what must be TRUE):
  1. Creating or changing the lifecycle of a local task sends the corresponding update to GHL when GHL is configured.
  2. Task changes are mirrored to Xphere under a stable external identity when Xphere is configured.
  3. A GHL or Xphere outage never turns an otherwise valid local task mutation into a failure.
  4. Users or operators can distinguish successful local work from a failed downstream synchronization attempt.
**Plans**: TBD

### Phase 5: Account-Bound MCP Tasks
**Goal**: Connected AI clients can safely operate the same task lifecycle on behalf of the authorizing Xpot account.
**Depends on**: Phase 4
**Requirements**: TASK-13, TASK-14, TASK-15
**Success Criteria** (what must be TRUE):
  1. A user can explicitly grant or deny task access through clear OAuth consent copy and a dedicated task scope.
  2. An authorized MCP client can list, get, create, update, complete, reopen, and cancel tasks.
  3. MCP task operations are constrained to the authorizing account and organization and reject invalid or unauthorized input.
  4. Retried MCP mutations are idempotent and do not create duplicate tasks or lifecycle transitions.
**Plans**: TBD

### Phase 6: Operational Task Inbox
**Goal**: Reps and admins can find, prioritize, and update their follow-up work from a dedicated mobile-first Tasks experience.
**Depends on**: Phase 5
**Requirements**: TASK-16, TASK-17, TASK-18, TASK-19
**Success Criteria** (what must be TRUE):
  1. Users can open the Tasks destination from both desktop and mobile navigation.
  2. Open work is grouped into overdue, today, tomorrow, upcoming, and no-date buckets with each task shown in the correct bucket.
  3. Users can search and filter tasks, create or edit a task, assign it, and change its lifecycle state from the Tasks screen.
  4. Existing embedded sales follow-up flows continue to create and manage tasks correctly under the richer model.
**Plans**: TBD
**UI hint**: yes

### Phase 7: Release Confidence
**Goal**: The complete task workflow is demonstrably safe across its entry points and ready for production use.
**Depends on**: Phase 6
**Requirements**: TASK-20, TASK-21
**Success Criteria** (what must be TRUE):
  1. Automated checks prove representative and manager authorization boundaries and all supported lifecycle transitions.
  2. Automated checks prove MCP scope and account isolation and confirmed audio task creation.
  3. Type checking, targeted task tests, the full automated test suite, and the production build all pass from a clean run.
**Plans**: TBD

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Canonical Task Foundation | 1/1 | Complete | 2026-10-13 |
| 2. Authorized HTTP Operations | 1/1 | Complete | 2026-10-13 |
| 3. Visit Audio Task Creation | 1/1 | Complete | 2026-10-13 |
| 4. Best-Effort CRM Mirroring | 1/1 | Complete | 2026-10-13 |
| 5. Account-Bound MCP Tasks | 1/1 | Complete | 2026-10-13 |
| 6. Operational Task Inbox | 1/1 | Complete | 2026-10-13 |
| 7. Release Confidence | 1/1 | Complete | 2026-10-13 |
