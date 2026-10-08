# Xpot — handoff (state as of 2026-10-08)

Read this first if you are picking the work up from another session or another AI.
Everything below is in the repo; nothing lives only in a chat.

## Ground rules (from the owner)

- **Domain: only `https://xpot.place`.** `xpot.skale.club` is legacy. Never use it in code, docs or answers.
- **Finish the job without asking:** open the PR, merge it once CI passes, keep `main` and `dev` on the
  same commit (`git push origin main:dev`), and delete merged branches (local and remote).
- **Deploy:** a push to `main` → CI (`.github/workflows/ci.yml`, runs the tags integration test on
  Postgres) → `Deploy to Coolify`. Check what is live with `curl https://xpot.place/api/version`
  (returns the commit). Health: `/api/health`.
- Auto-merge is disabled on the repo: wait for `gh pr checks <n>` to pass, then `gh pr merge <n> --squash --delete-branch`.
- The owner writes in Portuguese (often by voice, so expect transcription noise). Answer in Portuguese.
- UI copy exists in EN/PT/ES (`client/src/i18n/messages/*.ts`); TypeScript fails the build if a key
  is missing in one language, and `tests/i18n-messages.test.ts` checks placeholders.

## Done today (all merged and live unless noted)

| PR | What |
|----|------|
| #48 | **PWA install entry, passive.** "Install app" item in the desktop sidebar footer and a row in Settings. Chromium: native prompt (captured at boot, mini-infobar suppressed). iPhone/iPad and Safari Mac: steps dialog. Hidden when installed or unsupported. `client/src/hooks/use-install-app.ts`, `client/src/components/xpot/InstallApp.tsx`, `resolveInstallMode()` in `client/src/lib/pwa.ts`, test `tests/pwa-install-mode.test.ts`. |
| #50 | **"My pieces" shows only the viewer's own pieces**, admins included (`GET /api/xpot/tags?mine=1`). Before, the super admin saw every printed piece. A piece is yours once it is in your kit or you activated it. `server/tags/routes.ts`, `client/src/pages/tags/PiecesScreen.tsx`. |
| #49 | **Admin mode + Settings + Tags nav.** Admin mode (off by default) hides all management UI; language chosen only in Settings (full names, big rows); flags removed from in-app headers; Tags phone header got a Settings button; Tags "Manage" became a 4th bottom tab (admin mode); "Direct link" renamed "Review link" / "Link de review" / "Enlace de reseña" (URL still `/tags/direct`). `client/src/lib/adminMode.ts`, `client/src/pages/tags/TagsTabBar.tsx`. |
| #51 | **Clear split between personal Settings and the admin side**, and the rep view narrows the lists. See next section. |

## Admin mode and the rep view (#51)

Owner's requirement: "the super admin's day-to-day view must be a normal user's view; everything
super admin stays inside super admin; the difference between personal Settings and super admin must be obvious."

What the branch does:

1. **Server narrows lists when the app views as a rep.** While admin mode is off the client sends
   `X-Xpot-View: rep` on every API call (`viewHeaders()` in `client/src/lib/adminMode.ts`, used by
   `client/src/lib/queryClient.ts` and `client/src/pages/tags/lib.ts`). The server's
   `listsEveryone(req, actor)` / `viewsAsRep(req)` (`server/routes/xpot/middleware.ts`) then scopes
   to the person's own: leads, lead detail, visits, sales list + summary, consignments, sync
   status/flush, opportunities/tasks `?all=true`, tags list, tags by-lead, review-link writes
   (`listActor()` in `server/tags/routes.ts`). The header only ever **narrows**; permissions are
   still `isManagerOrAdmin`. MCP and admin screens send no header → unchanged.
2. **Admin mode UI** (`client/src/components/xpot/AdminMode.tsx`): shield button on the Visits
   dashboard and Tags phone headers enters admin mode at that module's management; a desktop sidebar
   item does the same; an **amber bar on every screen** while it is on ("Admin mode: you are managing
   the account", Organization link, Exit). Toggling invalidates all queries. `AdminApp` turns admin
   mode on when an `/admin` URL is opened and waits for it before rendering (so the first fetch is not a rep's).
3. **Settings is personal only:** language, install app, profile, password, account info. The
   Administration section and the per-person Xphere form were removed (super admin edits every
   person's Xphere connection at `/admin/xphere`).
4. Command palette (desktop) searches "my pieces" (`?mine=1`), matching the Pieces screen cache key.

Not yet checked by hand (no local session): on a phone, as the super admin with admin mode off,
Leads/History/Sales/My pieces show only your own data; the shield enters admin mode and the amber bar appears.

Gotcha: `client/src/lib/adminMode.ts` uses relative imports (not `@shared`/`@/`) because
`client/src/lib/queryClient.ts` imports it and `tests/api-error.test.ts` loads that without the aliases.

## QR/NFC write types (backlog item 2, PR from `feat/chip-content-types`)

 What a piece opens can be a **link (default), email, phone or
contact card (vCard)**:

- `shared/chipContent.ts` (+ `tests/tags/chipContent.test.ts`, passing): build/parse/validate each
  kind. Stored as one string in the old column: `https://…`, `mailto:…`, `tel:+E164`, or the vCard 3.0
  text. `validateChipContent` replaces `validateDestinationUrl` for tag destinations and direct writes
  (`server/tags/routes.ts`). `TAG_DESTINATION_TYPES` gained `email` and `phone`. UTMs only on http(s).
- Public scan (`server/tags/publicHandler.ts`): link → 302; email/phone → `renderContactPage`
  (`server/tags/publicPages.ts`, opens it + big button); vCard → `text/vcard` download.
- App: `client/src/pages/tags/ContentEditor.tsx` (kind buttons, email input, phone with country
  picker + US mask, vCard form, byte count vs NTAG213), used in `TagScreen.tsx` (Xpot pieces) and
  `DirectScreen.tsx` (Review link: also a QR sheet `ContentQr.tsx` with PNG download).
  `webNfc.ts` `writeContent` writes a vCard as a `text/vcard` MIME record and reads it back.
  `classifyScan` treats mailto:/tel:/vCard as direct content.

Done since: admin `PieceDetail.tsx` validates with `validateChipContent`; tests cover the vCard
download, the email page and the link redirect. Still to check by hand on an Android phone (Chrome):
write an email, phone and vCard chip and scan each; scan a live Xpot piece set to each kind.

## Backlog (owner's requests, in their order)

1. **SEO + Google Search Console** (owner asked explicitly). `client/index.html` has
   `<meta name="robots" content="noindex, nofollow">`, so remove it for the public pages (landing `/`,
   legal pages). Add `robots.txt` (disallow `/api/`, `/admin`, app routes), `sitemap.xml`, canonical
   `https://xpot.place/`, per-language meta/hreflang if the landing is localized, JSON-LD
   (`SoftwareApplication` / `Organization`), a proper OG image (1200×630) instead of the 512 icon.
   Search Console: add a **Domain property `xpot.place`** (DNS TXT at the registrar/Cloudflare) or a
   URL-prefix property with an HTML meta tag; the owner must do the Google-account steps (or approve
   them explicitly), then submit `https://xpot.place/sitemap.xml`. Also consider Bing Webmaster Tools
   (can import from GSC).
2. **QR/NFC write types** (in progress, see above). When writing a piece (QR code or NFC chip) the person picks what to store:
   **URL (default)**, **email**, **phone**, **vCard**. Each needs proper input + validation:
   - URL: current behavior (`validateDestinationUrl` in `@shared/tags`, `normalizeUrlInput`).
   - Email: `mailto:` with a validated address (optionally subject/body).
   - Phone: `tel:` with a working phone mask (reuse `client/src/pages/xpot/phoneInput.ts` /
     `CountryCodePicker`), stored E.164.
   - vCard: a small form (name, org, phone, email, url, address) generating a valid vCard 3.0/4.0;
     on NFC write an NDEF MIME record `text/vcard`, on QR encode the vCard text.
   Where: the write flow in `client/src/pages/tags/` (`WriteSheet.tsx`, `DirectScreen.tsx` = "Review
   link", `webNfc.ts`), server validation in `server/tags/` and `shared/tags*.ts`. Note that
   Xpot-coded pieces redirect through `/n/<code>` (analytics); "direct" writes put the raw value on
   the chip. Decide per type which mode applies (email/phone/vCard are direct-only on NFC; a QR
   pointing at Xpot could also redirect to `mailto:`/`tel:` or serve a `.vcf`).
3. Per-customer piece counts in the Leads list for managers in admin mode still include every
   reseller's pieces (by design for managers; revisit if the owner disagrees).
4. Legacy domain cleanup (owner side): Supabase Auth Site URL / redirect allowlist on xpot.place;
   Xphere's `XPOT_API_URL`; remove `xpot.skale.club` from Coolify + DNS when `[legacy-host]` logs stop.

## Answers already given to the owner

- **"Organization"** = the account's management area: People (team/resellers), Integrations,
  Branding (app icon/name). Admin-mode only.
- **My pieces vs Manage**: My pieces = your own kit (same as any reseller); Manage = every piece,
  batches, kits, resellers, journey.
- Managers (customer admins) also start with admin mode off; they turn it on with the shield.

## Useful facts

- Local dev: `npm run dev` (port 2110, `.claude/launch.json`), but the panel needs a signed-in
  session; there are no local credentials, so UI checks were done via typecheck/tests/build.
- Tests: `npx vitest run`; typecheck: `npx tsc -p .`; build: `npm run build`.
- Roles: `canManage` (manager or admin) vs `isSuperAdmin` (`users.is_admin`, Skale) in `shared/modules.ts`;
  nav map in `client/src/components/xpot/moduleNav.ts` (`adminOnly` items = super admin only).
