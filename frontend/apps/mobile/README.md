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

Build the signed production Android App Bundle after provisioning the ignored `android/keystore.properties` and upload keystore:

```sh
npm run android:bundle
```

Both `android:bundle` and `ios:beta` run a release preflight first. It validates Firebase application IDs, Railway/Redis/push health, signing inputs, listing metadata, and screenshots without printing secrets. Run it directly for both platforms with `npm run mobile:release:preflight`. An intentionally incomplete test build can bypass it with `RIPSY_SKIP_RELEASE_PREFLIGHT=1`; store-bound builds should never use that override.

The bundle is written to `frontend/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`. Back up both the upload keystore and its password outside the repository before the first Play Console upload.

The TestFlight script downloads the official React Native and Hermes release dSYMs that correspond to the installed versions, adds them to the generated archive, and verifies their UUIDs before export. This keeps native crashes in the prebuilt React Native frameworks symbolicated.

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

## Solana Mobile wallet

The Android app can connect to an installed wallet through the official Solana Mobile Wallet Adapter protocol. RIPSY requests authorization for `solana:mainnet`, displays the returned public address, and stores the public address, authorization token, and wallet base URI in Android Keystore via `react-native-keychain`. It never receives or stores private keys. Disconnect first asks the wallet to deauthorize the token and then removes the local record, even if the wallet is no longer installed.

MWA's native client SDK is Android-only. The adapter implementation lives in `src/solana-wallet-adapter.android.ts`; the default module is a safe unsupported-platform implementation so the iOS app never imports the Android native module. Wallet connection currently identifies the player locally and is deliberately separate from the WebSocket game session and server-authoritative gameplay.

The app identity URI is `https://www.ripsy.fun`. Its Android association is served by `app/.well-known/assetlinks.json/route.ts` in the web app, using the production `ANDROID_APP_SHA256_CERT_FINGERPRINTS` Vercel environment variable.

## Game invitations

The Share button sends the canonical `https://www.ripsy.fun/game/<room-code>` URL. The app accepts that Universal/App Link, the `ripsy://game/<room-code>` fallback scheme, a pasted invitation URL, or a plain eight-character room code.

iOS Associated Domains and the website association response are configured for team `L28H25M8LS` and bundle ID `com.dangervalley.ripsy`. Android intent filters are configured, but verified App Links also require the production Play App Signing SHA-256 certificate fingerprint. Add it to the Vercel web project as `ANDROID_APP_SHA256_CERT_FINGERPRINTS`; use a comma-separated list during certificate rotation. Do not substitute the debug or upload-key fingerprint.

The current Android upload certificate SHA-256 fingerprint is `E2:BE:8E:A4:9A:54:47:3B:57:E5:96:88:1B:29:8E:00:44:3B:16:D8:7B:E8:D0:7F:0D:ED:63:1B:66:9A:D5:E5`. This identifies the key used to upload bundles, not the Play App Signing key used to verify production App Links.
