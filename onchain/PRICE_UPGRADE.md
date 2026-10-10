# Pack price/storage upgrade - prepared, not mainnet activated

## Scope and compatibility

- Program stays `43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ`.
- Upgrade authority/admin stays `BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh`.
- Config, Edition and Receipt serialized layouts/discriminators are unchanged.
- Each paid receipt keeps its price and edition. Immutable tables determine VRF
  outcomes and historical Core metadata. Delivery transfers `receipt.price`, not
  the latest catalog price. No re-roll, second charge or changed recipient.
- New `EditionPrice` PDA: seeds `["price", edition]`, 25 bytes including
  discriminator, fields `price:u64`, `revision:u64`, `bump:u8`.
- Admin `initialize_edition_price(version, expected_price, price)` is one-time
  normal init (not init_if_needed). `set_edition_price(version, expected_revision,
  expected_price, price)` uses revision CAS; both require the configured admin,
  active edition and positive price.
- New editions allocate exact validated serialized bytes. Current Jup/BONK/ORE
  table is 285 bytes instead of 8,985. Bounds, unique variants, UTF-8 byte limits,
  100% totals and transaction-size rejection are retained.
- Existing editions are not changed, shrunk or closed. Old locked rent is not
  refunded by this upgrade. Old publication jobs without `kind` remain recoverable.

## Reviewed build

- Previous binary: SHA-256
  `199b77db47f82812d115346f706dffa9913f3f207ca3ff13825f4746a5b8d256`, 449,184 bytes.
- Prepared binary: SHA-256
  `530e0b4cacbb91bf4280a33887aa19eb9c2aa0fb9e2f08cce584383bc93f3ac4`, 483,280 bytes.
- New binary: ignored `onchain/target/deploy/ripsy_packs.so`.
- Verified old rollback binary retained at ignored
  `onchain/target/rollback/ripsy_packs-199b77db.so`.
- Generated Anchor 0.31.1 IDL copied from the build, checked by backend tests.
- Eight Rust tests, 140 backend tests, 24 web tests, all app TypeScript checks,
  production web build and 375/768/1280 browser price-only/signature/recovery
  fixture pass. Actual localhost upgrade from the old binary passes with a
  padded legacy edition and synthetic old receipt, exact 25-byte pricing,
  revision/price/replay/zero/inactive-edition rejection and a 285-byte new table.
- Buy account validation uses boxed edition/receipt to stay within SBF stack
  limits. The existing Core SDK plugin-decoder warning concerns a symbol absent
  from the linked binary, independently checked again. No full real oracle/Core
  purchase test, physical-device test or completed project security audit is
  claimed. Existing Next/shell-quote advisories remain separate follow-up work.

## Source deployment verified, 2026-10-10

Implementation `ed4d6525baad5879acc419137586cf09979aaaf1` is SUCCESS on Railway
(`a4406f47-01d7-4533-8aea-fd6a5bbe43b4`). Vercel production is READY at
`ripsy-8c07lpy49-danger-valley.vercel.app`, aliased to `www.ripsy.fun`; it was
deployed separately after the Git-triggered web deployment did not start.
The actual upload manifest passed: 159 web source/assets, backend/native/env/
private keys excluded. Public admin bundles contain the price-only review and
signature workflow. Live checks verify healthy Redis, configured admin, customer
token rejection including `/shop/admin/pack-price`, exact CORS and unchanged
edition 2 at 1,099 SKR with Jup/BONK/ORE 40/40/20. Only anonymous diagnostic
sessions were created. No paid transaction, price update, new edition or program
upgrade was submitted. Price-only simulation remains unavailable until upgrade.

## Mainnet read-only cost snapshot

Checked 2026-10-10 11:17 UTC and again at 11:29 UTC with identical results.
Re-run before spending:

```sh
node --env-file=.env onchain/scripts/check-price-upgrade.mjs
```

ProgramData: `DZeMqKpHuE98CmdjbN4cgjXjGktUosgsCUGgScniEG3Y`. Finalized code
and authority match the old deployment. No transaction was signed/submitted.

| Requirement | SOL |
| --- | ---: |
| ProgramData growth rent (34,096 bytes) | 0.17320768 |
| Temporary upload buffer rent | 2.45590060 |
| Current public fee-wallet balance | 0.147006078 |
| Rent for a future three-drop edition | 0.00209804 |
| First 25-byte price PDA rent per edition | 0.00077724 |

Transaction fees/retries are additional. Upload buffer rent is temporary and is
returned by a successful upgrade; retain its key to recover interrupted uploads.
ProgramData growth rent stays in ProgramData. Target at least approximately
2.65 SOL working balance (growth + buffer + 0.02 SOL fee reserve), not a promise
that the full amount is spent. Recheck live rent/balance and exact build hash
before requesting/signing an upgrade. Price updates after the first need no new
rent; simulate to show the actual fee. With a 5,000-lamport base fee, first price
change is about 0.00078224 SOL, later changes about 0.000005 SOL; three-drop
publication about 0.00210304 SOL. These are snapshots, not fixed fees/USD prices.

## Safe rollout

1. Deploy backend/web source first. Every prepared purchase includes the canonical
   price account as its **last read-only** meta. The old program ignores it;
   catalog falls back to original price while no price PDA exists. Unsupported
   price-update simulations fail without creating a signable job. No new env or
   native rebuild is required.
2. Wait for old unpaid transaction blockhashes to expire before the upgrade.
   Updated BuyPack requires the canonical price account; omission/replacement
   cannot silently bypass changed pricing. Any surviving old unpaid transaction
   without it fails atomically and must be reviewed/requoted. Existing paid
   receipts and claim/callback ABI are unaffected.
3. Obtain explicit upgrade spending approval/funding, recheck code/authority/
   balances and keep Redis/old binary backups. Use an explicitly scoped mainnet
   RPC, program ID and approved fee/upgrade key. Do not change the CLI default
   network, authorities, pack price, drop table, pause flag or backend mint key.
4. Upload the reviewed binary with a recoverable buffer; verify finalized loader
   owner, ProgramData code bytes/hash and unchanged upgrade authority. Record
   actual fee/rent/slot/signature. Recheck old editions and paid receipts byte-for-
   byte and the live catalog. Do not equate CLI success with code verification.
5. Human admin may separately sign a desired price update in the admin page.
   No 10 SKR price or edition 3 is implicitly authorized by this preparation.
   Test one paid pack only with a human-approved customer transaction; recover
   the same receipt on delays. Keep old receipt fixtures in the regression suite.

### Rollback

If new pricing has been activated, do not restore the old binary while buys are
open: the old program ignores price overrides. Pause buys using the existing
admin instruction first. Restore the verified old binary with the same authority
if necessary and verify finalized bytes, keeping all state/receipts intact.
Keep price PDAs and receipts; do not delete or reset them. Resume only after
explicitly reconciling public pricing and desired old-edition pricing. Claims
continue to use immutable historical editions and paid receipt prices.
