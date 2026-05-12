# RIPSY

Onchain Rock–Paper–Scissors battle game on Solana. Players stake into a game, place a hidden lineup of pieces, move across a board, and resolve combat via on-chain RPS commits.

## Repository layout

```
ripsy-app/
├── solana-program/        Anchor program (Rust)
│   └── programs/ripsy/    The `ripsy` on-chain program
└── frontend/              npm workspaces monorepo (TypeScript)
    ├── apps/web/          Next.js web client
    └── packages/
        ├── core/          Shared game logic and types (pure TS)
        └── solana-client/ Anchor client + `useRipsyGame` React hook
```

Shared TS packages live in `frontend/packages/` so a future React Native app can reuse the same game logic and client without duplication.

## Prerequisites

- Node.js ≥ 18.18 and npm ≥ 9.8
- Rust toolchain + [Anchor](https://www.anchor-lang.com/) 0.32.1
- Solana CLI configured for devnet (`solana config set --url devnet`)
- A funded devnet wallet at `~/.config/solana/id.json`

## Frontend (web app)

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

See [frontend/README.md](frontend/README.md) for workspace details and [frontend/SMART_CONTRACT_INTEGRATION.md](frontend/SMART_CONTRACT_INTEGRATION.md) for the `@rps/solana-client` API.

## Solana program

```bash
cd solana-program
yarn install
anchor build
anchor test            # runs the mocha suite against a local validator
anchor deploy          # uses cluster + wallet from Anchor.toml
```

Program ID (localnet/devnet): `3ueExHyxLr7ahqcBEzse3L21rTaWQ91rLtVnZLsx4ngA` — see [solana-program/Anchor.toml](solana-program/Anchor.toml).

## How a game flows

1. **Create** — a player creates a game, becoming P0.
2. **Join** — a second player joins as P1.
3. **Lineup** — each player submits a hidden flag position and piece layout.
4. **Move** — players take turns moving pieces on the board.
5. **Combat** — when pieces collide, both players commit an RPS choice; the smart contract resolves the winner.
6. **Finish** — game ends when a flag is captured or all pieces are eliminated.

Phases, state, and instruction reference are documented in [frontend/SMART_CONTRACT_INTEGRATION.md](frontend/SMART_CONTRACT_INTEGRATION.md).

## License

MIT
