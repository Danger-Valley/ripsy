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

Each backend instance also sends a WebSocket ping every 30 seconds and terminates connections that stop answering. This lets clients detect half-open mobile connections and reconnect to a healthy replica.

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

`POST /session` issues a signed anonymous player session. A client stores the returned token, opens the WebSocket, and sends `{ "type": "authenticate", "token": "...", "protocolVersion": 1 }` before any game command. The server verifies the signature and derives `playerId` from the token; it never trusts a client-supplied player ID.

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

The server replies with `result` or a typed `error`. Both sides validate messages at runtime using the shared parsers in `packages/core/src/index.ts`. An incompatible handshake receives `UNSUPPORTED_PROTOCOL_VERSION` with the expected and received versions, and the socket closes without retrying. A missing version is temporarily interpreted as version 1 so existing clients survive the first rolling deployment; future protocol versions must always be explicit.

## Railway deployment

Railway hosts the long-lived WebSocket backend and Redis in the same project and region. The backend connects to the private Redis URL and exposes only its HTTP/WebSocket domain. No sticky sessions are required when the backend is scaled horizontally.

Follow the repository's `RAILWAY_DEPLOYMENT.md` checklist for the Dockerfile, reference variables, health check, Vercel configuration, scaling, and smoke test.

For production, also add rate limits, metrics, and structured logs.
