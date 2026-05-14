# Ripsy – Monorepo

Monorepo for an onchain Rock–Paper–Scissors game on Solana.

- Web app: Next.js in `apps/web`
- Shared packages for reuse in React Native later:
  - `@rps/core` – game logic and types (pure TS)
  - `@rps/solana-client` – Solana utilities (placeholder)

## Quick start

1) Install dependencies

```bash
npm install
```

2) Run the web app (Next.js)

```bash
npm run dev          # User server on 3000
# or run the agent's server on another port to avoid clashes
npm run dev:agent    # Agent server on 3100
```

Open `http://localhost:3000`.

### Port conflicts

If Cursor Agent is running its own dev server, use `npm run dev:agent` to run it on `3100`, while your own `npm run dev` uses `3000`.

### Troubleshooting

- If the dev server doesn't start, ensure Node >= 18.18 and npm >= 9.8.
- The web app transpiles `@rps/core` and `@rps/solana-client` directly from TS.
- No `react-native-web` is used; RN app will later import the shared packages.

## Structure

```
apps/
  web/                # Next.js app (web)
packages/
  core/               # Reusable game logic
  solana-client/      # Reusable Solana utilities
```

## Notes

- Built with TypeScript and npm workspaces for maximal code reuse with a future React Native app.
- No `react-native-web` – mobile will be a separate RN app consuming the shared packages.