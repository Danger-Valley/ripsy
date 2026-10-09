# Shop administration

Open `https://www.ripsy.fun/admin/shop` in a browser with a Wallet Standard Solana wallet. The configured administrator is `BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh`.

## Setup

- Railway backend: `SHOP_ADMIN_WALLET` is the **public** administrative address. Unset/empty disables admin access. It must match the deployed pack program administrator before pack editing works.
- Keep existing `REDIS_URL`, `SESSION_SECRET`, shop cluster/RPC/collection/treasury/mint authority, public origin and `PACK_ENABLED` settings. Never put an administrative private key in Railway or a browser bundle.
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

## Pack price and probabilities

The active on-chain edition is authoritative. Edit the next edition's SKR price and percentages. Use `0` to exclude an eligible reward; positive probabilities support four decimal places and must total exactly `100%`. Free, Seeker-exclusive, unregistered and duplicate figures are not permitted. Newly registered unrestricted figures automatically appear in this form after backend deployment.

1. Choose **Review & simulate next edition**. The backend verifies mainnet/program/admin/store authorities, the sequential edition number, live metadata and exact approved PNG bytes. It builds an unsigned transaction and simulates the publication. No transaction is broadcast.
2. Review the immutable price, drop table, program, edition account and estimated SOL cost (network fee plus edition-account rent). Account rent is not the pack purchase price.
3. Tick the explicit confirmation, then choose **Sign & publish edition N**. The browser wallet signs as the administrator. The backend accepts only the exact prepared message and valid admin signature, persists the signed bytes before sending them through its private RPC, and tracks confirmation.
4. If delivery is ambiguous, choose **Check publication status**. A reload remembers only the public request ID; sign in to recover that same request. Do not create another edition while a submitted request is unresolved. Retries broadcast identical bytes only.

Existing editions and previously purchased pack odds never change. Rollback requires publishing a **new** edition with the desired prior price/table. This screen does not initialize/upgrade the program, change authorities or pause/unpause sales. Paused sales stay paused after publication. Editing local `onchain/pack-config.json` does not change chain state; that file documents an earlier approved edition and fixed-config checks need a new expected file after an admin publication.

An expired/failed/superseded request must be reconciled against the current edition before preparing a replacement. A wallet that broadcast without returning a signature can be recovered after finalized blockhash expiry by exact edition data. More rewards may hit Solana's 1,232-byte transaction limit before the program's 32-reward maximum; the API rejects oversized transactions rather than changing the table. A future program upgrade/compact metadata design is separate work.

## API

- Public `GET /shop/admin/config`: enabled state and public wallet only.
- Player-authenticated `POST /shop/admin/challenge`, `POST /shop/admin/verify`: one-time SIWS proof, dedicated admin namespace; verify returns ephemeral admin credential.
- Admin-authenticated `GET /shop/admin/settings`, `PUT /shop/admin/prices`, `DELETE /shop/admin/session`.
- Admin-authenticated `POST /shop/admin/publications`, `GET /shop/admin/publications/:id`, `POST /shop/admin/publications/:id/submit`.
- Existing CORS/body limits/no-store/error handling apply. No private keys or RPC credentials appear in admin responses.

## Verification

Backend unit/integration tests cover nonce/session/role isolation, wrong wallets, stale/concurrent revisions, exact transfer amounts, immutable customer quotes, draft validation, real unsigned publication ABI/signature verification, wrong network/authority/metadata, size limits, ambiguous delivery and HTTP authentication. Browser fixture checks cover 375/768/1280px layouts, precision errors, explicit price review and publication signature, pending state and expired-session rejection.

Run `npm run test:backend`, `npm run test -w @rps/web`, all app typechecks and `npm run build -w @rps/web`. Optional isolated browser check: `node scripts/test-shop-admin-browser.mjs --playwright=/absolute/path/to/playwright/index.mjs`. It uses a temporary API, test-only wallet and isolated Chromium, never real keys, production prices or Solana RPC. No live wallet sign-in or paid/mainnet publication is implied by these tests.
