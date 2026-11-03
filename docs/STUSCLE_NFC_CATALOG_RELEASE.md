# Stuscle NFC catalog release — November 3, 2026

Published storefront: https://stuscle.com/nfc

Wholesale entry: https://stuscle.com/wholesale

## Approved assortment

The live release contains 30 canonical product pages, 480 purchasable variants and 160 full-piece design previews. It covers 15 services in Stand and Plate formats, Small and Large sizes, White and Black bodies, and three NFC mounts. Menu adds six typography styles. Accent/logo colors are separate from the approved body palette.

Services: Google Review, Yelp, Instagram, Facebook, TikTok, Website, Menu, Wi-Fi, Venmo, Cash App, PayPal, Zelle, WhatsApp, YouTube and LinkedIn.

Unapproved Navy, Forest, Burgundy and Sand variants introduced during this task were withdrawn after checking that none had order references. Existing white/black variant identities and original product photos were preserved. Utility icon SVG background paths were corrected and obsolete generated previews were removed.

## Prices in USD

Owner decision: https://www.notion.so/3ebb7a686121810798f5f0bd5dc35fc7

| Product | Retail | Wholesale |
|---|---:|---:|
| Stand Small | 40 | 25 |
| Stand Large | 60 | 40 |
| Plate Small | 25 | 15 |
| Plate Large | 35 | 20 |

Shipping is separate. No unapproved volume discounts were added. Wholesale membership and price-list restrictions were preserved.

## Verification

- Stuscle `corepack pnpm verify` succeeded: 1,872 tests, type checks, lint and both application builds.
- Final production verification succeeded after image cleanup: 30 published products, exactly 480 approved variants, exactly 160 reachable previews, wholesale integration HTTP 200, and every variant's calculated retail/wholesale price matched the approved table.
- Original product IDs, variant IDs/SKUs and photo identities/associations were checked against the initial snapshot.
- Browser cart test: Wi-Fi Stand Large / Black / rectangular NFC at $60; Menu Plate Small / White / rigid NFC / Rounded at $25. Total $85. Both test items were removed, leaving the test cart empty. No order or payment was submitted.
- Browser inspection confirmed full-piece Menu previews and all three illustrated NFC choices.
- Real reseller browser login was not exercised. Automatic approval review rejected retrieving a private reseller code; the configured wholesale service integration was verified instead.
- Xpot's local generator palette was restricted to white/black for future standard plaques without changing historical batches. Its scoped TypeScript tests passed (25), type check and build passed. Python pipeline tests passed (23), including a utility icon negative-space regression. Xpot was not deployed as part of this Stuscle publication.

Stuscle implementation PR: https://github.com/Skale-Club/stuscle/pull/36 (merged). Deployment runs 41661696717 and 41663008087 succeeded. Publication was resumed after an unrelated infrastructure deployment replaced the running backend container.

Machine verification and execution logs are in `.cache/stuscle/`; the final production report is `live-verification.json`. Production backups and pre-change catalog snapshots were retained in the managed deployment backup directory.
