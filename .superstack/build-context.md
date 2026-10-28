# Build context

```yaml
mobile:
  platform: react-native
  framework: react-native-community-cli
  targets:
    - ios
    - android
  wallet_method: embedded-privy-and-seeker-connect
  blockchain: solana-mainnet-wallet-identity-and-optional-core-shop
  transport: websocket
  state_store: redis
  scaffold_repo: existing-bare-react-native-community-cli-app
  physical_device_tested: false
```

RIPSY intentionally does not use Expo. Native Privy uses the official Swift SDK
on iOS and Kotlin SDK on Android. Official native Seeker Connect (over Mobile
Wallet Adapter) is the external-wallet transport on Seeker. Multiplayer gameplay remains
server-authoritative over the existing WebSocket backend and Redis architecture;
the optional Metaplex Core shop does not move game rules on-chain.

## Fighter pack program deployment

```yaml
build_status:
  mainnet_deployed: true
  mainnet_program_id: 43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ
  deployment_date: 2026-10-06T10:48:34.809Z
  rpc_provider: configured-private-mainnet-rpc
  binary_sha256: 530e0b4cacbb91bf4280a33887aa19eb9c2aa0fb9e2f08cce584383bc93f3ac4
  price_storage_upgrade_slot: 455263846
  price_storage_upgrade_verified_at: 2026-10-10T13:02:30.786Z
  upgrade_authority: BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh
  packs_enabled: true
  pack_config_initialized: true
  pack_config_paused: false
  pack_edition: 2
  pack_edition_updated_at: 2026-10-08T12:23:29.402Z
  pack_edition_signature: 2h9bWNFbbTe7qjW7sWUrL1CjK3sBoH2THoM9kMhsNDcd87AHAZHvpUMmoBpLUNSoKY478w6ra8s7kx2nvMZ7JZXr
  pack_drop_percentages: { jup: 40, bonk: 40, ore: 20 }
  pack_price_skr: 1099
  web_metadata_deployed: true
  backend_pack_routes_deployed: true
  native_pack_release_uploaded: true
  native_release_build: 60
  native_ore_release_uploaded: true
  native_dynamic_figures_release_uploaded: true
  native_update_gate_release_uploaded: true
  real_vrf_core_end_to_end_verified: false
```

Deployment is finalized and code bytes/authority are verified. Default CLI and
Anchor provider settings were not switched to mainnet. Immutable edition 1 is
published (Jup/BONK 50/50). On 2026-10-06 the user explicitly approved test
activation: mainnet config unpaused and Railway PACK_ENABLED=true, with live
catalog verification. Native 1.0.0 (55) is uploaded to TestFlight (VALID/internal
beta) and the public Seeker APK release. General BONK/Jup purchases now allow
email-account signing on ordinary iPhone/Android and Seeker by explicit user
approval; Seeker fighter still requires its existing eligibility proof. Native
release 56 (2026-10-07) adds the purchase popup and gameplay presentation fixes;
Android is published and App Store Connect confirms iOS VALID/internal beta.
See `files/releases/1.0.0-56.md`. This is
token payment, not implemented Apple/Google store billing. Full oracle/Core integration and security
review remain outstanding. The user will personally perform the first paid test
on Seeker. No SKR purchase was made by the operator.

Deployment evidence: `onchain/mainnet-deployment.json`,
`onchain/deployment-report.html`, and `PACK_SHOP_SETUP.md`.

On 2026-10-08 the user explicitly approved and the operator published immutable
edition 2 (Jup 40%, BONK 40%, ORE 20%, unchanged 1,099 SKR). Signed simulation,
finalized account/transaction/fee verification and the live enabled API check
pass; historical edition 1 remains unchanged. The backend source commit
3794a0f is deployed, and live ORE metadata/previews are verified. Actual rent
plus fee was 0.04629904 SOL from the approved RIPSY fees wallet. No program
upgrade, authority change or paid customer test occurred. Native build 56 did
not include ORE. Publication evidence: `onchain/edition-2-publication.json` and
`onchain/edition-2-report.html`.

Native 1.0.0 (57), released 2026-10-08, includes ORE, server-delivered figures,
the mandatory update gate and adaptive Android launcher icons. App Store
Connect confirms VALID/internal IN_BETA_TESTING with automatic notification;
the signed Android APK is published and independently download/hash verified.
All 501 mobile tests, mobile TypeScript, five-model asset checks and production
release preflight pass. Live figure/catalog/update endpoints were verified
read-only; all three update minimums remain zero. No backend deployment,
paid transaction or physical-device verification occurred during this release.
Evidence: `files/releases/1.0.0-57.md`.

Native 1.0.0 (58), uploaded 2026-10-10, includes the proportional Android
splash, restored-receipt popup fix, direct Seeker wallet connection and SOL
shortfall purchase recovery. Android APK is published and independently
download/hash verified. iOS archive/upload/export succeeded; App Store Connect
confirms VALID/internal IN_BETA_TESTING with automatic notification. All 522 mobile tests, mobile TypeScript, three new
release-catalog validator tests and both-platform preflight pass. Both packages
include five digest-verified Rive models and no matches for five configured
private env values. No physical/paid purchase validation or web deployment was
performed. See `files/releases/1.0.0-58.md`.

Native purchase UX follow-up (2026-10-12): figure/pack Buy and Buy with SOL now
prepare and call the selected wallet signer without a second native quote
confirmation. Durable recovery/polling never opens signing automatically, and
saved prepared orders use an explicit Continue in wallet action. Both hooks
retain one lock through prepare/sign/submit and reuse existing signed bytes on
retry. All 539 mobile tests, native/web TypeScript and 25 web tests pass. Web's
separate quote confirmation remains unchanged. Focused native ESLint and
production Metro JavaScript bundles for iOS/Android also pass. This source change is not yet in
the uploaded native build 58; physical/paid wallet verification remains pending.

Android splash follow-up (2026-10-12): aspect-fit the illustration to the entire
root viewport, not a smaller safe-area/loading rectangle. The logo and loading
content overlay the fitted image with their own safe-area clearance. Original
assets, iOS cover and startup timing are unchanged. All 539 mobile tests,
TypeScript and focused lint pass; no Android device is connected and installed
AVDs lack system images. Native visual verification and a new release remain
pending; uploaded build 58 does not include this correction.

Native release 1.0.0 (59), uploaded 2026-10-12, includes direct Buy/SOL wallet
signing without the extra quote popup, full-viewport Android aspect fit and no
numeric FIG badges. Android is published and independently download/hash
verified. iOS archive/upload/export succeeded; App Store Connect confirms
VALID/internal IN_BETA_TESTING with automatic tester notification. All 540 mobile tests, TypeScript, asset contracts and both-platform
release preflight pass. Both packages contain five verified Rive models and
no matches for five private env values. No physical/paid test or web deployment
performed. Earlier pending-release notes describe source preparation only.
See `files/releases/1.0.0-59.md`.

Splash correction after build 59 (2026-10-12): user now requests aspect fill.
Both RN platforms use cover and explicit measured-root width/height to override
the Image wrapper's intrinsic asset-size prefix. Real Android/iOS wrapper tests
reproduce the old absoluteFill-only 887x1774 props and verify corrected 360x800
bounds. Keep original assets, logo proportions, safe-area overlays and startup
timing; iOS storyboard and Android OS icon splash unchanged. Not yet included
in uploaded build 59; native visual verification remains pending.

Native receipt recovery follow-up (2026-10-12): remove View purchase/history
buttons from the shop. Terminal saved figure/pack receipts no longer disable
new Buy buttons or disconnect. Only unfinished/missing-order intents block
new purchases and expose Continue purchase; closing still only hides their
popup. New explicit purchases verify the previous terminal order with the
backend under the existing prepare/sign lock before replacing its durable
intent. Network failures, active server status and storage failures preserve
recovery and prevent a new charge. Fresh completion/reward popups remain.
All 556 mobile tests (48 suites), mobile/web TypeScript, 25 web tests and focused
native ESLint pass. Web still uses hasPurchase/inline review and needs a future
presentation port; shared hook safety is updated. No release upload or physical
paid transaction verification performed; uploaded build 59 is unchanged.

Seeker account policy follow-up (2026-10-12): Home, Shop and Army use only
the external Seeker wallet on detected Seeker devices. No email form,
registration, account switch or email-session error appears there, including
legacy signIn navigation and previously stored email accounts. Disable native
email-account refresh/actions on Seeker without deleting its stored session.
New figure/pack purchases and saved approvals select only the exact-buyer
external signer; unfinished historical email orders remain stored/status-checkable,
not reassigned or paid again. Ordinary iOS/Android retain email registration,
restoration, approval and account management. All 565 mobile tests (49 suites),
native TypeScript and focused ESLint pass. No backend/web eligibility or purchase
storage change, release upload or physical wallet verification performed.

Native 1.0.0 (60), delivered 2026-10-12, includes the simplified Your Army,
terminal receipt Buy-button fix/removal of View Purchase, external-wallet-only
Seeker accounts and correctly bounded aspect-fill splash. All 566 mobile tests,
TypeScript, five-model assets and both-platform preflight pass. Android APK is
published with unchanged signing certificate and public size/hash/download
verification. iOS archive/upload/export succeeded; App Store Connect confirms
VALID/internal IN_BETA_TESTING with automatic notification. All APK/IPA ZIP
entries are free of five configured private env values, and five Rive models
match. No paid/physical wallet test, backend/web deployment or price/odds update.
Earlier source-only pending-release notes are superseded by this delivery.
Evidence: files/releases/1.0.0-60.md.

## Pack price/storage upgrade preparation (2026-10-10)

Source now supports independently mutable edition prices and exact-size new
reward tables. Historical Config/Edition/Receipt layouts, receipt prices and
VRF/claim rules are unchanged. At preparation time the old binary remained live;
the new binary had not been uploaded to mainnet. Local actual SBF upgrade and
regressions passed. Activation required explicit upgrade approval and sufficient
temporary upload funding. See the activation follow-up below and
`onchain/PRICE_UPGRADE.md`; no production price, edition, authority or purchase
was changed during preparation.

Source `ed4d652` is now deployed to Railway and Vercel; live access-control,
price-only admin bundle and unchanged edition-2 catalog checks pass. This does
not activate the mainnet program upgrade or allow the new price instruction yet.

Activation follow-up (2026-10-10): user funded/approved the one-time mainnet
upgrade. Exact reviewed target binary is finalized at slot 455263846, same
program/authority. Config and editions 1/2 are byte-identical; no mainnet paid
receipt accounts existed in the snapshot (compatibility tested using a synthetic
old receipt in an actual local upgrade). No price/chances/pause/authority/customer
purchase changed. Mainnet unsigned price-operation simulation returns 25 bytes
and live catalog/admin checks pass: edition 2, 1,099 SKR, 40/40/20. Existing
source deployments need no new env or native build. Net balance reduction was
0.175751993 SOL, with 2.455941241 SOL temporary buffer deposit fully refunded
and 0.173207680 SOL permanent rent growth. Remaining fee-wallet balance was
2.971254085 SOL. Evidence: `onchain/price-upgrade-deployment.json` and
`onchain/price-upgrade-report.html`. Real VRF/Core paid end-to-end and completed
project-wide security audit remain unclaimed; old binary retained for rollback.

## Pack signing diagnostic - 2026-10-12

The user confirmed approval in Seeker's wallet, but reported no onchain
transaction. Read-only Railway HTTP logs show successful preparation at
13:35:47 UTC (POST /shop/packs/orders, 201), then three rejected signed submits
at 13:36:10/14/18 UTC (400). Public order ID:
cb8185998ca24b27d14a363922f0cc52b564d69c578161e9870086b772504850.
First rejected request ID: 1Vbhxp0RQtS4haEK21mRUA.

The first 400 response body is 79 bytes. With the deployed submit validation
branches and the screenshot's generic error, this matches the JSON error
"The wallet changed the purchase transaction. Nothing was submitted."
This is an inference from response length/source, not an inspected response
body or original/signed message comparison. Invalid encoding/signature branches
have different response lengths/copy. PackService validates the message before
storing signed bytes or calling send, explaining why this rejected request
was not broadcast by the backend. The generic native display hides this cause.

Read-only readiness verifies current 10-SKR pricing, enabled edition 2 and
unchanged Jup/BONK/ORE 40/40/20. A finalized real v0 transaction roundtrips
byte-for-byte through the mobile Kit decoder/encoder and retains a valid Umi
signature. Four focused backend signing/transaction tests pass. These checks
do not prove what the Seeker wallet changed in this user's transaction. Exact
original and returned signed bytes are needed to distinguish fee/blockhash
adjustments from other mutation; HTTP logs do not contain these payloads and
no Android device is connected. Do not weaken immutable purchase verification
or retry/reroll a potentially paid pack to diagnose this.

```yaml
debug:
  last_debug_session: 2026-10-12
  issues_resolved: []
  pack_submit_issue_status: diagnosed-stage-message-mismatch-fix-pending
```

No application/backend code, release, deployment, payment, pack price/odds or
customer order was changed by this diagnostic. The 10-SKR price operation is
recorded separately in onchain/pack-price-2026-10-12.json.

## Native release - 2026-10-20 (historical)

Native 1.0.0 (67) is delivered on Android and TestFlight. The signed arm64 APK is
published at https://ripsy.fun/download and its independently downloaded bytes
match the local artifact. App Store Connect build
`ae66951e-9dc4-4322-a933-3f18a99b9920` is VALID/internal IN_BETA_TESTING with
automatic notification. All 674 mobile tests, native TypeScript, five-model
asset verification and both-platform release preflight pass. Both APK/IPA entry
scans found no configured private values; signatures and bundled Rive digests
are verified. Physical paid-wallet end-to-end testing remains unclaimed.

Earlier onchain pack notes in this context are historical: the custom program
was retired, the backend pack implementation is retained, and production now
uses `PACK_ENABLED=false` at the user's request. New pack sales are blocked;
paid recovery and ordinary figure sales remain active. This release does not
re-enable packs or change prices/chances. Current operational evidence:
`PACK_SHOP_SETUP.md`. Native artifact/upload evidence: `files/releases/1.0.0-67.md`.

## Current native release - 2026-10-26

Native 1.0.0 (68) is built for Android and delivered to TestFlight. The signed
arm64 APK is retained locally at `files/builds/Ripsy-v1.0.0(68)-seeker.apk` with
its exact R8 mapping. Website/GitHub publication was initially skipped, then
explicitly authorized and completed on 2026-10-27 without rebuilding. The public
APK's 50,141,626 bytes and SHA-256
`9a24a519d965b700fbe82f02d07df79ec3054f169a4cad5c3baa47a4040ea4b5`
match the local artifact; after normal cache revalidation, the Download page
shows `RIPSY Android 1.0.0 (68)` (confirmed 2026-10-27 07:33:51 UTC). The user
also made verified Download publication the default for future requested signed
Android release builds unless explicitly opted out; see `AGENTS.md` and
`.superstack/learnings.md`. No Play/dApp Store listing submission was performed.

App Store Connect build `298bc114-412b-456a-8087-caf4006951be` is VALID/internal
IN_BETA_TESTING with automatic notification, confirmed 2026-10-26 13:34:52
Europe/Warsaw. The exact uploaded IPA is retained locally. Both native build
numbers are 68, using the existing React Native Community CLI projects and
unchanged dependencies; no Expo. All 677 mobile tests, native TypeScript,
eight-model contract checks and both-platform preflight pass. APK/IPA signatures,
five bundled Rive digests and per-entry configured-private-value checks pass;
physical-device and paid-wallet testing remain unclaimed.

No backend/web deployment, figure publication, authority/SOL operation, pack
activation or price/chance/minimum-build change was performed. The old Railway
monitor remains paused. Evidence: `files/releases/1.0.0-68.md`.

## Native Shop idle preview follow-up — 2026-10-27 (source only)

Purchase cards now use the actual figure's Front/No Weapon Rive idle, with the
existing portrait retained until configuration succeeds or on failure. Animation
is limited to measured visible showcases while focused/foreground, with Reduce
Motion off and account/checkout popups closed. Bundled hashes, verified remote
cache, stable native view identity and all payment/ownership behavior are retained.
Army/pack portraits and inspected web Shop remain static. No assets, dependency,
native bridge, backend/catalog, authority or release-channel changes were made.

693 native tests/53 suites, TypeScript, focused lint, eight-model contract checks
and both-platform Metro bundles pass. The actual Shop/Seeker idle was inspected/recorded
in an existing iOS Simulator binary with current JS; that ad-hoc test copy has a
local Keychain-entitlement limitation, not a verified purchase/sign-in flow.
No physical-device/Android rendering pass or new APK/TestFlight build is claimed.
Published build 68 remains unchanged. Behavioral handoff: `WEB_PARITY_HANDOFF.md`.

## Native Shop authentication recovery — 2026-10-27 (source only)

The reported Authentication is required message is the server's player-session
Bearer guard, before purchase preparation. Cached but revoked credentials after
session-secret rotation are a plausible cause; the phone's actual token was not
inspected. Native startup now validates/renews credentials through POST /session
before readiness, deduplicates concurrent consumers and persists securely before
publishing. A valid token retains its player ID; only 401 invokes the existing
one-time anonymous fallback. Network/storage errors keep the cached credential;
15-second abort plus active-only startup backoff/foreground retry prevents a
network outage from permanently stranding Home. Offline computer play is unchanged.

Typed shop/pack 401 now offers Connect Seeker (ordinary phones: Restore shop
access). Explicit recovery renews the HTTP session first, then authorizes MWA
only if still mounted/focused/foreground. It never prepares/signs/submits or
clears a purchase. Background 401 polling stops; renewed tokens and late old-token
responses cannot create a replacement order. Exact buyer/key/signed bytes/receipts
remain saved, including when a revoked player's order returns 404 to a new
anonymous identity. That case needs support, not automatic rebinding/payment.
Existing Seeker exclusivity and wrong-wallet/signature checks remain intact.

All 723 native tests/54 suites (with open-handle detection), mobile/web TypeScript,
31 web tests, focused ESLint and both-platform Metro production bundles pass.
Existing shared no-void lint warnings remain. Browser cached-token validation and
repair UI are not implemented; shared timeout/polling guards apply. No physical
Seeker, real payment, new signed APK/TestFlight, backend/catalog/secret/authority
or production change was performed. Published build 68 is unchanged; a new native
release is needed to deliver this fix. See WEB_PARITY_HANDOFF.md for the contract.

## Seeker Connect migration — 2026-10-27 (source only)

Native Seeker now uses official Seeker Connect 0.2.0, matching Kinbay's SDK
transport rather than copying its Expo dependencies or vault policies. SDK/button
imports are Android-only and lazy; root Gradle supplies the actual RN 0.87.1 API.
The branded native button is used for Home/Army/shop connection and auth recovery.
RIPSY's existing HTTPS identity, ordinary-phone email routing and separate
anonymous session remain unchanged. No new backend/env/relay configuration.

Old MWA tokens are not imported. SDK cache restores validate network and public
key/address; first explicit use may need approval once. Explicit saved-purchase
reconnect carries the exact original buyer and may forget only a wrong SDK cache;
another account/cancellation cannot reassign an order or request payment. SIWS
keeps the exact server challenge and verifies its cryptographic proof locally
and on the backend. Raw transaction signing preserves the original message and
server signatures, checks the required buyer and advertised version, and leaves
all submission/recovery to the backend. No sign-and-send, message-signing of
transactions, Lighthouse waivers, automatic wallet retries or authority changes.

758 mobile tests/56 suites with open-handle detection, 217 backend and 31 web
tests, all app typechecks, focused lint, both Metro production bundles and full
Android debug APK compilation/packaging pass. The SDK is autolinked and its wallet
visibility query is merged. No Android device was attached; physical Seeker
association, native button/dialog rendering and a real paid purchase are not
verified. Web Seeker Connect is unported. No signed release/publication, TestFlight,
production deployment, price/pack/key/env/authority operation was performed.
Published build 68 is unchanged; native rebuild/device validation is required.
Full behavioral handoff: WEB_PARITY_HANDOFF.md and the mobile README.

## Native release 1.0.0 (69) — 2026-10-28

Delivers the previously source-only native idle shop previews, anonymous-session
and 401 recovery, and official Seeker Connect 0.2.0 migration from baseline
`7ff68c9`. Android arm64 release is signed, R8-optimized and published to the
existing Download channel; unauthenticated APK hash and Download version 69 label
are verified. iOS archive/export/upload succeeded with Danger Valley distribution
signing; App Store Connect independently confirms VALID/internal IN_BETA_TESTING
and automatic tester notification. Evidence is recorded in
`files/releases/1.0.0-69.md`. The earlier source-only release statuses above are
historical, not a claim that these changes remain absent from build 69.

All 758 mobile tests/56 suites with open-handle detection, native TypeScript,
eight-model contracts and both-platform preflight pass. Exact APK/archive/IPA
checks find no matches for 19 configured local private-value representations and
verify all five bundled Rive digests; this is bounded, not a comprehensive secret
audit. Exact R8 mapping, IPA/archive and matching framework dSYMs are retained in
ignored build output. No physical-device/push/payment pass or web port is implied.
No Expo, dependency update, production backend/web/catalog/env/authority or update
minimum change was made. Order recovery after lost anonymous identity and
dependency-advisory reachability work remain open; packs can remain disabled.

## Direct-figure checkout reconciliation — 2026-10-28 (source only)

Lost old-player access to a retained checkout receipt now has a read-only path.
The original pre-signed transaction plus a valid current session can observe its
finalized chain outcome; old GET/submit permissions remain scoped to the original
player. No order transfer/write, wallet binding, prepare, sign or send occurs in
reconciliation. Strict expiry requires finalized height, invalid blockhash,
complete bounded history and no expected asset accounts. Unknown/malformed RPC
evidence, missing receipts and storage failure keep recovery saved and blocked.

Shared hook durably enters reconciliation-only mode after 404; native/web hide
approval/Retry and finish only a verified terminal receipt. Legacy missing
signingStarted, token changes, unmounts and quote/asset mismatches are covered.
Native 401 repair in this mode is HTTP-only; browser session repair and packs
remain unchanged. 791 mobile, 228 backend and 32 web tests, all app typechecks,
focused lint and both Metro production-mode bundles pass. No live transaction,
deployment, native rebuild/upload, dependency or production configuration change
was made. Deploy backend before new clients; build 69 does not include this fix.
Full contract: `files/releases/checkout-reconciliation-2026-10-28.md` and
`WEB_PARITY_HANDOFF.md`.

## Native release 1.0.0 (70) — 2026-10-28

Delivers checkout reconciliation client implementation `e53de52` from baseline
`2941e25`. Signed Android arm64 APK is published to the existing Download channel;
public bytes/hash and version 70 page label are verified. iOS 70 is independently
VALID/internal IN_BETA_TESTING with automatic tester notification. Fresh 791
mobile tests/56 suites, native TypeScript, eight-model contracts and both-platform
preflight pass. Original APK/IPA/archive and matching R8 mapping/dSYMs are retained.

An in-memory stateless session/invalid-receipt probe confirms the production
reconcile route is present; no actual order or chain operation was invoked, and
no backend deployment was performed by this task. No env/key/authority/catalog,
dependency, update-minimum or web deployment change. Physical-device, push and
paid-flow testing are not implied. Bounded local-private-value/package scans pass;
dependency advisory work remains open. Build 69 and the source-only delivery
notes above are historical; see `files/releases/1.0.0-70.md` for the current delivery.
