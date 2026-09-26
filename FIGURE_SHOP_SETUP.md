# Figure shop: setup and release checklist

## Implemented scope

Home → Figure shop exists on native and at `/shop` on web. The catalog contains
only purchasable collectibles; currently that is Seeker-exclusive fig2. Every successful purchase
creates one new **Metaplex Core asset** in the configured RIPSY Core collection.
Fig1 is the mandatory free starter, fills every unconfigured army slot, and is
never listed, priced, or minted by the shop. There is no custom gameplay contract,
supply cap, or secondary marketplace. A buyer can collect multiple fig2 copies.

Native `/army` and web `/army` expose 14 appearance slots. A slot containing
`null` renders free fig1. A paid slot stores the exact Metaplex Core asset ID;
the same NFT cannot occupy more than one slot. The backend verifies current
ownership in the official collection before saving and removes transferred assets
from the saved army on the next inventory refresh. Online lineup submission is
server-validated against that saved army. Offline computer mode uses the last
verified loadout cached locally and falls back safely to all fig1.

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

1. Confirm the **SOL** price for fig2, and devnet vs mainnet-beta. Until then
   no price is invented; cards show “Coming soon” and paid minting is disabled.
2. Supply a treasury **public address** on the chosen network.
3. The production **RIPSY Originals** Core collection was created on mainnet-beta
   on 2026-09-21. Configure its address from the production record below and keep
   its dedicated update authority available only to the backend. See the official
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
| `SHOP_SOLANA_RPC_URL` | Private, reliable **DAS-capable** RPC for the configured shop network. It is used for Core minting, confirmation and `getAssetsByOwner` inventory queries; required on mainnet. |
| `SOLANA_RPC_URL` | Private mainnet RPC for Seeker Genesis Token verification. SGT does not exist on devnet, so this stays mainnet even when the shop is tested on devnet. |
| `SHOP_TREASURY_ADDRESS` | Exact payment recipient |
| `SHOP_COLLECTION_ADDRESS` | Existing Core collection controlled by mint authority |
| `SHOP_MINT_AUTHORITY_SECRET` | Server-only 64-byte JSON Solana keypair |
| `SHOP_FIG2_PRICE_LAMPORTS` | Positive integer string; blank disables fig2 |
| `SHOP_PUBLIC_ORIGIN` | HTTPS host of `/figures/fig1.json` etc.; default `https://www.ripsy.fun` |

Keep `ALLOWED_ORIGINS` configured for `https://www.ripsy.fun` and any deliberately
supported preview origins. Orders use the existing bearer player session from
`POST /session`; wallet login does not replace gameplay identity.

Figure 02 is Seeker-exclusive. Before the backend creates its mint transaction,
the receiving wallet must sign a backend-issued, single-use Sign-In With Solana
challenge. The backend verifies that signature and then checks the same address
for a genuine, non-zero-balance Seeker Genesis Token on mainnet. Client device
flags and wallet labels are deliberately not trusted. This flow requires a
physical Seeker with its Seed Vault wallet for release verification.

Opening Army directly uses another single-use SIWS challenge. A successful Seeker
verification during Figure 02 purchase is also a valid wallet proof, so it creates
the same player-to-wallet binding and the confirmed mint can open in Army without
asking for a redundant second signature. Railway stores that binding and its
14-slot loadout in Redis without a TTL. Inventory responses come from the official
Core collection through DAS, not from client claims. Redis therefore needs
persistence and backups, and `SHOP_SOLANA_RPC_URL` must support DAS on the shop
cluster. Disconnect deletes the player-session wallet binding and clears the
device/browser cache; the wallet-keyed Redis loadout remains available if that
same wallet is verified again later.

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

Publish `/figures/fig1.png` for the free starter preview and `/figures/fig2.png`
plus `/figures/fig2.json` before enabling minting. Metadata currently uses
absolute `www.ripsy.fun` image URLs;
update the JSON if choosing another host. Metadata is HTTPS-hosted and therefore
mutable; pin it to permanent storage before launch if immutable media is desired.
Do not silently replace the artwork of already sold figures.

### Creating the Core collection

`/figures/collection.json` is the public metadata for **RIPSY Originals**. Deploy
it before creating the on-chain collection. With `SHOP_SOLANA_CLUSTER`,
`SHOP_SOLANA_RPC_URL` and `SHOP_PUBLIC_ORIGIN` in the local ignored `.env`, run
the commands with the dedicated keypair file path (or set the same
`SHOP_MINT_AUTHORITY_SECRET` used by Railway):

```bash
SHOP_MINT_AUTHORITY_KEYPAIR_PATH=/secure/path/ripsy-shop-mint-authority.json npm run shop:check-collection
SHOP_MINT_AUTHORITY_KEYPAIR_PATH=/secure/path/ripsy-shop-mint-authority.json npm run shop:create-collection
```

The first command validates the RPC genesis, public metadata, authority balance,
fee payer and transaction simulation without submitting anything. The second
submits one transaction, verifies the resulting Core account and prints the
`SHOP_COLLECTION_ADDRESS` to copy into Railway. It never prints the secret. If a
collection address is already configured, both commands validate its update
authority and the exact DAS `getAssetsByOwner` method used by Army instead of
creating a duplicate. Keep `SHOP_ENABLED=false` in production until the printed
collection address has been added to Railway and a real end-to-end mint has been
tested.

#### Production collection record

- Cluster: `mainnet-beta`
- Collection: `Be5v35XMGKi4SvBa5hzLsNxArfv9i76p637qjKpDt9bk`
- Update authority: `rps7sR8RN9gSJEzM7jiddtWdisA96rd3hVgsSmuoopE`
- Metadata: `https://www.ripsy.fun/figures/collection.json`
- Creation transaction: `5Pmu5oHPSZmh18bk86vsL7kPWKuRpvnwFEDEk4eAPmnLVxYgU69btdSdB11vp4skm3Ac8u3EFAYojThfrNg6ZbNM`

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

## Ownership and Army contract

1. `POST /shop/seeker/verify` validates SIWS plus current SGT ownership and also
   binds that receiving address to the authenticated player session. Direct Army
   entry uses `POST /shop/wallet/challenge` + `POST /shop/wallet/verify` instead.
2. `GET /shop/inventory` resolves the bound address, calls DAS
   `getAssetsByOwner` on `SHOP_SOLANA_RPC_URL`, and accepts only assets in the
   configured official Core collection whose metadata identifies fig2.
3. `PUT /shop/loadout` accepts exactly 14 entries. `null` is free fig1; every
   non-null entry must be a currently-owned asset ID and can occur only once.
4. The wallet address is the durable Redis loadout key. Transfer cleanup and
   ownership checks happen again on refresh/save and online lineup submission.
5. `DELETE /shop/wallet` removes only the player-session binding. Native/web
   clients also clear their cached slots and disconnect the selected wallet;
   verifying the same wallet later restores its durable loadout after ownership
   is rechecked.

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

### Collectible-army verification record (2026-09-26)

- Backend: 54 tests passed, including unique-NFT slot enforcement, transferred
  asset cleanup, SIWS player-wallet binding, and online paid-variant validation.
- Mobile: 128 tests and TypeScript passed. Android Kotlin compilation and an iOS
  17 simulator build passed with the native Privy message-signing bridge.
- Web tests, TypeScript, and the Next production build passed, including `/army`.
- Live production DAS inventory, wallet signatures, and a post-mint refresh still
  require an end-to-end device check using Railway's DAS-capable
  `SHOP_SOLANA_RPC_URL`. No mobile release was uploaded by this change.
- The configured mainnet Core collection was checked read-only and is valid.
- The configured shop RPC passed the exact DAS `getAssetsByOwner` preflight.
- Core/DAS inventory now uses the configured shop-cluster RPC; SGT verification
  remains isolated on the mainnet-only `SOLANA_RPC_URL`.
- A verified Seeker purchase automatically binds its receiving wallet for Army,
  while explicit disconnect clears that binding and the cached local slots.
- Backend: 55 tests; mobile: 129 tests; web: 6 tests. All passed. Backend/mobile
  TypeScript and the Next production build also passed.
