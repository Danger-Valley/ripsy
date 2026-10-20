# Fighter packs

## Current buyer-funded delivery - 2026-10-20

New packs keep **10 SKR**, **Jup 40%**, **BONK 40%**, **ORE 20%**, with automatic delivery paid by the buyer rather than sponsored by RIPSY. One wallet approval covers the SKR purchase, optional Jupiter Buy with SOL exchange and a standard SOL transfer to the existing delivery authority. There are still two blockchain transactions (payment and automatic delivery), not two buyer approvals. No custom pack program or VRF is used.

- Before quoting, the backend takes the largest serialized base Core asset among the captured eligible rewards, fetches its actual rent and the fee for a two-signer delivery message, and includes the official 0.0015-SOL Core creation fee. An entirely unsigned funding+creation simulation checks the deployed program's asset owner, size and exact lamports. Changed protocol costs or invalid RPC data fail before returning any payable transaction. The delivery budget is capped at 0.01 SOL.
- The public catalog adds optional `deliveryPayment: "buyer-prepaid"`. New orders snapshot `deliveryFunding: { recipient, amountLamports }`; clients cannot supply/replace either value. `networkFeeLamports` already includes this transfer plus payment fees/rent, excluding SKR and swap input. Never add `deliveryFunding` again to the aggregate total. Existing native/web clients already display additional fees and approve the exact complete message in the wallet; no new native binary is required.
- The first finalized transaction must prove both the exact SKR treasury credit and the exact SOL delivery-authority credit, including address-lookup-table balance indexes. No draw or delivery begins on missing/partial/unverifiable funding. Signed-message/signature checks and durable recovery still apply.
- Once payment is finalized, one server draw is saved and the fixed Core asset is created. Any unused SOL budget is returned to that same buyer **in the mint transaction**, after Core creation. Mint and refund are atomic and share the immutable asset identity, so retries cannot repeat the refund or require another wallet signature. The server still signs/pays that transaction mechanically, using the buyer's prepaid SOL. No additional wallet debit/approval happens after purchase.
- Existing orders without `deliveryFunding` remain sponsored, including unpaid prepared quotes and paid background delivery. Never add a surcharge or refund from server funds to those receipts. Keep a small technical reserve for legacy obligations, exceptional fee changes and retries; normal new purchases cover their issuance cost.

Read-only mainnet verification returned a **0.00275968 SOL** delivery budget. Current BONK creation uses it fully; Jup and ORE cost **0.00274952 SOL**, each returning **0.00001016 SOL** change. These are current simulated values, not immutable prices. Four probes were entirely unsigned; no paid order or mint was broadcast. Reproduce with `node --env-file=.env --import tsx backend/scripts/check-backend-pack-delivery-quote.ts`. Live catalog readiness: `node scripts/check-pack-api.mjs --backend --buyer-funded --enabled --price=10000000`.

Production: Railway deployment `5b126930-cccb-4380-ad04-e98fd17827bf` is SUCCESS (image `sha256:b4b9fe92288e26e8b44511b9214709f2320174ce361c4b571317f27555993ca9`). Live authenticated catalog confirms `deliveryPayment=buyer-prepaid`, availability and 10 SKR; admin-role/CORS/catalog compatibility checks pass. No price/chance/availability/admin-revision change or real paid purchase was performed. Existing installed native/web clients can use this server-only switch; refresh the shop before preparing a new order.

Sources: `backend/src/backend-pack-delivery-funding.ts` (budget and unsigned probe), `backend/src/backend-pack-chain.ts` (atomic payment, finality verification, mint/change), `backend/src/backend-pack-service.ts` (immutable snapshots), `frontend/packages/core/src/packs.ts` (optional compatibility fields). Tests: 203 backend, 674 mobile and 29 web tests pass, including both payment modes, exact funding, malformed quotes, atomic refunds, legacy recovery and one native wallet approval. All app typechecks and production web build pass. Re-run `npm run test:backend`, `npm run test:mobile -- --silent`, `npm run test -w @rps/web` and `npm run build`. No dependencies or native binaries changed. This is not a claim of a completed security audit or a real paid-device end-to-end test.

Recovery-copy follow-up: deployment `a1f1763b-ce76-4a06-93ad-98fbb1fb90ae` changes only the fee-RPC error wording shared by quote and paid-delivery paths. A paid delivery outage must never claim that no payment was sent; the receipt/result remains recoverable without charging again. The additional focused regression is included in the 203-test count above.

## Backend packs launch - 2026-10-16

The launch notes below describe the original sponsored issuance. The current buyer-funded section above supersedes its reserve requirement and delivery-fee policy; contract retirement and historical evidence remain unchanged.

Packs now use the backend, with **10 SKR**, **Jup 40%**, **BONK 40%** and **ORE 20%**. There is no RIPSY pack-program call, escrow account, edition publication or MagicBlock VRF request. The original contract source and historical evidence below are preserved, not reactivated.

- Enable only with Railway `PACK_ENGINE=backend`, `PACK_ENABLED=true` and the existing enabled mainnet shop configuration. The admin can independently pause new sales.
- Admin: `https://www.ripsy.fun/admin/shop`. Sign the normal administrative login message, then save price, availability and chances directly. `PUT /shop/admin/pack-settings` uses exact six-decimal SKR units, a compare-and-swap revision and a bounded change audit. No transaction signature or account rent is required to edit settings. Positive chances must total 100%; zero excludes a reward. Registered unrestricted figures appear automatically.
- Each prepared purchase captures price, odds and canonical reward metadata. Later settings edits never rewrite an existing order. A saved paid receipt, entropy, result and asset identity have no Redis TTL. Preserve Redis persistence/volume backups; backend randomness is not an independently verifiable oracle proof.
- The buyer signs one standard SPL SKR payment with a unique server-signed Memo marker. Optional Buy with SOL composes the existing validated Jupiter exchange and full SKR transfer in that same transaction. The marker creates no account and costs no rent. No reward is chosen or exposed before exact-message, full-amount payment is finalized.
- After payment, cryptographic server randomness is mapped to the saved weighted table with rejection sampling. The backend durably commits that one result before responding or delivering. A private saved seed derives a fixed Core asset signer; retries/restarts cannot create another asset or reroll the pack.
- Core delivery is a separate server-paid transaction in the existing official collection, owned by the buyer. The existing shop mint-authority wallet needs SOL for asset creation and fees. Quotes are blocked before payment below 0.005 SOL; paid delivery records keep retrying after outages/funding delays. Read-only readiness found 0.00878604 SOL on `rps7sR8RN9gSJEzM7jiddtWdisA96rd3hVgsSmuoopE`. This is a small test balance, not sustained delivery capacity.
- Signed payment/delivery bytes persist before broadcast. Finalized exact-message/history checks recover wallet broadcasts and ambiguous RPC responses; errors never create replacement payments. Redis leases fence every write, and the pending queue retries after app closure. The old retired-program path is read-only for historical unpaid-intent reconciliation.
- Native/web pack endpoints and statuses remain compatible. Optional `engine: "backend"` identifies the new flow; legacy `receipt` is the Memo marker, `edition` a settings fingerprint, and `randomness` saved server entropy, not a VRF proof. The current installed app can buy without a native rebuild. Existing inventory/Army handoff still waits for confirmed Core ownership.

Verification: backend pack service/chain tests cover finality, treasury credit, exact signatures, no pre-payment result, immutable settings, idempotency, lost leases, paid recovery and stable delivery. Existing native/web suites and production web build pass. No real paid purchase is sent by operator readiness checks. Use `node scripts/check-pack-api.mjs --backend --enabled --price=10000000` for live read-only catalog verification.

Production release: Railway backend source deployment `e339cf38-8824-49c5-9527-6c0e162130c7`, with `PACK_ENGINE=backend` / `PACK_ENABLED=true`; Vercel `ripsy-c8qa74h7t-danger-valley.vercel.app`, aliased to `www.ripsy.fun`. Live catalog/admin-role/CORS checks pass. A message-only BJom admin session verified the new settings and saved the unchanged defaults once through the actual CAS API (revision 2, one audit entry); price, chances and availability were not altered. This also verified actual Redis settings persistence. An empty fresh public wallet reached the live mainnet preparation checks and received typed insufficient-SKR/Buy with SOL recovery, with no transaction prepared or sent. 193 backend, 673 mobile and 29 web tests pass, with all app typechecks, production web build and isolated 375/768/1280px admin browser verification. Actual paid delivery remains a user test, not an operator test.

## Contract retirement - historical evidence

The pack program is **closed on mainnet** at the user's request. ProgramData and all four administrative state accounts were closed, returning **2.550678160 SOL** to `BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh`; the temporary cleanup buffer deposit was also fully refunded. No paid receipt or escrow existed at retirement. The loader's non-closeable program-address tombstone retains 0.000833120 SOL. See `onchain/retirement/README.md` and `onchain/retirement/mainnet-retirement.json` for finalized evidence.

At retirement, production set `PACK_ENABLED=false` to block the old engine. Backend packs above supersede that temporary shutdown. Preserve all Rust/IDL/client code and historical evidence. Do not run old activation/publication commands against the retired program ID. All subsequent onchain setup/deployment sections describe historical behavior only.

## Historical deployment and activation

Program **deployed and verified on Solana mainnet on 2026-10-06**. **Edition 2 is published and finalized on 2026-10-08:** Jup 40%, BONK 40%, ORE 20%, still 1,099 SKR. Purchases remain enabled (config unpaused, live authenticated API available=true). Historical edition 1 remains 50/50. Production backend and ORE metadata/previews are verified. Last uploaded native release is **1.0.0 (56)** and does not contain ORE; an updated iOS/Android release is required for variant 5. The real paid VRF-to-Core purchase remains unverified; activation is not a completed audit or end-to-end signoff. The user will personally test, not the operator. Current publication evidence: `onchain/edition-2-publication.json` / `onchain/edition-2-report.html`; `onchain/mainnet-deployment.json`, `onchain/mainnet-readiness.json` and `onchain/deployment-report.html` remain historical edition-1 evidence.

Config: `2Pf3Q6MyrsNzzEPxMUNGTHqmWP5ZP92rNpakeVkRPrZw`. Initialization signature: `3MaGKPuVpc6LMkSvgaHaMoqWx3oqyYZYf9qqHBY5qhEff1ojNY8w3GuapGaQdNyn9yYfhE6qj6A75T31YaEiB9Do`.

Edition 1: `By91HTLcHiWsHSyzMRMWj9HofiangTGU7Lqr2ifV29qY`. Publication signature: `2Dn8VrCapDF7T5NHdDS1YBF6DVonGty5dfCqMdEh5VmwoCABGMDmUHg2RAavp3b3qe8kwJGchkiggtPsFQWyg9VK`. Read-back confirms `1099000000`, variants `[4,3]`, weights `[500000,500000]`, matching collection/authority/treasury and live canonical metadata with exact PNG hashes. User-approved unpause signature: `4jmdd1wjKwvSoMvvc3fkYa1g7Vi1zgc7pmu8tJ1QYSxsGd9WmJ4uvKgoA3MMivmtKdty5JygNTNxKR29oPtYjm5J`. Finalized pause=false and API available=true were verified separately; the ignored local `.env` flag is not the live Railway flag.

Deployed slot: `453879187`. Upgrade authority: `BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh`. SHA-256: `199b77db47f82812d115346f706dffa9913f3f207ca3ff13825f4746a5b8d256`. The finalized ProgramData code matches the local binary byte-for-byte. The temporary buffer closed successfully. Net balance reduction across deployment attempts: **2.28592809 SOL**, comprising **2.28356668 SOL** program rent and **0.00236141 SOL** transaction fees. Post-deployment payer balance: **0.238757194 SOL**. These balance deltas assume no unrelated wallet activity during the deployment window.

- Price: **1,099 SKR**, exactly `1099000000` base units at 6 decimals.
- Initial drop table: **Jup 50%, BONK 50%**. No free starter or Seeker fighter.
- One purchase opens automatically into one official Metaplex Core fighter. No separate closed-pack NFT is created.
- No Seeker hardware or Genesis-token requirement. Web wallets, Seeker wallets and email accounts can sign the same purchase. This is SKR payment, not App Store / Google Play billing; email accounts must already have SKR and SOL. Store billing and account funding are not implemented by this change.
- Native and web use the same prices, parser, purchase recovery and confirmed asset-to-Army handoff. Each resulting NFT still fills just one slot.

## Architecture

`Buy -> SKR escrow + one scoped MagicBlock request -> authenticated callback -> fixed result -> Core creation + seller payment`

The backend builds the buyer transaction, the client signs it in the selected account, and the backend validates the exact message/signatures before sending through its RPC. The backend does not choose the result and cannot substitute another reward or recipient in a claim.

Program ID: `43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ`.

Source and generated ABI: `onchain/programs/ripsy-packs/src/lib.rs`, `onchain/idl/ripsy_packs.json`. The local program signing key is ignored at `onchain/keys/ripsy-packs-keypair.json`; never commit or bundle it.

The program pins the classic SKR mint `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`, official VRF program and base-layer queue. It uses `ephemeral-vrf-sdk 0.17.3`'s **scoped regular-priority request**, not the deprecated global callback signer. [MagicBlock documentation](https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/how-to-guide/quickstart).

Receipt states are pending, resolved and claimed. A receipt can request randomness only once, can resolve only from its scoped VRF signer and recorded caller seed, and can claim only the canonical Core asset PDA. SHA-256 rejection sampling maps the verified randomness to a weighted interval without modulo bias. Receipts remain onchain after delivery.

Price, weights, names, metadata URIs, treasury, collection and mint authority are pinned by an append-only edition. Updating the active edition does not change previously bought packs. The pause flag blocks new purchases, not already owed results or deliveries.

## Payment and recovery

- Buyer pays SKR into escrow plus the initial SOL transaction, receipt/ATA rent and VRF request costs. The review displays a simulated estimate of those additional costs.
- Backend mint authority pays Core creation, seller ATA creation if needed and claim transaction fees. **Fund and monitor this authority before launch.** It is not sponsored buyer VRF/network fees.
- The seller receives SKR only in the same successful transaction that creates the selected Core figure. Escrow ATA rent and unsolicited token dust return to the buyer.
- Redis persists the intent/nonce/order, signed buyer bytes and signed claim bytes before broadcast. A durable due-order index drives background recovery even when the app is closed. Locks serialize each receipt across backend replicas.
- Unresolved entitlements have no Redis TTL. Terminal API records retain 90 days; onchain receipts remain permanent. Client recovery uses separate Keychain/local-storage records from single-figure purchases.
- An ambiguous RPC response cannot create a new payment. A known paid receipt cannot expire because a later RPC read is missing. Claims use fixed asset/result and retry existing signed bytes until finalized expiry.
- **No cancel, refund, re-request or re-roll instruction exists after payment.** If the oracle or delivery authority is unavailable, SKR remains in escrow and the pack stays pending until recovery. This is an explicit launch risk, not an automatic refund promise.

## Launch checklist - currently outstanding

1. Review the financial program and signer/CPI permissions. Initialization is allowed only by the deployed program's upgrade authority. Protect that authority and choose the admin deliberately.
2. Run an end-to-end integration with actual deployed MagicBlock request/callback and actual Core creation, including forged/duplicate callbacks, wrong recipients, insufficient funds, failed claims and restart recovery. Local smoke tests do **not** prove oracle fulfillment.
3. **Deployment complete:** program ID, finalized code bytes/hash, loader owner and upgrade authority verified. Anchor's default provider remains localnet and the mainnet address mapping is recorded separately. Actual VRF queue/API compatibility still requires the end-to-end verification in item 2.
4. **Complete:** config initialized with the actual shop collection, treasury and existing mint authority; paused state and collection authority verified. Protect both program-admin and shop-authority keys.
5. **Complete:** edition 1 published with `onchain/pack-config.json`; finalized read-back verifies price `1099000000`, variants `[4,3]`, weights `[500000,500000]` and canonical metadata. Do not republish or overwrite version 1.
6. Fund the backend's claim authority and confirm its operational delivery capacity. Review oracle failure/escrow handling and app-store requirements before enabling normal-device payments.
7. **API, web/assets and native build 54 deployed; test activation approved and verified.** `PACK_ENABLED=true` is **Railway/backend only**, not a public Vercel or native-build value. Existing shop RPC, treasury, collection and authority variables are reused. Source uploads exclude secrets; Docker uses tested Node 24. Railway env changes may rebuild the linked older GitHub branch: future changes should use `--skip-deploys` and explicitly deploy the verified allowlisted snapshot, then verify `/shop/packs/catalog`, not just `/health`. Activation was repaired this way before unpausing.
8. Test a real purchase, close/reopen during approval and oracle waiting, confirm exact Core ownership and equip the resulting asset once. Check production monitoring and depleted-fee-authority recovery before broader launch.

Confirmed deployment fee payer and initial upgrade authority: RIPSY fees wallet **`BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh`**, also the configured shop treasury. The user separately approved both roles and mainnet deployment on 2026-10-06. Verified signing file: `/Users/heymike/.config/solana/ducks.json`. Do not substitute the shop mint-authority key, which belongs to a different address. Anchor remains configured for localnet; the mainnet deployment script passes the RPC, program, payer and upgrade authority explicitly without modifying global CLI settings.

`onchain/scripts/deploy-mainnet.mjs` pins the reviewed binary SHA-256, verifies mainnet genesis, signing addresses, program absence, balance and rent. It checks onchain code byte-for-byte and upgrade authority after deployment. Default execution is read-only; `--send` broadcasts the explicitly approved initial deployment, and `--verify` only checks the deployed code. The recoverable buffer key remains ignored in `onchain/keys/mainnet-deploy-buffer.json`; never commit it. No config initialization, edition publication or unpause is performed by this deployment script.

Read-only RPC rent quote on 2026-10-06: the current 449,184-byte binary needs approximately **2.284 SOL** for program-data + program-account rent with an explicit maximum length equal to the binary size, excluding deployment/network fees. The confirmed fee payer held **0.085373993 SOL** at the time of the check. A planning balance of **2.5 SOL** leaves some room for deployment/configuration fees; recheck rent, fees and balance immediately before an approved deployment. CLI spare capacity can increase rent; verify the exact deployment command and funding before approval. No funds were spent obtaining these quotes.

The final deployment preflight balance was **2.524685284 SOL** after funding. An initial partial upload hit the RPC write retry limit; the same saved buffer was resumed successfully without a second rent deposit. Fresh local SBF smoke tests passed on the exact deployed binary. Mainnet `initialize` and `publish` simulations passed before sending their approved setup transactions. This does not verify actual VRF fulfillment or Core claim execution. After config/edition publication the fee payer held **0.191081554 SOL**; the delivery authority held **0.00878604 SOL** at read-back. These snapshots do not guarantee capacity for multiple claims. No SKR test purchase or fee-wallet funding transfer was performed.

## Changing chances

### ORE edition 2 published (2026-10-08)

`onchain/pack-config.json` matches finalized edition 2: Jup 40%, BONK 40%, ORE 20%, still 1,099 SKR. Historical edition 1 remains unchanged at 50/50; its deployment evidence and paid receipts are not rewritten. No program upgrade was needed. The existing backend deployment `69807d59-7579-4026-a4eb-9ecac927f9c0` runs source `3794a0f`, and exact live resources were verified before the approved signed simulation/publication. Edition account: `GXTL36kxVXCTH6pZcQWYQmPD6E1fcJSsCW4yJeokWXPT`. Finalized publication signature: `2h9bWNFbbTe7qjW7sWUrL1CjK3sBoH2THoM9kMhsNDcd87AHAZHvpUMmoBpLUNSoKY478w6ra8s7kx2nvMZ7JZXr`, slot `454543522`. Native ORE builds are not uploaded by this publication task.

Individual ORE purchases use `oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp`, verified mainnet classic SPL Token with 11 decimals. The fixed amount is `25000000000` base units (0.25 ORE), with the existing atomic checked-token-transfer/Core path. No new environment variable or payment key is needed.

The 8,985-byte edition required 46,294,040 lamports rent plus a 5,000-lamport transaction fee: **0.04629904 SOL** total, verified from finalized transaction balances. The fee payer had 144,777,514 lamports after publication. The delivery authority still held 8,786,040 lamports at readiness check; monitor its capacity. `check-packs.ts` verifies the active edition's resources; `check-pack-api.mjs --enabled` passes for live edition 2, catalog v3 and retained legacy catalog sets. The local ignored `.env` has PACK_ENABLED=false, but the independently checked production API remains enabled. No paid test purchase, program upgrade or authority change occurred.

Edit `onchain/pack-config.json`, increase `version` by exactly one, and publish a **new** edition. Weights are integers totaling `1000000` (`500000` = 50%, `10000` = 1%). `priceBaseUnits` is an exact SKR integer, never a floating-point number. Initial version 1 is locked to the approved 1,099 SKR / 50-50 specification.

Price-only updates no longer require a new edition after the user-approved mainnet upgrade finalized on 2026-10-10 (slot 455263846). Use the admin's independent price form; exact current pricing comes from the edition's price PDA, with original edition price as the legacy fallback. Receipt payment and edition odds remain immutable per purchase. New editions allocate actual serialized reward bytes only; existing large editions are not resized. The upgrade itself did not change the live edition-2 price or chances. See `SHOP_ADMIN.md`, `onchain/PRICE_UPGRADE.md` and `onchain/price-upgrade-deployment.json` for verification, cost and recovery. A Git/backend/web deployment alone does not upgrade programs.

The admin CLI uses an explicit keypair path and simulates by default. Run from the repository root:

```sh
node --env-file=.env --import tsx backend/scripts/manage-packs.ts initialize --admin=/absolute/pack-admin.json
node --env-file=.env --import tsx backend/scripts/manage-packs.ts publish --admin=/absolute/pack-admin.json --config=onchain/pack-config.json
node --env-file=.env --import tsx backend/scripts/manage-packs.ts unpause --admin=/absolute/pack-admin.json
```

Only adding `--send` broadcasts. No script automatically deploys or unpauses a program. A verified Core collection is required; program upgrade authority initializes, and the recorded pack admin publishes/pauses. Do not use the local program-address key as the admin unless it was deliberately selected as the deployed upgrade authority.

Readiness checks (no transaction signing/submission):

```sh
node --env-file=.env --import tsx backend/scripts/check-packs.ts
node scripts/check-pack-api.mjs --enabled
```

Enabled API checks only health/authentication/catalogs plus a diagnostic session; no order is created or transaction signed/submitted. Without `--enabled` the checker expects disabled purchases and verifies rejection before preparation. HTTP JSON responses resolve and serialize before success headers, so async failures return errors instead of restarting the server. Three transport tests cover this regression.

At activation, the delivery authority held **0.00878604 SOL**. Read-only RPC rent quotes for the actual largest plain Core asset (118 bytes), treasury ATA if missing and a base 5,000-lamport fee totaled **0.00274312 SOL**. This covers the estimated first base claim, not a guarantee of actual CPI execution or long-term capacity. Buyer still needs 1,099 SKR plus SOL for the simulated purchase fees. No funding transfer was made. If oracle/delivery is pending, recover the same order rather than buying again.

New figure models must first be added to the shared catalog, actual assets/metadata and inventory/rendering on both platforms. Then add their variants and weights to the next edition. Unsupported editions fail closed, instead of charging for a figure the app cannot render. The program caps tables at 32 entries; inline metadata also imposes Solana transaction-size limits on edition publication.

## Trust boundaries

VRF authenticates the random selection; it does not remove all operational trust. The program is upgradeable until its upgrade authority is explicitly revoked, the admin controls future editions, metadata is hosted, and the collection authority must deliver. The current backend authority can withhold a claim but cannot choose a different result through this program. Do not advertise an immutable or fully trustless system before separately addressing those authorities and hosting assumptions.

## Local verification

- Rust unit tests cover exact price, table validation, weighted interval boundaries, deterministic selection and future variants.
- A real localhost SBF smoke test passed initialization by upgrade authority, publication, duplicate edition rejection and pause/unpause. A correctly serialized genesis receipt also verifies that a wallet-signed callback fails specifically on the scoped VRF identity address constraint. This fixture does not prove real oracle fulfillment. The generated IDL is checked by backend tests.
- Backend tests cover transaction ABI/signatures, pinned SKR/VRF, price override rejection, no Seeker gate, RPC ambiguity, no paid expiry, durable claims and background recovery.
- Native hook/UI tests cover email-signing access on iPhone and ordinary Android, approval persistence, duplicate taps, recovery, terminal dismissal and corrupted storage. Web uses the same hook and API parser.
- The Core SDK compiler emits a stack warning for its unused plugin-registry decoder. Symbol inspection of the unstripped linked binary confirms that function is absent; actual SBF initialization executes. Core claim and real oracle execution still require the end-to-end verification above.
- Current checks: 91 backend tests, backend/web TypeScript, 21 web tests and a production web build pass. Production HTTP health/authentication/disabled catalog, blocked purchase without restart and legacy compatibility checks pass. Dependency audit output still contains findings; no automated `audit fix --force` was used and no completed security audit is claimed.
