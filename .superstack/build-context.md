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
  pack_edition: 1
  pack_price_skr: 1099
  web_metadata_deployed: true
  backend_pack_routes_deployed: true
  native_pack_release_uploaded: true
  native_release_build: 56
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
