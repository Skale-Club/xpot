# Xpot UI kit

The shared look of the app lives in `client/src/components/ui` (primitives),
`client/src/components/xpot` (Xpot parts) and `client/src/lib/format.ts`
(formatters). New screens use these; old screens move onto them as they are
touched. Each file has a header comment with usage; this page is the index.

## Rules

- **One meaning per colour.**
  - Brand blue (`BRAND_GRADIENT`, `--primary` = `#3b82f6`) is the primary action and keyboard focus.
  - Green (`SUCCESS_GRADIENT`, emerald) is money and success only: a sale, a payment, "paid", "done". Never a module, never "selected".
  - Violet (`MODULE_ACCENT.tags`) is the Tags module only. Visits and the account pages never use it.
  - Amber means "needs a step" (follow up, due today, not received, incomplete).
    Money still to collect (outstanding, sold and not fully paid, not late) is
    amber everywhere, on a tile and a banner alike.
  - Red is destructive, broken or late: an overdue task or settlement is red.
  - Money going out or not earned (acquisition cost, cost of goods, discounts)
    is the neutral cost tone (`MONEY_CHART.cost`, slate), never amber or rose.
  - Slate is idle or neutral; muted is finished and out of play.
- **One of each.** One button (`ui/button`), one pill (`Pill`), one empty
  state (`EmptyState` / `ErrorState`), one confirmation (`ConfirmDialog`), one
  input (`Field` + `Input`/`Select`/`Textarea`), one modal shell (`ui/dialog`,
  `ui/alert-dialog`), one tab bar (`Tabs`), one view switch (`Segmented`), one
  filter bar (`FilterBar`), one table (`CompactDataTable`), one loader
  (`ui/loader` `Loader2` / `ui/spinner` `DotsLoader`).
- **Don't override the shell.** Dialogs, sheets and popovers already have the
  surface, border, overlay and radius; a dialog that needs to look different is
  a different component.
- **Focus** is drawn only by the global outline in `index.css` (brand blue).
  Components don't add focus rings; rows inside clipped containers pull the
  outline in with `focus-visible:!-outline-offset-2`.
- **Text** goes through i18n (`client/src/i18n/messages`); kit strings are in
  `common.ts` and `kit.ts`. Dates, money, distances and durations go through
  `lib/format.ts`.

## Tokens (`components/xpot/surface.ts`)

| Token | Value | Use |
| --- | --- | --- |
| `GLASS` / `GLASS_CLASS` | white 0.04 fill, 0.09 border | Cards |
| `GLASS_SUBTLE` / `GLASS_SUBTLE_CLASS` | white 0.025 fill, 0.07 border | Bars and containers: filter bar, sections, tables, KPI tiles |
| `GLASS_RAISED` | GLASS + shadow | Cards floating over the page |
| `SURFACE_MODAL` / `SURFACE_MODAL_CLASS` | `#0d1322` | Dialogs, sheets, popovers, menus, `<option>` |
| `OVERLAY_CLASS` | `bg-black/60 backdrop-blur-sm` | Behind dialogs and sheets |
| `PAGE_GRADIENT` / `PAGE_BASE` | `#060912` base | Page background, boot screen, `theme-color` |
| `BRAND_GRADIENT` | `#3b82f6 → #6366f1` | Primary action |
| `SUCCESS_GRADIENT` | `#10b981 → #06b6d4` | Money actions |
| `DANGER_SURFACE` | `#ef4444` tint | Error box, danger zone of a form |
| `DANGER_OUTLINE` | red text and border | Classes for the outline Button that opens a destructive ConfirmDialog (block, remove, revoke) |
| `MODULE_ACCENT` | visits blue, tags violet, account slate | Where you are |
| `ACCENT_GRADIENT`, `ACCENT_SELECTED` | per module | Primary fill and "selected" state per module |
| `EYEBROW`, `TABLE_HEAD` | 10px uppercase, white/40 | Small labels, table headers |

Radius scale (also Tailwind classes; each equals a stock step so `cn()` can
override it):

| Name | Tailwind | Size | Use |
| --- | --- | --- | --- |
| control | `rounded-control` = `rounded-xl` | 12px | Inputs, buttons, chips |
| card | `rounded-card` = `rounded-2xl` | 16px | Cards, sections, tables, empty states |
| sheet | `rounded-sheet` = `rounded-3xl` | 24px | Dialogs, sheets, side panes |

CSS variables (`index.css`, `.dark`): `--background` is the navy page base,
`--card` `#0b1020`, `--popover` `#0d1322`, `--muted` `#111a2e`,
`--primary`/`--ring` `#3b82f6`, `--border` white 0.09. Tailwind 3 only generates
opacity steps in multiples of 5, so the extra steps the screens use
(`/8 /12 /28 /32 /34 /38 /78 /82`) are registered from `OPACITY_STEPS`;
`tests/ui-kit.test.ts` fails on any other step.

## Components

| Component | File | Notes |
| --- | --- | --- |
| `Button` | `ui/button.tsx` | Variants `brand`, `money`, `danger`, `secondary`, `outline`, `ghost` (`default` and `destructive` kept for old callers); sizes `sm`, `default` (44px), `lg`, `icon`; `loading` shows the dots and keeps the width; `accent="tags"` turns the primary violet. |
| `Dialog`, `AlertDialog` | `ui/dialog.tsx`, `ui/alert-dialog.tsx` | One shell; `closeLabel` overrides the translated Close. |
| `DotsLoader`, `Loader2` | `ui/spinner.tsx`, `ui/loader.tsx` | Animated dots; `label` for screen readers. |
| `ConfirmDialog` | `xpot/ConfirmDialog.tsx` | `tone="danger"`, `reason="required" \| "optional"`, `confirmWord`, `pending`, `confirmDisabled`. Never closes while the action runs; closes when a returned promise resolves and stays open if it rejects. A void `onConfirm` closes at once unless `autoClose={false}`. The one confirmation: no `window.confirm` / `prompt`. |
| `PageHeader`, `BackLink` | `xpot/PageHeader.tsx` | 44px round back, eyebrow, title, actions, safe-area padding. |
| `Field`, `Input`, `Select`, `Textarea` | `xpot/Field.tsx` | 44px control, 16px text on phones (no iOS zoom), error line wired to the control. |
| `FormFooter`, `UnsavedNote` | `xpot/FormFooter.tsx` | Right-aligned Cancel then the primary (brand, disabled while clean), "Unsaved changes" on the left while dirty; `sticky` only for long editors. |
| `SwitchRow` | `xpot/SwitchRow.tsx` | One on/off setting (label, hint, Switch); checkboxes only for picking several. |
| `CopyButton` | `xpot/CopyButton.tsx` | Inline check for 1.5 s; no toast. |
| `Pill` | `xpot/StatusPill.tsx` | `tone`, optional `dot` and `bordered`. |
| `EmptyState`, `ErrorState` | `xpot/EmptyState.tsx` | Tones `indigo` (default, Visits and account), `tags` (violet), `red`; `action`, `onRetry` / `retryLabel`; `compact` inside sections. ErrorState has `role="alert"` and its own Retry. |
| `ListSkeleton` | `xpot/ListSkeleton.tsx` | Placeholder rows while a list loads (`rows`, `rowClassName`), so an empty state never flashes first. |
| `RetryButton` | `xpot/RetryButton.tsx` | The "Try again" action under a failed load (`onRetry`, `busy`, `label`); EmptyState/ErrorState draw this same one for `onRetry`. |
| `InlineAlert` | `xpot/InlineAlert.tsx` | `info`, `success`, `warning`, `error`, with icon and role. |
| `KpiTile`, `Stat` | `xpot/DashboardKit.tsx`, `xpot/Stat.tsx` | KpiTile is the dashboard tile (a button when it has `onClick`, a plain card without); `accent` `blue` (default), `emerald` (money), `violet` (Tags), `amber`; `loading`. Stat is label over value. |
| `SectionCard` / `DashboardSection` | `xpot/DashboardKit.tsx` | Card with a title row and actions; `accent` tints the icon tile with the module accent (violet in Tags); `testId`. The title row wraps instead of overflowing. |
| `Tabs`, `Segmented`, `PeriodSelector` | `xpot/Tabs.tsx`, `xpot/Segmented.tsx` | `accent` per module (`visits` blue by default, `tags` violet, `account` slate on account pages); a tab may carry a `badge`. Segmented has `size="sm"` and `ariaLabel`; PeriodSelector is a small Segmented. |
| `CommandPalette` | `xpot/CommandPalette.tsx` | `accent` for the selected row. |
| `FilterBar` and parts, `ListPager` | `xpot/filters.tsx`, `xpot/pagination.tsx` | The one filter bar and pager. `FilterChips` takes `accent` (`tags` draws the chosen chip violet; indigo by default). |
| `CompactDataTable` | `xpot/CompactDataTable.tsx` | The one table. Column `align` (`right` = tabular figures, for counts and money) and `ariaSort`; row `onRowClick`, `getRowAriaLabel`, `getRowTestId`, `getRowClassName`; the selected row from `selectedKey` (one key) or `isRowSelected` (a predicate), drawn as a neutral highlight. |
| `MasterDetail` | `xpot/MasterDetail.tsx` | Desktop list + detail: a sticky column beside the list from `xl`, a centred pop-up between `lg` and `xl` (always with `popup`); Escape closes it. Used by People, the Sales lists and the Tags customer and pieces screens; not yet by the management detail views (a piece, a batch, a kit). |
| `AdminBadge` | `xpot/AdminBadge.tsx` | The amber "Xpot admin" tag, once per group heading or screen (`useIsSuperAdmin`); `compact` (a shield, the words for screen readers) on a sidebar row, `dot` in the collapsed sidebar. |
| `ScopeChip` | `xpot/ScopeChip.tsx` | "Viewing: everyone / my organization / only me" on the lists management mode widens (`managementScope` in `moduleNav.ts`), worded by `scopeChipState`: everyone for a manager, my organization for an org admin, only me with the mode off; tapping it switches the mode (on Tasks, the "Whole team" filter). Where an org admin's mode widens nothing (visits, pipeline, Tags) it only says "only me". AppLayout places it. |
| `VisitsTabBar` | `xpot/VisitsTabBar.tsx` | The Visits phone tab bar (Dashboard, Route, Companies, Tasks, Sales) plus Manage in management mode; the Visits management screens keep it. `TagsTabBar` (`pages/tags/TagsTabBar.tsx`) is its Tags twin. |
| `useUnsavedChangesGuard` | `hooks/useUnsavedChangesGuard.ts` | While dirty, leaving the screen asks first (browser prompt on reload, held in-app link); the screen draws the dialog. A move made in code (a tab strip) goes through `navigateGuarded` so it is held too. |

## Tone maps (`components/xpot/StatusPill.tsx`)

Pick a pill's tone from a map, never on the screen: `toneOf(MAP, status)`.

| Map | Values |
| --- | --- |
| `VISIT_OUTCOME_TONE` | sale_made green; follow_up, came_back_later amber; no_answer, planned, cancelled slate; not_interested, invalid red; completed sky; in_progress blue |
| `PAYMENT_STATUS_TONE` | paid green, partial amber, unpaid red |
| `SALE_STATUS_TONE` | completed green, cancelled muted |
| `CONSIGNMENT_STATUS_TONE` | active blue, closed muted |
| `TASK_TONE` | overdue red, due_today amber, upcoming/open slate, done green |
| `ROUTE_STATUS_TONE` | draft slate, published blue, in_progress blue, completed green, cancelled slate |
| `STOP_STATUS_TONE` | planned slate, en_route/checked_in blue, completed green, skipped muted, rescheduled amber |
| `INTEGRATION_TONE` | live green, incomplete amber, idle/off slate, broken red |
| `HEALTH_TONE` (`RUN_STATUS_TONE`) | ok/healthy/completed green, running/starting blue, slow/stuck amber, failed/stalled/down red, idle/queued slate, cancelled muted |
| `ROLE_TONE` | admin (Xpot admin) amber, manager blue, rep slate |
| `LEAD_STATE_TONE` (`pages/xpot/components/leads/LeadStatePill.tsx`) | prospect slate, lead sky, customer and active (shown as Customer) blue, inactive muted. No green (money) and no violet (Tags) |
| `PIECE_STATUS_TONE` | inventory slate, assigned amber, active green, disabled/damaged red, retired muted |
| `STOCK_STATUS_TONE` | pending amber (not received), available slate, reserved blue, internal_use slate, sold blue (`SOLD_TONE`), damaged/lost red, retired muted |
| `SOLD_TONE` | blue: a recorded sale, so it never reads as "Live" |
| `CHIP_STATUS_TONE` | not_programmed/failed red, programmed amber, verified/locked green |
| `BATCH_STATUS_TONE` | draft slate, open/generated blue, ordered amber, received violet, closed/completed green, cancelled red |
| `BATCH_STAGE_TONE` | issued slate, built amber, printed blue, receiving violet, received green, cancelled red |
| `PROVISIONER_STATUS_TONE` | An NFC writer (and an MCP token): active green, pairing amber, revoked muted |
| `PROVISIONING_JOB_TONE` | pending slate, claimed/writing/verifying blue, succeeded green, failed red, cancelled/expired muted |
| `JOURNEY_KIND_TONE` | execution slate, decision blue, insight violet, observation muted, risk amber, result green |
| `JOURNEY_ENTRY_STATUS_TONE` | active blue, needs_review amber, archived/superseded muted |
| `PLAN_STATUS_TONE` | draft slate, active blue (the same blue as a journey entry), paused amber, validated/done green, invalidated red, cancelled muted |

## Chart colours

| Palette | File | Values |
| --- | --- | --- |
| `MONEY_CHART` | `pages/xpot/components/sales/moneyPalette.ts` | The one money palette of the Visits charts and tiles (Dashboard and Sales; the sale detail and the Tags sale dialog take its `text`): revenue cyan (`#22d3ee` / `#06b6d4`), profit emerald (`#34d399` / `#10b981`), cost slate (`#94a3b8` / `#64748b`, `text-slate-300`) for acquisition cost, cost of goods and discounts. Cost stays readable beside the other two on the page base (contrast above 7:1, `tests/ui-kit.test.ts`) and reads as neutral, not as a warning. Counts that are not money stay neutral |
| `MONEY_DUE_TONE` | same file | Money still to come in: `outstanding` amber (collect it), `overdue` red (a settlement past its date). The Sales tile and banner and the Dashboard's attention list take it |
| `QR_COLOR`, `NFC_COLOR` | `pages/tags/charts.ts` | Tags scans: QR blue `#60a5fa`, NFC violet `#a78bfa`, on every Tags chart, counter and the admin analytics. The same file has `formatChartDay`, `chartTooltip` and `formatCount` (Intl) |

## Formatters (`lib/format.ts`)

`formatDateTime`, `formatDate(value, options?)`, `formatTime`,
`formatMoney(cents, currency)` (alias `formatCents`), `formatCurrency` (whole
units), `formatPercent(ratio, { digits })`, `formatShare(part, total)`,
`formatDistance(meters)` (mi/ft in English, m/km otherwise), `formatPhone`
(`shared/phone`), `formatDuration(seconds)`. All use the app language and take
an optional `locale`; a missing value prints `—`.

`lib/dates.ts` has the date formatters of the admin screens (`formatDateTime`,
`formatTime`…), in the app language; `tags/api.ts` re-exports them.

## Module parts

Built on the kit, shared inside one module.

| Part | File | Notes |
| --- | --- | --- |
| Piece sections | `components/piece/` | The one piece screen for every role: `PieceHeader` (Digital, Physical stock and Chip chips, Sold pill, location, customer), `CustomerDestinationSection`, `ChipSection`, `SaleSection`, `PerformanceSection`, `ManagementSection`, `ActivitySection`. `PieceBody` lays them out (`stack` on the reseller screen, `columns` on the admin page); `PieceContext` carries the piece, the viewer and how the host takes a change; `pieceView.ts` is the pure part (chips and tones, `pieceSections` per viewer, action endpoints, the merged timeline) |
| Tags rep parts | `pages/tags/ui.tsx` | `BottomSheet` (title row with X, Escape, focus kept inside, `banner` for errors), `TopBar`, `PieceStatusPills`, `ChipMark`, `ScanCounts`, `StepList`, `SheetActions`, `Banner`; `CARD_ACCENT`, `INPUT_ACCENT`, `TAGS_FILL` for the violet |
| Place picker | `pages/tags/PlacePicker.tsx`, `pages/xpot/components/PlaceSuggestions.tsx` | Google place search: Tags (review link, Google profile) and Visits (`FloatingSuggestions` in the route planner) |
| Company state | `pages/xpot/components/leads/LeadStatePill.tsx` | `LeadStatePill` on `LEAD_STATE_TONE` |
| Task form | `pages/xpot/components/leads/TaskForm.tsx` | `TaskForm` and `NewTaskDialog`: the one task form (company task button, Sales › Pipeline, Tasks) |
| Visit status | `pages/xpot/components/VisitStatus.tsx` | `StatusBadge` on `VISIT_OUTCOME_TONE`, `LocationExceptionBadge` ("Outside area", "Location not checked") |
| Map states | `pages/xpot/components/MapStatus.tsx` | `MapSkeleton` and the translated error tile for both map renderers |
