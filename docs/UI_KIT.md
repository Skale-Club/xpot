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
  - Red is destructive or broken.
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
| `BRAND_GRADIENT` / `BRAND_BLUE` | `#3b82f6 → #6366f1` | Primary action |
| `SUCCESS_GRADIENT` | `#10b981 → #06b6d4` | Money actions |
| `DANGER_GRADIENT` / `DANGER_SURFACE` | `#ef4444 → #e11d48` | Destructive action / error box |
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
| `ConfirmDialog` | `xpot/ConfirmDialog.tsx` | `tone="danger"`, `reason="required" \| "optional"`, `confirmWord`, `pending`. Never closes while the action runs; closes when a returned promise resolves. |
| `PageHeader`, `BackLink` | `xpot/PageHeader.tsx` | 44px round back, eyebrow, title, actions, safe-area padding. |
| `Field`, `Input`, `Select`, `Textarea` | `xpot/Field.tsx` | 44px control, 16px text on phones (no iOS zoom), error line wired to the control. |
| `FormFooter`, `UnsavedNote` | `xpot/FormFooter.tsx` | Right-aligned Cancel then the primary (brand, disabled while clean), "Unsaved changes" on the left while dirty; `sticky` only for long editors. |
| `SwitchRow` | `xpot/SwitchRow.tsx` | One on/off setting (label, hint, Switch); checkboxes only for picking several. |
| `CopyButton` | `xpot/CopyButton.tsx` | Inline check for 1.5 s; no toast. |
| `Pill` | `xpot/StatusPill.tsx` | `tone`, optional `dot` and `bordered`. |
| `EmptyState`, `ErrorState` | `xpot/EmptyState.tsx` | Tones `indigo` (default), `tags`, `red`; `action`, `onRetry`; `compact` inside sections. |
| `InlineAlert` | `xpot/InlineAlert.tsx` | `info`, `success`, `warning`, `error`, with icon and role. |
| `KpiTile`, `Stat` | `xpot/DashboardKit.tsx`, `xpot/Stat.tsx` | KpiTile is the dashboard tile (button when it has `onClick`); Stat is label over value. |
| `SectionCard` / `DashboardSection` | `xpot/DashboardKit.tsx` | Card with a title row and actions. |
| `Tabs`, `Segmented`, `PeriodSelector` | `xpot/Tabs.tsx`, `xpot/Segmented.tsx` | `accent` per module (blue by default; `account` on account pages); a tab may carry a `badge`. PeriodSelector is a small Segmented. |
| `CommandPalette` | `xpot/CommandPalette.tsx` | `accent` for the selected row. |
| `FilterBar` and parts, `ListPager` | `xpot/filters.tsx`, `xpot/pagination.tsx` | The one filter bar and pager. |
| `CompactDataTable` | `xpot/CompactDataTable.tsx` | The one table. |
| `MasterDetail` | `xpot/MasterDetail.tsx` | List + detail pane / pop-up. |

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
| `ROLE_TONE` | admin amber, manager blue, rep slate |
| `PIECE_STATUS_TONE` | inventory slate, assigned amber, active green, disabled/damaged red, retired muted |
| `STOCK_STATUS_TONE` | pending amber (not received), available slate, reserved blue, internal_use slate, sold blue (`SOLD_TONE`), damaged/lost red, retired slate |
| `CHIP_STATUS_TONE`, `BATCH_STATUS_TONE`, `BATCH_STAGE_TONE` | Tags chip and batch states |

## Formatters (`lib/format.ts`)

`formatDateTime`, `formatDate(value, options?)`, `formatTime`,
`formatMoney(cents, currency)` (alias `formatCents`), `formatCurrency` (whole
units), `formatPercent(ratio, { digits })`, `formatShare(part, total)`,
`formatDistance(meters)` (mi/ft in English, m/km otherwise), `formatPhone`
(`shared/phone`), `formatDuration(seconds)`. All use the app language and take
an optional `locale`; a missing value prints `—`.
