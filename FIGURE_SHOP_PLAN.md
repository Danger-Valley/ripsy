# Figure shop

## Scope

- Native Home → Shop, with fig1 / fig2 previews, individual server-owned SOL prices, connected wallet, purchase review and mint status.
- Each purchase creates one Metaplex Core asset in the configured RIPSY collection. Payment and asset creation share one atomic Solana transaction.
- Android supports the existing Solana Mobile Wallet Adapter session and native Privy. iOS uses native Privy. Web supports Wallet Standard and Privy Solana embedded wallets.
- No Expo packages or browser checkout. Native email OTP, remembered Privy session, embedded wallet creation, disconnect and transaction signing use Privy's Swift/Kotlin SDKs inside the app.
- Game rules, randomized figure selection and player sessions remain separate from NFT ownership. Equipping purchased figures is a later feature.

## Delivery checklist

- [x] Server catalog/configuration, Redis orders and idempotency.
- [x] Core transaction construction, wallet signing, chain confirmation and failure recovery.
- [x] Static Rive-derived figure previews and NFT metadata.
- [x] Native Shop and Home entry point.
- [x] Web shop / Privy checkout (credentials and live authentication still required).
- [x] Native in-app Privy embedded wallet and backend-created transaction signing (credentials and live authentication still required).
- [x] Tests, typechecks and release/configuration documentation.
- [ ] Real devnet mint with connected MWA, browser wallet and Privy (needs configuration).
- [ ] Mainnet launch/security review and production prices (not enabled).

## Launch configuration still required

- fig1 and fig2 prices, currency confirmation (initial implementation: SOL), network selection.
- Treasury address, RPC endpoint, collection address and server mint authority configured securely on Railway.
- Privy public app/client IDs and allowed origins.
- Default network is devnet; missing prices/signing configuration keep minting disabled. Never invent production prices or enable paid mainnet minting without these settings.
- No real purchase, collection creation or TestFlight/Android release is performed implicitly by implementing the shop.
