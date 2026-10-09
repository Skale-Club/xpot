# Organizations, roles, and physical products — execution plan

## Vision

Xpot supports teams of representatives working together inside isolated Organizations, with clear permissions and correctly classified physical products.

## Access model

Platform roles remain:

- **Admin** — full Xpot access.
- **Manager** — manages Organizations and operations without Admin-only platform and production controls.
- **Rep** — works inside an Organization.

Rep access inside an Organization is a separate membership role:

- **Rep Admin** — a Rep with an `admin` Organization membership.
- **Rep** — a Rep with a `member` Organization membership.

This keeps `Admin`, `Manager`, and `Rep` as the platform roles while allowing multiple people to manage one representative team.

## Success criteria

- Admin, Manager, Rep Admin, and Rep permissions are enforced by the server.
- Every operational resource is scoped to an Organization where applicable.
- A user cannot access another Organization's data by changing a URL or API request.
- Organizations can contain multiple Rep Admins and Reps.
- Product model and printed face are independent concepts.
- The Celes Instagram pieces are classified as `Large Plate`, not `Custom`.
- Administrative terminology is consistent across the UI.

## Slices

- [x] **S01: Physical product models and Celes correction** `risk:low` `depends:[]`
  > After this: batch `IG-2026-001` and its four pieces display as `Large Plate · Instagram`, while the catalog offers Large/Small Stand, Sign, and Plate.

- [x] **S02: Canonical role and management terminology** `risk:medium` `depends:[]`
  > After this: the UI consistently uses Admin, Manager, Rep, Management mode, Exit management, and Admin badges without Super Admin or Owner terminology.

- [x] **S03: Organization creation and membership tracer bullet** `risk:high` `depends:[S02]`
  > After this: an Admin or Manager can create an Organization, assign a Rep Admin, and both users can see the Organization context.

- [x] **S04: Organization team management** `risk:high` `depends:[S03]`
  > After this: a Rep Admin can add, remove, activate, and block Reps only inside their Organization, while Admin and Manager can manage every Organization.

- [x] **S05: Organization-owned inventory and kits** `risk:high` `depends:[S03,S04]`
  > After this: a Manager can give a kit to an Organization, a Rep Admin can distribute its pieces, and each Rep sees the permitted inventory.

- [x] **S06: Organization-scoped customers, sales, and analytics** `risk:high` `depends:[S04]`
  > After this: team members work with shared Organization customers while assignments, sales credit, and analytics remain attributable to individual Reps.

- [x] **S07: Real Organization workspace** `risk:medium` `depends:[S03,S04]`
  > After this: Organization opens a real workspace with Overview, Team, Inventory, Kits, Customers, and Settings instead of being only a navigation label.

- [x] **S08: Management navigation and dashboard cleanup** `risk:low` `depends:[S05,S06,S07]`
  > After this: the dashboard clearly separates Inventory location, Piece lifecycle, and usage metrics, using consistent Rep and Admin terminology.

- [ ] **S09: Cross-role and cross-Organization security verification** `risk:high` `depends:[S01,S02,S03,S04,S05,S06,S07,S08]`
  > After this: automated and browser tests prove the complete Admin → Manager → Rep Admin → Rep flow and reject every cross-Organization access attempt.

## Permission contract

| Capability | Admin | Manager | Rep Admin | Rep |
| --- | --- | --- | --- | --- |
| Platform production, integrations, and NFC writers | Yes | No | No | No |
| Create and edit Organizations | Yes | Yes | No | No |
| Manage any Organization's members | Yes | Yes | No | No |
| Manage own Organization's members | Yes | Yes | Yes | No |
| Receive and distribute Organization inventory | Yes | Yes | Yes | Assigned work only |
| View Organization-wide customers and analytics | Yes | Yes | Yes | Permission/assignment scoped |
| Access another Organization | Yes | Yes | No | No |

## Data invariants

- Platform role and Organization membership role are separate fields.
- `Admin` is the only platform-wide unrestricted role.
- `Manager` may operate across Organizations but cannot use Admin-only production or platform settings.
- Pieces and kits belong to an Organization and may also be assigned to a Rep.
- Customers belong to an Organization and may also be assigned to a Rep.
- Sales credit remains attached to the individual Rep.
- Authorization is enforced in the API; hiding navigation is never the security boundary.
- Sensitive membership and inventory changes are recorded in an audit trail.

## UI terminology

- `Admin mode` → `Management mode`
- `Exit admin mode` → `Exit management`
- `All pieces` → `Inventory`
- `Resellers` → `Reps`
- `Stock` → `Inventory location`
- `In house` → `Company stock`
- `With resellers` → `With reps`
- `Status` → `Piece lifecycle`
- `Not sold` → `Available`
- `No link yet` → `Assigned`
- `Off` → `Disabled`
- `Approx. unique` → `Estimated unique visitors`

## Migration decision

Existing Reps must be assigned to Organizations during S03. Preferred rule:

1. Group Reps by a known existing team or business relationship when reliable data exists.
2. Otherwise create an individual Organization for the Rep.
3. Allow Admin or Manager to merge or reorganize memberships later without losing inventory, customers, or sales history.

## Definition of done

- All slices meet their demo statements.
- Database migrations are reversible or have documented recovery procedures.
- Type checking, automated tests, production build, and browser acceptance tests pass.
- Permission tests cover allowed and denied behavior for every role.
- Existing customers, pieces, scans, kits, and sales history remain intact.
- Production migrations and deployment are completed and verified against the live system.

## Execution status

- S01–S08 are implemented in the application and database migration.
- S09 automated authorization coverage is implemented, including denied cross-Organization API and URL access.
- Type checking, the full automated test suite, and the production build are the release gates for this change.
- Browser acceptance, production migration, and deployment remain release activities and must be completed together so older application code never runs against the new required Organization columns.
