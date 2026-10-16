# Mainnet pack retirement - 2026-10-16

The user requested closing the RIPSY Packs contract, reclaiming rent and retaining
all contract source in Git. The future direction is backend-managed packs without
MagicBlock VRF. That replacement has not been implemented or enabled by this task.

The retirement is finalized at slot **457531046**. **2.550678160 SOL** was returned
to the existing administrator/fees wallet
`BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh`:

- ProgramData: 2.455941240 SOL.
- Config, both editions and edition pricing: 0.094736920 SOL.
- The temporary cleanup buffer's separate 0.012420600 SOL deposit was fully
  returned in the upgrade, and the buffer is absent.

Finalized transaction:
[cleanup and close](https://solscan.io/tx/5Erak6kGAMcZ1JkafQYTXK4vhQr1DpkAJfSGkP3sVYrLtxfNfmxtkPWcJxG5qcSaCvNjCED7wiNUvWRkuDfxwxCs).
The complete balances, signatures and code hashes are in
`mainnet-retirement.json`. `pre-closure-accounts.json` preserves the public chain
data of the four administrative accounts before cleanup. No buyer receipt,
pending entitlement or escrow existed before retirement. Core figure assets,
collection, individual figure sales and game state were not closed.

The loader retains the program-address tombstone with **0.000833120 SOL**. A
read-only mainnet simulation of closing that account returned `InvalidArgument`
and `Account does not support closing`. This amount is not included in the
returned 2.550678160 SOL. ProgramData and all four administrative accounts are
absent. The tombstone's executable flag alone does not mean the program is usable;
there is no executable code behind it. The same program ID cannot be redeployed.
See [Solana's program closure documentation](https://solana.com/docs/programs/deploying#close-your-program).

## Production service

Railway `PACK_ENABLED=false` is persisted for the production backend service.
Deployment `f69758c4-8408-411b-a582-e58821b9b051` restarted the existing image with
that flag. Authenticated pack catalog returns `available=false`; new pack orders
return 503 before preparing a payment. Ordinary figure catalog and game health
both return 200. Keep packs disabled until the backend replacement is implemented
and tested. Do not reactivate the old `PACK_ENABLED=true` path or publish editions
against the retired address.

## Why a cleanup payload was necessary

The original pack program had no close instruction for its state PDAs. Closing
ProgramData first would have stranded their rent. The separately retained
`close-state.c` payload is 2,272 bytes and was temporarily installed under the
existing authority. It only accepts the pinned admin as signer and recipient,
program-owned writable Config/Edition/EditionPrice state, exact old account sizes
and discriminators, and a paused Config. It cannot accept Receipt, token or Core
accounts. It clears and drains administrative state without CPI or token movement.
All four cleanup calls and the loader close executed atomically in one transaction.

The original Rust program, IDL, tests, Cargo files and historical deployments are
unchanged. The cleanup payload is separate retirement tooling, not a replacement
of the preserved pack source. The original binary hash was independently verified
before upgrade; the installed cleanup bytes and zero-filled executable tail were
verified before closing.

## Reproduce verification

From the repository root:

```sh
clang -std=c17 -O2 -Wall -Wextra -Werror -fsanitize=address,undefined onchain/retirement/test-close-state.c -o /private/tmp/ripsy-test-retirement
/private/tmp/ripsy-test-retirement
node onchain/retirement/local-smoke.mjs
node --env-file=.env onchain/scripts/retire-mainnet.mjs --verify
```

The local smoke test starts an isolated validator on unoccupied random localhost
ports, uses only local test SOL, executes the actual SBF payload plus loader close,
and checks the exact refund and account absence. Native ABI tests reject missing
or wrong signers, wrong owners, duplicate/readonly/executable state, unpaused Config,
Receipt/token accounts, type substitution, overflow and repeated cleanup. Mainnet
upgrade and final closure were separately simulated before broadcast.

Cleanup build used Solana platform-tools v1.52 clang/ld.lld:

```sh
mkdir -p onchain/target/retirement
/Users/heymike/.cache/solana/v1.52/platform-tools/llvm/bin/clang -target sbpf -Oz -fPIC -fno-builtin -std=c17 -Wall -Wextra -Werror -c onchain/retirement/close-state.c -o onchain/target/retirement/close-state.o
/Users/heymike/.cache/solana/v1.52/platform-tools/llvm/bin/ld.lld -z notext -shared --entry entrypoint --script /Users/heymike/.local/share/solana/install/active_release/bin/platform-tools-sdk/sbf/c/sbf.ld --strip-all -o onchain/target/retirement/close-state.so onchain/target/retirement/close-state.o
```

SHA-256: `949d48258e33c2a53060e9c7b76db4831a3defa12b183dde680f4fe8a02d6d3d`.
Binary output and the temporary buffer key stay in existing ignored directories;
no private keys or build output are committed. Default `retire-mainnet.mjs` is a
read-only preflight for the former live state; use `--verify` after retirement.
`--send` is historical, explicit operator tooling and rejects the now-closed program.
