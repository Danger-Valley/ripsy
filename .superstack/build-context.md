# Build context

```yaml
mobile:
  platform: react-native
  framework: react-native-community-cli
  targets:
    - ios
    - android
  wallet_method: mobile-wallet-adapter
  blockchain: solana-mainnet-wallet-identity-only
  transport: websocket
  state_store: redis
  scaffold_repo: react-native-community-template
  physical_device_tested: false
```

RIPSY is a conventional server-authoritative multiplayer game. Expo, MagicBlock, and smart-contract gameplay are explicitly out of scope. Android supports an optional Solana Mobile Wallet Adapter connection for wallet identity only; it does not affect game rules or transport. The public address and reusable authorization context are stored in Android Keystore through `react-native-keychain`, and disconnect deauthorizes the wallet before clearing that local record. MWA is not imported or shown on iOS because the native protocol SDK is Android-only. The existing Node.js WebSocket backend and Redis multi-instance architecture are retained.
