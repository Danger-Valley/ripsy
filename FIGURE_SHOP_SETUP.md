# Figure shop: setup and release checklist

## Implemented scope

Home → Figure shop exists on native and at `/shop` on web. The catalog contains
fig1 and fig2 with separate server-owned SOL prices. Every successful purchase
creates one new **Metaplex Core asset** in the configured RIPSY Core collection.
There is no custom gameplay contract, supply cap, secondary marketplace, or
equipping/ownership gate in this change. A buyer can collect multiple copies.

Preview PNGs are real first-frame Rive renders, `Idle` + `NoWeapon`, using the
current artboards. `npm run shop:previews`, then visit `http://127.0.0.1:3198` and
press **Export previews** to regenerate the two web/mobile PNG pairs. This utility
needs a browser WebGL renderer; it does not use a screenshot of the live board.

### Wallet paths

- Android/Seeker: the existing remembered MWA wallet signs inside its wallet app.
  Reauthorization uses the order's exact Solana network and receiving account.
- Web: Wallet Standard transaction signing or Privy Solana embedded wallet.
- Native Privy: email OTP, restored auth session, embedded Solana wallet creation,
  disconnect and transaction approval all run inside the bare React Native app.
  iOS uses Privy's Swift SDK; Android uses Privy's native Kotlin SDK. No Expo
  package, WebView, hosted checkout or browser round trip is used.
- Privy's native SDK securely owns the auth session and embedded key material.
  React Native receives only the public address and the final serialized signed
  transaction. The app never receives a private key or Privy access token.
- iOS external wallet signing is not implemented; iOS users can collect through
  the in-app Privy embedded wallet. Android users can choose MWA or Privy.
- A new embedded wallet must be funded with SOL on the selected network before
  purchasing. The receiving address can be copied from the connected-wallet display. No automatic
  transfer, delegated signer, gas sponsorship, or private-key custody is enabled.

## Decisions/credentials still required

1. Confirm **SOL** prices for fig1 and fig2, and devnet vs mainnet-beta. Until then
   no price is invented; cards show “Coming soon” and paid minting is disabled.
2. Supply a treasury **public address** on the chosen network.
3. Create a RIPSY **Core collection** on that same network with a dedicated server
   mint authority as its update authority. This change does not create a
   collection or send any on-chain transaction automatically. See the official
   [Core collection guide](https://developers.metaplex.com/core/collections).
4. Put that authority's 64-byte JSON secret key in Railway's protected variables,
   never in git, chat, logs, client env, or Vercel public variables. The buyer pays
   mint rent/protocol/network fees as well as the product price. The treasury can
   be separate from the signing authority. Keep Redis durable with persistence
   and backups; orders are payment recovery records, not an expendable cache.
5. Create/configure a Privy app and a mobile app client; provide its public app ID
   and required public client ID as `PRIVY_APP_ID` / `PRIVY_CLIENT_ID` when building
   mobile. Add production/development web origins, enable Solana embedded wallets,
   and email login. No Privy app secret is needed by this client signing flow.
   Native Privy raises the deployment minimums to iOS 17 and Android API 28.

## Railway backend variables

| Variable | Meaning |
| --- | --- |
| `SHOP_ENABLED` | Literal `true` to enable new orders; default `false` |
| `SHOP_SOLANA_CLUSTER` | `devnet` (default) or `mainnet-beta` |
| `SHOP_SOLANA_RPC_URL` | Private, reliable RPC for that network; required on mainnet |
| `SHOP_TREASURY_ADDRESS` | Exact payment recipient |
| `SHOP_COLLECTION_ADDRESS` | Existing Core collection controlled by mint authority |
| `SHOP_MINT_AUTHORITY_SECRET` | Server-only 64-byte JSON Solana keypair |
| `SHOP_FIG1_PRICE_LAMPORTS` | Positive integer string; blank disables this figure |
| `SHOP_FIG2_PRICE_LAMPORTS` | Independent positive integer string |
| `SHOP_PUBLIC_ORIGIN` | HTTPS host of `/figures/fig1.json` etc.; default `https://www.ripsy.fun` |

Keep `ALLOWED_ORIGINS` configured for `https://www.ripsy.fun` and any deliberately
supported preview origins. Orders use the existing bearer player session from
`POST /session`; wallet login does not replace gameplay identity.

## Vercel variables

- `NEXT_PUBLIC_SHOP_API_URL=https://api.ripsy.fun`
- Existing `NEXT_PUBLIC_GAME_HTTP_URL` / `NEXT_PUBLIC_GAME_WS_URL` must point to
  the **same backend** issuing shop sessions.
- `NEXT_PUBLIC_PRIVY_APP_ID` and, if configured, `NEXT_PUBLIC_PRIVY_CLIENT_ID`.
- Optional public devnet RPC/WS endpoints: `NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL` and
  `NEXT_PUBLIC_SOLANA_DEVNET_WS_URL`.
- For mainnet set `NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL` and
  `NEXT_PUBLIC_SOLANA_MAINNET_WS_URL` to browser-safe, origin-restricted endpoints.
  Never reuse a confidential backend RPC credential in public variables.

Rebuild the web app after changing public environment variables. Without a Privy
app ID the page still renders, but the login button explicitly says “Privy coming
soon.” Privy is dynamically loaded only on the shop route.

## Native build variables

- `PRIVY_APP_ID`: public Privy application ID.
- `PRIVY_CLIENT_ID`: public native app-client ID from Privy Dashboard.

Pass both variables to `npm run ios:beta`, `npm run build:prod-seeker`, or the
underlying Xcode/Gradle build. Release preflight treats missing values as a failed
configuration. These are public identifiers bundled into the app, not secrets.

Publish `/figures/fig1.png`, `/figures/fig2.png`, and matching JSON files before
enabling minting. Metadata currently uses absolute `www.ripsy.fun` image URLs;
update the JSON if choosing another host. Metadata is HTTPS-hosted and therefore
mutable; pin it to permanent storage before launch if immutable media is desired.
Do not silently replace the artwork of already sold figures.

## Payment and recovery contract

1. `GET /shop/catalog` is public and returns only public configuration.
2. `POST /shop/orders` accepts `figureId`, `buyer`, `idempotencyKey`. The server
   chooses price/treasury/collection/metadata; client-supplied price is ignored.
3. Server verifies RPC genesis and collection authority, generates an asset
   signer, constructs one v0 message: **SOL transfer + Core createV1**. The buyer
   is both owner and fee/rent payer. Authority and asset partially sign; no user
   funds move yet. Simulation estimates additional fees before review.
4. Wallet signs the unchanged message after explicit user review. Server compares
   exact message bytes and verifies **all required signatures** on submission.
5. `POST /shop/orders/:id/submit` saves signature + signed bytes to Redis **before**
   broadcasting. Transport failures remain pending, never “failed” prematurely.
6. `GET /shop/orders/:id` queries chain confirmation. A processed transaction is
   not final success. Confirmed execution error is failure; a finalized expired
   blockhash plus complete transaction history is required to declare expiry.
   A wallet-broadcast transaction whose callback was lost is recovered by its
   exact serialized message in the unique asset address's history. Ambiguous,
   missing, or too-large history remains unresolved, requiring support, not a
   replacement payment.

Idempotency IDs are scoped to player sessions. Redis token-checked locks protect
orders across replicas; signed bytes are only rebroadcast identically. Orders
are retained for 90 days. New preparations have an 8/minute/player limit. Existing
orders can be reconciled even when new minting is disabled. Changing networks
blocks reconciliation of old-network orders rather than creating new payments.

Native Keychain / web localStorage persist purchase intent before preparing and
before invoking the wallet, then the signed bytes before submitting. Retry uses
the same order. The UI allows reconnecting the intended wallet after restart,
but blocks dismissing an ambiguous signed order until it is terminal. Do not
clear application/browser data while a purchase is unresolved. Anonymous player
session expiry or lost storage requires support; there is no cross-device order
history or wallet-authenticated receipt recovery API yet. The NFT itself remains
owned on-chain independently of those records.

## Verification before enabling sales

- Automated tests cover atomic message contents, payer/price, missing or altered
  signatures, wrong network, simulated insufficient funds, scoped orders,
  concurrent replicas, transport ambiguity, history recovery and expiry.
- Client tests cover persisted request IDs, duplicate clicks, rejected approval,
  restored signed transactions, corrupt storage, and terminal orders.
- Run backend/mobile/web tests and all typechecks; build web production.
- **Still required with configured credentials:** real devnet mint from MWA,
  browser extension, native MWA and native/web Privy; inspect Core collection/owner/URI and treasury
  balance, restart during approval, reject approval, expire blockhash, disconnect,
  insufficient funds, and verify the embedded-wallet funding path.
- Review dependency audit and mobile store policies before enabling paid mainnet
  sales. This change does not upload a mobile release or enable sales in production.

### Verification record (2026-09-19)

- Clean `npm ci` succeeded and reapplied both existing Rive/Nitro native patches.
- Backend: 46 tests; mobile: 126 tests; web: 5 tests. All passed.
- Backend, mobile and web TypeScript checks passed; Next production build passed.
- Android Kotlin compilation and an iOS 17 simulator build passed with Privy
  Android 0.14.0 and Privy iOS 2.16.2. Live OTP/login/signing remains unverified
  until production Privy app/client IDs are supplied.
- Browser preview checked real catalog/PNG rendering, no-wallet fallback and
  390px checkout layout without horizontal overflow, with payment endpoints
  deliberately disabled. Live Privy login and wallet signatures remain unverified.
- Solana program peer versions are pinned to Kit 7, matching the existing MWA
  adapter. Root dev peer declarations keep npm-hoisted Privy resolvable in local
  monorepo builds; the web workspace also declares its runtime peers.
- Dependency audit is **not clean**: 35 moderate / 5 high reports in the full
  monorepo at verification time. High findings include existing Metro/image-size
  tooling and transitive `ws` 8.18.x in Privy → WalletConnect/viem. The backend's
  direct `ws` is 8.21.3. A broad forced upgrade/downgrade was deliberately not
  applied. Resolve/reassess this dependency gate before enabling mainnet sales.
