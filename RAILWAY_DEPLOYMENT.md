# Railway backend deployment

RIPSY runs on Railway as a long-lived backend service plus a Redis service in the same project and region. Vercel continues to host the web application.

## 1. Create the Railway project

1. Create an empty Railway project and choose the region closest to the initial users. Use EU West for an audience concentrated in Europe.
2. Add a Redis service from `+ New` → `Database` → `Redis`.
3. Add a service from the `Danger-Valley/ripsy` GitHub repository.
4. Keep the repository root directory as `/` because the backend imports the shared `@rps/core` workspace.
5. In the backend service build settings, select the Dockerfile builder and set the Dockerfile path to `/Dockerfile.backend`.
6. Generate a public Railway domain for the backend service.

Do not expose Redis publicly. The backend uses Railway's private project network.

## 2. Configure backend variables

Add these variables to the backend service:

```text
REDIS_URL=${{Redis.REDIS_URL}}
SESSION_SECRET=<at least 32 cryptographically random characters>
SESSION_TTL_SECONDS=2592000
GAME_TTL_SECONDS=604800
RIPSY_REDIS_PREFIX=ripsy:production
ALLOWED_ORIGINS=https://<your-vercel-domain>
```

Railway supplies `PORT`; do not set it manually. Generate `SESSION_SECRET` locally with a secure password generator, for example `openssl rand -base64 48`, and keep the same value on every backend replica.

Configure `/health` as the healthcheck path with a 60-second timeout. Use the `ON_FAILURE` restart policy. The endpoint returns `200` only after Redis is reachable.

## 3. Connect Vercel and the mobile app

If the generated backend domain is `ripsy-backend.up.railway.app`, configure Vercel with:

```text
NEXT_PUBLIC_GAME_WS_URL=wss://ripsy-backend.up.railway.app
NEXT_PUBLIC_GAME_HTTP_URL=https://ripsy-backend.up.railway.app/session
```

Redeploy the Vercel project after changing either public variable. Before producing a release mobile build, set `productionGameWebSocketUrl` in `frontend/apps/mobile/src/config.ts` to the same `wss://` domain.

## 4. Scale safely

Scale the backend service to two or more replicas from Railway's service settings. Sticky sessions are not required: Redis contains authoritative state and distributes room events, while a reconnecting client always requests a fresh state snapshot.

Keep backend and Redis in the same Railway project, environment, and region. Use separate Redis prefixes and session secrets for staging and production.

## 5. Smoke test

1. Confirm `https://<backend-domain>/health` returns `{ "ok": true, "redis": "connected" }`.
2. Create a game in one browser or device and join it from another.
3. Scale the backend to two replicas and repeat the test.
4. Restart one replica during a game and verify both clients reconnect and recover the current board.
