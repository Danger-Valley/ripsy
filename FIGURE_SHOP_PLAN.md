# Figure shop

## Scope

- Native Home → Shop, with purchasable fig2 preview, server-owned SOL price, connected wallet, purchase review and mint status. Fig1 is the permanent free starter and is never sold.
- Each purchase creates one Metaplex Core asset in the configured RIPSY collection. Payment and asset creation share one atomic Solana transaction.
- Android supports the existing Solana Mobile Wallet Adapter session and native Privy. iOS uses native Privy. Web supports Wallet Standard and Privy Solana embedded wallets.
- No Expo packages or browser checkout. Native email OTP, remembered Privy session, embedded wallet creation, disconnect and transaction signing use Privy's Swift/Kotlin SDKs inside the app.
- Game rules and payment state remain separate. Native/web Army screens verify current Core ownership and equip one exact NFT into at most one of 14 appearance slots; all empty slots use free fig1.

## Delivery checklist

- [x] Server catalog/configuration, Redis orders and idempotency.
- [x] Core transaction construction, wallet signing, chain confirmation and failure recovery.
- [x] Static Rive-derived figure previews and NFT metadata.
- [x] Native Shop and Home entry point.
- [x] Web shop / Privy checkout (credentials and live authentication still required).
- [x] Native in-app Privy embedded wallet and backend-created transaction signing (credentials and live authentication still required).
- [x] Tests, typechecks and release/configuration documentation.
- [x] SIWS-owned Core inventory, durable unique-NFT Army slots, local cache, online lineup enforcement, post-Seeker automatic wallet binding and explicit disconnect.
- [ ] Real devnet mint with connected MWA, browser wallet and Privy (needs configuration).
- [ ] Mainnet launch/security review and production prices (not enabled).

## Launch configuration still required

- fig2 price, currency confirmation (SOL), network selection. Fig1 never has a price.
- Treasury address, RPC endpoint, collection address and server mint authority configured securely on Railway.
- Privy public app/client IDs and allowed origins.
- Default network is devnet; missing prices/signing configuration keep minting disabled. Never invent production prices or enable paid mainnet minting without these settings.
- No real purchase, collection creation or TestFlight/Android release is performed implicitly by implementing the shop.
