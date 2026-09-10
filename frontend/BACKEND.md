# Backend and WebSocket protocol

The backend is a stateless Node.js WebSocket service. `GET /health` verifies its Redis connection and returns `503` when Redis is unavailable.

## Multi-instance architecture

- Redis string keys contain the complete authoritative game record.
- Every accepted mutation reads the current record, validates and computes the next state, then commits through an atomic Lua compare-and-swap operation.
- Conflicting mutations retry against fresh state instead of overwriting one another.
- The same atomic operation publishes a room event through Redis Pub/Sub.
- Every backend instance subscribes to room events, reloads the durable record, projects a private view for each player, and broadcasts it to locally connected sockets.
- Only live WebSocket objects remain process-local. No game state or gameplay authority depends on a specific backend instance.

Redis Pub/Sub is an at-most-once notification layer; it is not the source of truth. Command responses and explicit `getGame` requests always read the durable Redis record, so reconnecting clients recover current state.

## Configuration

```text
REDIS_URL=redis://127.0.0.1:6379
GAME_TTL_SECONDS=604800
RIPSY_REDIS_PREFIX=ripsy
SESSION_SECRET=replace-with-at-least-32-random-characters
SESSION_TTL_SECONDS=2592000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3100
PORT=8080
```

Use a different prefix for staging and production when they share a Redis deployment. Accepted mutations refresh the game TTL.

## Local development

`npm run dev` starts Redis through Docker Compose, then launches the backend and frontend. To use an existing Redis-compatible service instead:

```bash
REDIS_URL=rediss://user:password@host:6379 npm run dev:server
```

## Identity

`POST /session` issues a signed anonymous player session. A client stores the returned token, opens the WebSocket, and sends `{ "type": "authenticate", "token": "..." }` before any game command. The server verifies the signature and derives `playerId` from the token; it never trusts a client-supplied player ID.

Set a cryptographically random `SESSION_SECRET` of at least 32 characters in every deployed environment. Keep staging and production secrets separate. `ALLOWED_ORIGINS` is a comma-separated allowlist for browser calls to `/session`; native clients do not send an Origin header.

Every backend instance in one environment must use the same `SESSION_SECRET`. Rotating it immediately invalidates existing anonymous sessions.

## Commands

Every command carries a `requestId`. Supported commands are:

- `createGame`
- `getGame`
- `joinGame`
- `submitLineup`
- `movePiece`
- `chooseWeapon`

The server replies with `result` or `error`. Shared TypeScript definitions are in `packages/core/src/index.ts`.

## DigitalOcean deployment

1. Provision a managed Redis/Valkey-compatible database with persistence and automatic failover.
2. Give every backend instance the same encrypted `REDIS_URL`.
3. Deploy the backend service with `npm ci` and `npm run start:server`.
4. Configure `/health` as the readiness check.
5. Scale the backend service horizontally; no sticky sessions are required.
6. Point Vercel's `NEXT_PUBLIC_GAME_WS_URL` to the public `wss://` backend endpoint and `NEXT_PUBLIC_GAME_HTTP_URL` to its HTTPS `/session` endpoint.

For production, also add rate limits, metrics, and structured logs.
