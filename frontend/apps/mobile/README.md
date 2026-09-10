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

The iOS simulator connects to `ws://localhost:8080`. The Android emulator connects to `ws://10.0.2.2:8080`. Release builds use the production endpoint configured in `src/config.ts`.

## Verification

```sh
npm run lint -w @rps/mobile
npm run typecheck -w @rps/mobile
npm test -w @rps/mobile
cd frontend/apps/mobile/ios && pod install
cd frontend/apps/mobile/ios && xcodebuild -workspace RipsyMobile.xcworkspace -scheme RipsyMobile -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build
cd frontend/apps/mobile/android && ./gradlew assembleDebug
cd frontend/apps/mobile/android && ./gradlew assembleRelease
```

The backend-issued anonymous session and current room are stored using iOS Keychain and Android Keystore. When the app returns from the background or regains its connection, it reauthenticates and reloads the latest authoritative game state. Remaining production hardening is tracked in `MOBILE_IMPLEMENTATION_PLAN.md`.
