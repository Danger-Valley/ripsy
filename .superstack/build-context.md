# Build context

```yaml
mobile:
  platform: react-native
  framework: react-native-community-cli
  targets:
    - ios
    - android
  wallet_method: embedded-privy-and-solana-mobile-wallet-adapter
  blockchain: solana-mainnet-wallet-identity-and-optional-core-shop
  transport: websocket
  state_store: redis
  scaffold_repo: existing-bare-react-native-community-cli-app
  physical_device_tested: false
```

RIPSY intentionally does not use Expo. Native Privy uses the official Swift SDK
on iOS and Kotlin SDK on Android. Solana Mobile Wallet Adapter remains available
on Android as the external-wallet option. Multiplayer gameplay remains
server-authoritative over the existing WebSocket backend and Redis architecture;
the optional Metaplex Core shop does not move game rules on-chain.

## Fighter pack program deployment

```yaml
build_status:
  mainnet_deployed: true
  mainnet_program_id: 43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ
  deployment_date: 2026-10-06T10:48:34.809Z
  rpc_provider: configured-private-mainnet-rpc
  binary_sha256: 199b77db47f82812d115346f706dffa9913f3f207ca3ff13825f4746a5b8d256
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
  native_release_build: 57
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

## Pack price/storage upgrade preparation (2026-10-10)

Source now supports independently mutable edition prices and exact-size new
reward tables. Historical Config/Edition/Receipt layouts, receipt prices and
VRF/claim rules are unchanged. The production program hash above is still live;
the new binary has not been uploaded to mainnet. Local actual SBF upgrade and
regressions pass. Activation requires explicit upgrade approval and sufficient
temporary upload funding. See `onchain/PRICE_UPGRADE.md`; no production price,
edition, authority or purchase was changed during preparation.

Source `ed4d652` is now deployed to Railway and Vercel; live access-control,
price-only admin bundle and unchanged edition-2 catalog checks pass. This does
not activate the mainnet program upgrade or allow the new price instruction yet.
