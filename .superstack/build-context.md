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
