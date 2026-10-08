# Fighter packs

## Current status

Program **deployed and verified on Solana mainnet on 2026-10-06**, edition 1 published and finalized. **Purchases are enabled for the user's explicitly approved first Seeker test:** config unpaused and Railway `PACK_ENABLED=true`, with the available catalog verified. Native **1.0.0 (55)** is uploaded to TestFlight (VALID/internal beta) and the public Seeker APK release; this follow-up also enables general individual figures through native email signing. Production web/metadata and backend routes are deployed. The real VRF-to-Core purchase remains unverified; activation is not a completed audit or end-to-end signoff. The user will personally buy the first test pack, not the operator. See `onchain/mainnet-deployment.json` for historical deployment and `onchain/mainnet-readiness.json` / `onchain/deployment-report.html` for current readiness.

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

### ORE edition 2 candidate (2026-10-08)

`onchain/pack-config.json` now prepares edition 2: Jup 40%, BONK 40%, ORE 20%, still 1,099 SKR. Historical edition 1 remains unchanged at 50/50; its deployment evidence and paid receipts are not rewritten. Adding ORE needs no program upgrade. Deploy the updated backend and canonical ORE JSON/PNG/Rive first, distribute updated native clients (variant 5), verify live resources, then simulate and explicitly publish with the recorded admin. Until publication, the live catalog continues to report edition 1. This source change alone does not activate the new odds.

Individual ORE purchases use `oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp`, verified mainnet classic SPL Token with 11 decimals. The fixed amount is `25000000000` base units (0.25 ORE), with the existing atomic checked-token-transfer/Core path. No new environment variable or payment key is needed.

The actual edition allocation is 8,985 bytes; a read-only 2026-10-08 RPC quote was 46,294,040 lamports of rent, excluding the transaction fee. The confirmed admin held 191,076,554 lamports at that check. Recheck before publication. No funds were spent obtaining the quote. `check-packs.ts` inspects the active edition's resources; `check-pack-api.mjs` expects the candidate version/weights in `onchain/pack-config.json`, including catalog v3, and should fail until deployment/publication is complete.

Edit `onchain/pack-config.json`, increase `version` by exactly one, and publish a **new** edition. Weights are integers totaling `1000000` (`500000` = 50%, `10000` = 1%). `priceBaseUnits` is an exact SKR integer, never a floating-point number. Initial version 1 is locked to the approved 1,099 SKR / 50-50 specification.

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
