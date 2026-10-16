# Shop administration

Open `https://www.ripsy.fun/admin/shop` in a browser with a Wallet Standard Solana wallet. The configured administrator is `BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh`.

## Backend pack settings - 2026-10-16

The active pack editor saves price, chances and availability together on the backend. Defaults preserve the last live values: **10 SKR**, **Jup 40%**, **BONK 40%**, **ORE 20%**. Sign the administrative login message once, edit **Fighter pack**, then choose **Save pack settings**. No wallet transaction, new onchain edition or network fee is required. USD remains a display-only estimate.

`PUT /shop/admin/pack-settings` accepts `{ expectedVersion, price, available, drops }`: a decimal SKR string, a boolean and `{ figureId, weight }` entries totaling 1,000,000. The backend accepts only registered, purchasable, unrestricted fighters. Use 0 in the form to exclude one. CAS rejects stale tabs without losing their edits; reload current settings and Reset edits before replacing a stale draft. A settings revision is only a Redis revision, not a new blockchain account. The last 200 changes are audited. Already-prepared/paid orders retain their own price, odds, reward metadata and fixed result.

Runtime requires `PACK_ENGINE=backend`, `PACK_ENABLED=true` and existing mainnet shop configuration. The form's availability toggle can pause new orders without stopping paid recovery. `GET /shop/admin/settings` includes `backendPack: { catalog, audit }`; stale onchain-publication/price writes now return 409 and require reloading. Historical publication source remains intact but is not an active admin workflow. Run the isolated browser fixture with `--backend` to verify saves, stale revisions and no pack transaction signing.

The buyer pays SKR to the existing treasury. Result selection and delivery run on the backend, not MagicBlock VRF. Core creation fees are paid by the existing mint-authority wallet; maintain its SOL balance and Redis persistence/backups. Full flow and compatibility fields: `PACK_SHOP_SETUP.md`.

Live verification: the backend editor is deployed at the admin URL. An authorized message-only sign-in verified settings and initialized the unchanged 10 SKR / 40-40-20 defaults through `PUT /pack-settings`, yielding Redis revision 2 and one audit entry without a blockchain transaction. Subsequent admin reads and the public catalog match. The isolated browser fixture verifies saving, stale-tab conflict/reload, retained drafts, authentication expiry, USD updates and 375/768/1280px layouts with zero pack transaction signatures. Source/deployment IDs and test counts: `PACK_SHOP_SETUP.md`. The read-only checker `backend/scripts/check-backend-pack-admin.ts --admin=/absolute/keypair.json` revokes its diagnostic login; its optional `--initialize` flag is restricted to the untouched initial defaults and is not a recurring health check.

## Pack contract retired - historical evidence

The mainnet pack program/state are closed. Pack publication and price transactions below are historical instructions for the retired contract; the backend editor above replaces them. Individual figure pricing remains active. Finalized rent return and preserved contract source: `onchain/retirement/README.md`.

## Historical pack price - 2026-10-12

At the user's explicit request, the live mainnet pack price changed from 1,099 SKR to **10 SKR** (10,000,000 base units), price revision 1. The existing administrative prepare/sign/submit/status API recorded the price-only operation. It finalized at slot 456045668; the public API independently returns the new price. Edition 2 remains byte-identical: Jup 40%, BONK 40%, ORE 20%. Individual figure prices are unchanged.

The first 25-byte price account cost 777,240 lamports rent plus a 5,000-lamport transaction fee, total **0.00078224 SOL**. Later price changes update that account in place. No new edition, program upgrade, authority/pause change or customer purchase was sent. Only the admin and canonical price account were writable, so purchased receipts were not modified; existing purchased packs keep their captured price and odds. Native/web fetch the live price without a rebuild. Refresh/reopen the shop to fetch it.

Public evidence: `onchain/pack-price-2026-10-12.json`. Earlier 1,099-SKR deployment/upgrade entries below describe their historical snapshots, not the current price. `onchain/pack-config.json` remains the immutable edition-2 publication baseline, not a runtime price override. The historical `verify-price-upgrade.ts` fixture pins an absent initial price account; it is not a current-state health check after this approved change. Use `node scripts/check-pack-api.mjs --enabled --price=10000000` to verify current catalog readiness.

## Setup

- Railway backend: `SHOP_ADMIN_WALLET` is the **public** administrative address. Unset/empty disables admin access. The retired contract is not consulted for backend pack settings.
- Keep existing `REDIS_URL`, `SESSION_SECRET`, shop cluster/RPC/collection/treasury/mint authority and public origin. Activate backend packs using both flags above. Never put an administrative private key in Railway or a browser bundle.
- `ALLOWED_ORIGINS` must include the exact admin site origin, normally `https://www.ripsy.fun`. No wildcard is needed.
- Vercel: reuse `NEXT_PUBLIC_SHOP_API_URL=https://api.ripsy.fun` and the existing production session endpoint. There is no new frontend secret or admin credential environment variable.
- Redis pricing is durable and shared by replicas. Preserve Redis persistence/volume backups. Changing the Redis prefix or losing its data restores deployment defaults, not the last edited prices.
- Backend Docker/staged deploys include only approved figure PNG previews needed for publication checks. Publish web metadata/previews first when registering a future figure.

## Signing in

Connect the correct account, then choose **Sign in as admin**. Sign the domain-bound, expiring administration message. This is not a transaction. Customer wallet proofs and customer session tokens do not grant administrator access.

The resulting 30-minute bearer credential stays in page memory. Reloads require signing in again. Disconnect/account changes clear local access; sign-out revokes the server session. Changing `SHOP_ADMIN_WALLET` rejects existing sessions for the old address after the new backend configuration is running. Requests are rate limited and nonces cannot be reused.

## Figure prices

Edit prices in human units, without commas (for example `6900000` BONK, `99` JUP or `0.25` ORE). Review the differences, then choose **Save live prices**. Payment mint, precision, recipient, collection and model identity cannot be edited here. RIPSY 001 is never purchasable.

The backend converts decimal strings exactly to integer base units. Zero/negative values, excessive precision and overflow are rejected without rounding. A single Redis compare-and-swap commits the revision, prices and audit together. A stale editor must reload current values before saving; its draft is preserved for review. The last 200 pricing changes are retained, with the latest 20 shown in the page.

The public catalog and every **new** purchase fetch current pricing. The chain transfer and saved order use the same snapshot. Already-prepared purchases retain their original price and transaction. Rollback is another reviewed save, not a Redis reset or an environment variable change. Environment/registry prices remain defaults only where no admin override exists.

## Figure purchase quantity

Native and web cards offer a quantity picker before Buy. The server advertises
`maxFigureQuantity: 3`; absent on an older backend means one only. Purchase
requests may add integer `quantity` in `1..3` (omitted means one). The server
multiplies its current unit-price snapshot using exact integer base units.
Existing orders retain their captured total and quantity; retries and Buy with
SOL reuse the same intent instead of making another charge.

One transaction contains the total payment and a separate Core asset for every
figure. Bulk receipts add `quantity` and a unique `assets` array while retaining
the first `asset` for legacy recovery/Army navigation. All asset signatures are
required. Nothing is split into separately paid transactions. Three direct
token-priced figures fit the 1,232-byte limit for current models. SOL exchange
route size can lower the practical limit: oversized compositions fail before
wallet approval and ask for fewer figures or the actual payment tokens. Packs
remain one pack per purchase; their prices, odds and VRF are unchanged.

The compact native reward shows the count. Add to your army selects the first
exact asset; all purchased figures appear through authoritative inventory.
Changing the picker does not prepare, sign or submit a transaction.

## USD equivalents

Figure prices (SOL, BONK, JUP, ORE and future registered payment tokens), pack SKR prices and publication cost show approximate USD equivalents beside the exact token amounts, including draft edits and confirmation reviews. This is **display-only**: editing/saving still uses exact token base units, not a USD target or automatic conversion. USD amounts exclude purchase fees; history does not pretend that today's exchange rate was the historical rate.

The authenticated backend `/shop/admin/usd-rates` requests Jupiter Price V3 by allowlisted mint address, checks currency precision and positive finite rates, and caches one batched feed in Redis for 60 seconds across replicas. Failed requests are cached for 15 seconds to avoid retries flooding the provider. Timeouts are bounded to five seconds. Missing/unreliable/expired rates display **USD rate unavailable**, never a fabricated zero or a stale dollar value. Provider/cache errors do not prevent token price edits or publication.

The page refreshes rates every 30 seconds while visible and when returning to the tab. **Refresh USD rates** does not reload settings or reset drafts. The retrieval timestamp is shown; it is not an assertion that the token traded at that exact time. All estimates use mainnet reference prices, including when inspecting a devnet store.

Keyless Jupiter access is supported and was verified for all five current currencies. Optional `JUPITER_API_KEY` belongs **only in Railway** for authenticated provider access/higher configured limits. No new Vercel/native variable, wallet signature or mobile rebuild is needed. Never use a `NEXT_PUBLIC_*` price API key. Provider references: [Price V3](https://developers.jup.ag/docs/price) and [keyless access](https://developers.jup.ag/docs/portal/faq).

Verification: 134 backend tests, 24 web tests, backend/web/mobile TypeScript and web production build pass. The isolated browser fixture verifies SOL/BONK/JUP/ORE/SKR estimates, live draft recalculation, provider-error recovery without lost edits, and 375/768/1280px layouts. The live keyless provider returned all five current mint rates. No figure prices, purchases, editions or odds were modified as a test; real operator wallet sign-in is still a human action.

## Historical onchain pack price and probabilities (inactive)

The active on-chain edition fixes the reward table. Its separate canonical price PDA controls **future purchases**, without publishing another edition. Purchased receipts keep their exact paid SKR amount and immutable edition reference; VRF resolution and delivery never consult the current price.

### Price only

Use **Change pack price**, then **Review & simulate price update** and **Sign & update pack price**. This requires an explicit administrative transaction signature, not a figure-price Redis save. The first change for an edition creates one 25-byte price account; subsequent changes update it in place and need only the transaction fee. The draft/current/review price still shows display-only USD.

Preparation pins the active edition, previous price and price revision. The program rejects stale/replayed price changes. Signed bytes are persisted before broadcasting; the existing request ID/status flow recovers an exact finalized transaction even if further price changes have happened. Invalid probability edits do not prevent an independent price update. No admin private key or new environment variable is needed.

This requires the prepared pack-program upgrade described in `onchain/PRICE_UPGRADE.md`. Before that upgrade, simulation refuses the unsupported instruction and nothing is signed or submitted. API/web source deployment alone does not upgrade mainnet.

### New probabilities

Edit the next edition's percentages. Its starting price is the current **live** pack price, not an unsaved price draft. Use `0` to exclude an eligible reward; positive probabilities support four decimal places and must total exactly `100%`. Free, Seeker-exclusive, unregistered and duplicate figures are not permitted. Newly registered unrestricted figures automatically appear in this form after backend deployment.

1. Choose **Review & simulate next edition**. The backend verifies mainnet/program/admin/store authorities, the sequential edition number, live metadata and exact approved PNG bytes. It builds an unsigned transaction and simulates the publication. No transaction is broadcast.
2. Review the starting price, immutable drop table, program, edition account and estimated SOL cost (network fee plus edition-account rent). After the program upgrade, account space uses the actual reward/name/URI byte lengths only, not 32 hypothetical rewards. Account rent is not the pack purchase price.
3. Tick the explicit confirmation, then choose **Sign & publish edition N**. The browser wallet signs as the administrator. The backend accepts only the exact prepared message and valid admin signature, persists the signed bytes before sending them through its private RPC, and tracks confirmation.
4. If delivery is ambiguous, choose **Check publication status**. A reload remembers only the public request ID; sign in to recover that same request. Do not create another edition while a submitted request is unresolved. Retries broadcast identical bytes only.

Existing edition tables and purchased pack prices/odds never change. Price rollback is another reviewed price update; odds rollback requires a **new** edition. This screen does not initialize/upgrade the program, change authorities or pause/unpause sales. Paused sales stay paused after publication. Editing local `onchain/pack-config.json` does not change chain state; that file documents an earlier approved edition. `check-pack-api.mjs --enabled` checks its expected edition/weights and validates the live price; use optional `--price=10000000` to assert a specific current price in base units.

An expired/failed/superseded request must be reconciled against the current edition before preparing a replacement. A wallet that broadcast without returning a signature can be recovered after finalized blockhash expiry by exact edition data. More rewards may hit Solana's 1,232-byte transaction limit before the program's 32-reward maximum; the API rejects oversized transactions rather than changing the table. A future program upgrade/compact metadata design is separate work.

## API

- Public `GET /shop/admin/config`: enabled state and public wallet only.
- Player-authenticated `POST /shop/admin/challenge`, `POST /shop/admin/verify`: one-time SIWS proof, dedicated admin namespace; verify returns ephemeral admin credential.
- Admin-authenticated `GET /shop/admin/settings`, `PUT /shop/admin/prices`, `DELETE /shop/admin/session`.
- Admin-authenticated `GET /shop/admin/usd-rates`: display-only reference rates and expiry; never changes stored prices or chain editions.
- Admin-authenticated `POST /shop/admin/publications`, `GET /shop/admin/publications/:id`, `POST /shop/admin/publications/:id/submit`.
- Admin-authenticated `POST /shop/admin/pack-price`: `{ requestId, expectedVersion, expectedPrice, expectedRevision, price }`, where expected price/revision are base-unit/integer strings and price is a decimal SKR string. Returns a durable `kind: "price"` job, using the same status/submission routes. Settings include `packPriceRevision`; missing revision on legacy responses means `"0"`.
- Existing CORS/body limits/no-store/error handling apply. No private keys or RPC credentials appear in admin responses.

## Verification

Backend unit/integration tests cover nonce/session/role isolation, wrong wallets, stale/concurrent revisions, exact transfer amounts, immutable customer quotes, draft validation, real unsigned publication ABI/signature verification, wrong network/authority/metadata, size limits, ambiguous delivery and HTTP authentication. Browser fixture checks cover 375/768/1280px layouts, precision errors, explicit price review and publication signature, pending state and expired-session rejection.

Run `npm run test:backend`, `npm run test -w @rps/web`, all app typechecks and `npm run build -w @rps/web`. Optional isolated browser check: `node scripts/test-shop-admin-browser.mjs --playwright=/absolute/path/to/playwright/index.mjs`. It uses a temporary API, test-only wallet and isolated Chromium, never real keys, production prices or Solana RPC. No live wallet sign-in or paid/mainnet publication is implied by these tests.

## Price/storage source deployment, 2026-10-10

Seeker fighter currency follow-up: default 1 SKR (six decimals), mainnet-only and
still Seeker-exclusive/not pack-eligible. Price overrides now capture currency;
unqualified legacy fig2 SOL overrides are ignored, not converted. History captures
its original units, including old SOL edits. The browser sends expected mint/
symbol/decimals with price saves; stale SOL editors are rejected before writing.
Other saved figure prices and old purchase transactions are preserved. The old
`SHOP_FIG2_PRICE_LAMPORTS` variable is ignored; no new env/native release or pack
program upgrade is needed. Source/live verification status is recorded below.

Verification for this follow-up: 145 backend, 511 mobile and 24 web tests pass,
with all app typechecks, production web build and the isolated 375/768/1280px
admin browser fixture. Read-only mainnet RPC confirms SKR is an initialized
classic SPL mint with six decimals. Tests cover the exact 1 SKR transfer, atomic
Core creation, Seeker proof, legacy SOL receipt recovery and mixed-currency price
history. No real paid transaction or physical wallet test was performed.
Do not roll back to a currency-blind pricing backend with purchases open: it
cannot interpret newly stored SKR overrides safely.

Seeker SKR deployment: `4a7e6f6` is live on Railway
(`02d6f361-c301-4f34-a89c-c80c28d91a8b`, SUCCESS) and Vercel
(`ripsy-psnd00qic-danger-valley.vercel.app`, READY, `www.ripsy.fun` alias).
The upload manifest excludes backend/native/env/private-key files. Live admin
bundles include expected-currency saves and original-currency audit display.
Live catalog and customer/admin-boundary checks pass: fig2 is 1,000,000 SKR
units, Seeker-exclusive, with SOL product price zero. Other active prices remain
690,000,000 BONK / 1,000,000 JUP / 1,000,000,000 ORE base units. Pack edition 2
remains 1,099 SKR, Jup/BONK/ORE 40/40/20. No paid transaction, admin price save,
pack publication or mainnet program upgrade was sent during verification.

`ed4d652` is deployed to Railway (`a4406f47-01d7-4533-8aea-fd6a5bbe43b4`,
SUCCESS) and Vercel (`ripsy-8c07lpy49-danger-valley.vercel.app`, production READY
and aliased to `www.ripsy.fun`). The verified upload excludes backend/native/
environment/private-key files. The live bundles include the independent price
review/signature form. Live API checks, including customer rejection on the new
price route, pass; current pack price/version/chances remain 1,099 SKR / 2 /
40% Jup, 40% BONK, 20% ORE. No admin signature, paid transaction, price change,
edition publication or mainnet program upgrade was sent. The form cannot prepare
a signable price update until the separately approved/funded program upgrade.
See `onchain/PRICE_UPGRADE.md` for compatibility, costs and rollout.

Activation follow-up, 2026-10-10: the separately approved mainnet upgrade is now
finalized, exact target bytes/authority verified (slot 455263846). Unsigned
mainnet price-operation simulation and live admin/API checks pass; the price
form can now prepare changes. No desired price was saved or signed. Edition 2
remains 1,099 SKR / Jup 40%, BONK 40%, ORE 20%. The first price account costs
777,240 lamports rent plus actual transaction fee, later price-only changes
need no new rent/edition. A future three-drop edition needs 2,098,040 lamports
rent for 285 bytes, not the old 8,985-byte allocation. Current old editions are
not resized/refunded. New chances still require a separate signed edition;
already-paid receipts retain their price and table. See
`onchain/price-upgrade-deployment.json` for finalized costs/refund evidence.

## Production readiness, 2026-10-09

Implementation commit `f4724b7d1f8d779af0e89800b79d842c74aa680c` is deployed successfully to Railway (`545348d2-c78a-4e6a-8d7b-4ab874ebe377`) and Vercel (`ripsy-482m9jj3r-danger-valley.vercel.app`, production READY). Railway and the ignored local `.env` contain only the selected **public** admin address as the new setting. No frontend/native secret was added.

`node scripts/check-shop-admin-api.mjs` passes against `https://api.ripsy.fun` and `https://www.ripsy.fun/admin/shop`: healthy Redis, enabled exact admin address, no-store responses, rejected ordinary customer tokens, rejected foreign origins and live page 200. The only diagnostic state created is an anonymous player session. Existing prices remain Seeker fighter 0.01 SOL, BONK 6,900,000 BONK, Jup 99 JUP, ORE 0.25 ORE; pack remains edition 2 at 1,099 SKR with Jup/BONK/ORE 40/40/20. No purchase/publication was prepared, signed or submitted, and no pricing override was saved. A real operator wallet sign-in/publication still needs the human wallet owner.

Separate dependency follow-up: GitHub/NPM audit flagged existing dependencies; `npm audit --omit=dev` reports two critical entries (`next` and `shell-quote`). Dependency versions/lockfile were not changed in this admin task. [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) and [shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) require a dedicated scoped update and regression pass. The inspected web app does not import `next/og`/`ImageResponse`; this observation does not declare all dependency advisories inapplicable.
