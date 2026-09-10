# Railway backend deployment

RIPSY runs on Railway as a long-lived backend service plus a Redis service in the same project and region. Vercel continues to host the web application.

## Current production

- Web: `https://www.ripsy.fun`
- Backend HTTP: `https://api.ripsy.fun`
- Backend WebSocket: `wss://api.ripsy.fun`
- Railway region: Amsterdam

## 1. Create the Railway project

1. Create an empty Railway project and choose the region closest to the initial users. Use EU West for an audience concentrated in Europe.
2. Add a Redis service from `+ New` → `Database` → `Redis`.
3. Add a service from the `Danger-Valley/ripsy` GitHub repository.
4. Keep the repository root directory as `/` because the backend imports the shared `@rps/core` workspace.
5. Railway automatically detects the root `/Dockerfile` and uses it for the backend image.
6. Add a Railway custom domain and point a DNS-only CNAME at the Railway target. Production uses `api.ripsy.fun` for both HTTPS and WSS.

Do not expose Redis publicly. The backend uses Railway's private project network.

The first production image can also be uploaded from the repository root with `railway up --service backend`. For automatic deployments after future pushes, grant the Railway GitHub App access to the private `Danger-Valley/ripsy` repository and connect `master` as the service source.

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

Configure Vercel with:

```text
NEXT_PUBLIC_GAME_WS_URL=wss://api.ripsy.fun
NEXT_PUBLIC_GAME_HTTP_URL=https://api.ripsy.fun/session
ANDROID_APP_SHA256_CERT_FINGERPRINTS=<Play App Signing SHA-256 fingerprint>
```

The Android fingerprint is used by `https://www.ripsy.fun/.well-known/assetlinks.json` to verify game invitation App Links. It is configured on Vercel, not Railway. Use a comma-separated list while rotating signing certificates.

Redeploy the Vercel project after changing either public variable. The native release configuration uses the same `wss://` domain in `frontend/apps/mobile/src/config.ts`.

## 4. Scale safely

Scale the backend service to two or more replicas from Railway's service settings. Sticky sessions are not required: Redis contains authoritative state and distributes room events, while a reconnecting client always requests a fresh state snapshot.

Keep backend and Redis in the same Railway project, environment, and region. Use separate Redis prefixes and session secrets for staging and production.

## 5. Smoke test

1. Confirm `https://<backend-domain>/health` returns `{ "ok": true, "redis": "connected" }`.
2. Create a game in one browser or device and join it from another.
3. Scale the backend to two replicas and repeat the test.
4. Restart one replica during a game and verify both clients reconnect and recover the current board.

## 6. Diagnostics

Railway logs are newline-delimited JSON. Filter on `event`, `level`, `action`, or `outcome` to inspect connection churn, command latency, Redis failures, and Pub/Sub delivery. Diagnostic entries intentionally omit session tokens, player IDs, room IDs, request IDs, coordinates, lineups, and board state.

The native client emits the same safe JSON shape to the platform device log with `service: "game-client"`. Client events cover connection status, reconnect delay, request latency/outcome, close codes, and protocol errors. A failing diagnostic sink is isolated and cannot interrupt gameplay.
