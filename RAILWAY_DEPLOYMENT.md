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
PUSH_INSTALLATION_TTL_SECONDS=7776000
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_SERVICE_ACCOUNT_JSON=<complete service-account JSON>
```

Railway supplies `PORT`; do not set it manually. Generate `SESSION_SECRET` locally with a secure password generator, for example `openssl rand -base64 48`, and keep the same value on every backend replica.

Configure `/health` as the healthcheck path with a 60-second timeout. Use the `ON_FAILURE` restart policy. The endpoint returns `200` only after Redis is reachable.

`FIREBASE_PROJECT_ID` is `ripsy-app`. `FIREBASE_SERVICE_ACCOUNT_JSON` is a Railway secret. Paste the complete JSON downloaded for a dedicated Google service account with permission to send Firebase Cloud Messaging messages. Never add that file or value to Git. If both Firebase variables are absent, gameplay stays available and the backend reports `push.disabled`; push delivery is simply disabled.

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

## 7. Firebase push setup

1. Create one Firebase project and enable the Firebase Cloud Messaging API (HTTP v1).
2. Add an iOS app with bundle ID `com.dangervalley.ripsy`. Download `GoogleService-Info.plist`, place it at `frontend/apps/mobile/ios/RipsyMobile/GoogleService-Info.plist`, then add it to the `RipsyMobile` target in Xcode with **Copy items if needed** and **Copy Bundle Resources** enabled.
3. In Apple Developer, enable Push Notifications for the same App ID. Create an APNs authentication key and upload it in Firebase Console → Project settings → Cloud Messaging. Do not commit the `.p8` key.
4. Add an Android app with package name `com.dangervalley.ripsy`. Download `google-services.json` to `frontend/apps/mobile/android/app/google-services.json`.
5. Create a dedicated service account, grant the Firebase Cloud Messaging API Admin role, download its JSON once, and copy the full JSON into Railway as `FIREBASE_SERVICE_ACCOUNT_JSON`. Set `FIREBASE_PROJECT_ID` to the Firebase project ID.
6. Redeploy Railway. Its startup log should contain `push.enabled`.
7. Reinstall the native app on physical iOS and Android devices, enable notifications from the Home screen, and play a two-device battle. Tapping a notification should open its game room.

The production mobile config files are committed with the native projects because they contain app identifiers and restricted client API keys, not server credentials. Firebase FIDs are stored in Redis under the configured `RIPSY_REDIS_PREFIX` for 90 days by default and refreshed whenever an opted-in app starts.
