# RIPSY mobile

Bare React Native Community CLI application for iOS and Android. This is a native client: it does not use Expo or render the web application.

## Local development

Start Redis and the WebSocket backend from the repository root:

```sh
npm run dev:redis
npm run dev:server
```

Then start Metro:

```sh
npm run dev:mobile
```

Run a platform build in another terminal:

```sh
npm run ios
npm run android
```

The iOS simulator connects to `ws://localhost:8080`. The Android emulator connects to `ws://10.0.2.2:8080`. Configure the production `wss://` endpoint in `src/config.ts` before making a release build.

## Verification

```sh
npm run lint -w @rps/mobile
npm run typecheck -w @rps/mobile
npm test -w @rps/mobile
cd frontend/apps/mobile/android && ./gradlew assembleDebug
```

The temporary mobile identity is persisted with AsyncStorage for the first playable milestone. It must be replaced by the signed session and secure-storage work tracked in `MOBILE_IMPLEMENTATION_PLAN.md` before production.
