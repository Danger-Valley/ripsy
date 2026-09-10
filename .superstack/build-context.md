# Build context

```yaml
mobile:
  platform: react-native
  framework: react-native-community-cli
  targets:
    - ios
    - android
  wallet_method: none
  blockchain: none
  transport: websocket
  state_store: redis
  scaffold_repo: react-native-community-template
  physical_device_tested: false
```

RIPSY is a conventional server-authoritative multiplayer game. Expo, MagicBlock, Solana, wallets, and smart contracts are explicitly out of scope. The existing Node.js WebSocket backend and Redis multi-instance architecture are retained.
