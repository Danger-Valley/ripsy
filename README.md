# RIPSY

Real-time Rock–Paper–Scissors strategy game. Two players arrange hidden pieces, move across a 7×7 board, resolve battles, and race to capture the opposing flag.

The game uses an authoritative Node.js backend and WebSockets. There is no wallet, blockchain, or smart-contract dependency.

## Structure

```text
ripsy-app/
├── backend/                    WebSocket server and authoritative game engine
└── frontend/
    ├── apps/
    │   ├── web/                Next.js client
    │   └── mobile/             Bare React Native iOS and Android client
    └── packages/
        ├── core/               Shared protocol, constants, and types
        └── game-client/        React WebSocket client and player identity
```

## Run locally

Requirements: Node.js 20+, npm 10+, and Docker for the local Redis container.

```bash
npm install
npm run dev
```

This starts:

- Web app: http://localhost:3000
- WebSocket backend: ws://localhost:8080
- Health check: http://localhost:8080/health
- Redis: redis://localhost:6379

The client defaults to `ws://localhost:8080`. Set `NEXT_PUBLIC_GAME_WS_URL` for another backend URL.

## Useful commands

```bash
npm run dev:server
npm run dev:web
npm run dev:mobile
npm run dev:redis
npm run ios
npm run android
npm test
npm run build
```

## Storage and scaling

Game state is stored in Redis with atomic compare-and-swap mutations. Redis Pub/Sub fans updates across any number of WebSocket backend instances. Backend restarts do not lose active games, and players connected to different instances share the same authoritative state.

Games expire after seven days of inactivity by default. Configure the backend with `REDIS_URL`, `GAME_TTL_SECONDS`, and `RIPSY_REDIS_PREFIX`. Browser player IDs are generated once and saved in local storage. See [BACKEND.md](frontend/BACKEND.md) for architecture and deployment details.

## Game flow

1. Player 0 creates a room and shares its URL.
2. Player 1 joins the room.
3. Both players submit a hidden lineup.
4. Players alternate orthogonal moves.
5. The server resolves traps, flags, normal RPS battles, and tied battles.
6. Capturing the opponent’s flag ends the game.

## License

MIT
