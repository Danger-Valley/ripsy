# RIPSY frontend

The web client is a Next.js app in `apps/web`. Shared browser-independent protocol types live in `packages/core`, while `packages/game-client` owns persistent player identity and the WebSocket React hook.

Run the complete application from the repository root:

```bash
npm install
npm run dev
```

To point the browser at a deployed backend:

```bash
NEXT_PUBLIC_GAME_WS_URL=wss://game.example.com npm run dev:web
```

The server remains authoritative. UI state is updated from server broadcasts after every accepted command.
