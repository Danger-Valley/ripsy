# RIPSY mobile

Bare React Native Community CLI application for iOS and Android. This is a native client: it does not use Expo or render the web application.

## Latest platform delivery (2026-10-30)

iOS TestFlight 1.0.0 (71) includes independently timed Shop jumps from `6571bc0`;
App Store Connect confirms VALID/internal IN_BETA_TESTING and automatic tester
notification. Android remains build 70: no new APK was requested/published in
this task. 796 mobile tests, TypeScript, eight-model contracts and iOS preflight
pass. Signatures, exact IPA and matching dSYMs are verified; physical/paid and
unobstructed jump/landing visual validation remain pending. No external beta
review or App Store production submission. Evidence: `files/releases/1.0.0-71.md`.

## Saved checkout after session loss

Direct figure payment and Core mint remain one atomic transaction. A saved order
returning 404 now enters durable read-only reconciliation using its exact receipt.
Only finalized confirmed/failed/expired results finish pending work; unknown RPC
results retain it. Recovery never opens signing, submits a payment, changes the
buyer or transfers an order to the new player ID. Approval/Retry are hidden for
these receipts, and session repair renews HTTP without launching Seeker.

Deploy the new backend reconciliation route before releasing updated clients.
Missing retained receipts remain blocked for support; never clear app storage to
work around an unknown payment. Build 69 does not include the fix; native build
70 delivers the client change (see `files/releases/1.0.0-70.md`).
See `files/releases/checkout-reconciliation-2026-10-28.md` for verification and
the complete rollout/safety contract. Packs are not changed by this fix.

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

Android release builds enable R8 code optimization/obfuscation and resource
shrinking with `proguard-android-optimize.txt`; Debug is unchanged. SDK consumer
rules retain native/JNI bridge entry points. React Native's generated
`build/generated/res/react/release/raw/keep.xml` retains images and Rive files
loaded by name from JavaScript; do not discard that file or add blanket keeps
for all resources/dependencies. AGP 9.2.1 already enables the optimized resource
shrinker, so no experimental Gradle flag is needed.

R8 outputs its reports in `android/app/build/outputs/mapping/release`.
`build:prod-seeker` saves the matching `.mapping.txt` beside each versioned APK
in both build directories **before** publishing; `android:bundle` saves a
versioned `-play.mapping.txt` in mobile `builds`. Back these up with each exact
APK/AAB (and upload the bundle's mapping to Play/crash tooling as appropriate).
Never use a later build's mapping to retrace an earlier crash. Configuration
regressions can be checked with
`node --test frontend/apps/mobile/scripts/android-release-optimization.test.mjs`.

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

## Turn notifications

On iOS, `AppDelegate` configures Firebase from the bundled plist before creating
React Native. A plist without `FirebaseApp.configure()` leaves RNFB's default
app registry empty and falsely reports alerts as unavailable. Release preflight
now guards this startup order; its isolated regression tests run with
`node --test frontend/apps/mobile/scripts/check-ios-firebase-bootstrap.test.mjs`
from the repository root. This source guard does not replace a physical push test.

Enable notifications explicitly in Settings. The authenticated installation is
registered with the backend; successful online moves notify the next player.
While viewing that room in the foreground, the alert is suppressed. On another
screen (including Settings or a different battle), a dismissible Toy Box banner
opens that exact room. Background/closed apps use Firebase's OS notification;
both warm and cold notification taps open the game and refresh server state.

`firebase.json` pins iOS system foreground presentation to off: do not turn it
on or add a duplicate local background notification. The in-app banner owns
foreground presentation, with a separate host inside native dialogs. Initial
notification URLs are captured once before navigation restoration because
Android's initial message is consumable. Firebase remains optional for local
builds. Phone notification settings/permissions, network conditions and Android
force-stop can prevent or delay delivery. Device delivery verification is still
required after shipping these changes; unit tests do not prove APNs/FCM delivery.

## Solana Mobile wallet

On Seeker, Android uses official `@solana-mobile/seeker-connect-react-native`
**0.2.0** over the Kotlin SDK/Mobile Wallet Adapter. Home, Army and shop account/
recovery actions use its native **Connect with Seeker** button and progress/error
dialogs. The direct wallet URI is `https://connect.solanamobile.com`; native apps
need no relay configuration. The integration uses ordinary React Native, not Expo.
Keep Gradle's `reactNativeVersion` aligned with this app so the module does not
compile against its own default React Native version.

The SDK owns its separate authorization cache. Old direct-MWA tokens and wallet
URIs are never imported: an existing user may approve RIPSY once on first explicit
connection/signing. The remembered public address remains in device-only protected
Keychain/Keystore storage for display and exact-buyer checks; loading it never
launches a wallet. SDK cache restores are checked for network and public-key/address
consistency. Explicit saved-purchase reconnect can forget a wrong SDK account and
authorize the exact original buyer; cancellation/another account cannot replace
that buyer or the order. Disconnect forgets SDK and local connection state; this
does not promise revocation of every prior wallet authorization.

`src/solana-wallet-adapter.android.ts` lazily loads the Android SDK; the default
adapter and button remain unsupported on iOS. Seeker-only device routing is
unchanged; ordinary phones retain email registration. Wallet identity is separate
from the backend's anonymous HTTP/WebSocket session. The existing 401 session
repair runs before explicit wallet connection, without automatic purchase approval.

Collection/Seeker proofs use `signIn` with the exact server nonce/domain/expiry
and selected address. The response is verified locally and by the backend; only
the existing exclusive figure requires SGT. Payments use `signTransactions` on
the original raw, pre-signed bytes. Check the wallet's transaction-version
capability, immutable message, existing server signatures and required buyer
signature before returning the bytes to the backend. Never use SDK
`signAndSendTransactions`, sign a transaction as a message, allow extra wallet
instructions or automatically retry cancelled/ambiguous signing. RIPSY's backend
still owns final validation, durable recovery and submission. A wallet that changes
the message fails safely; this migration does not relax that compatibility policy.

Verification of this source migration: 758 native tests/56 suites, 217 backend
tests, 31 web tests, all three app typechecks, focused ESLint, both-platform Metro
production bundles and Android `compileDebugKotlin`/`assembleDebug` pass. SDK
autolinking and merged wallet-query manifest are present. These are local/mocked
checks, not a physical Seeker association, native-button visual inspection or paid
purchase. No new release version/APK publication/TestFlight upload is implied;
published build 68 remains unchanged. A new native build and physical Seeker test
are needed for delivery/signoff. See the official
[quickstart](https://docs.solanamobile.com/solana-mobile-stack/seeker-connect-quickstart)
and `WEB_PARITY_HANDOFF.md`.

The figure shop also supports a native Privy embedded Solana wallet on iOS and
Android. Email OTP, restored login, wallet creation, disconnect and transaction
approval remain in the app; no browser checkout or Expo package is used. Build
with the public `PRIVY_APP_ID` and `PRIVY_CLIENT_ID` values from Privy Dashboard.
The native SDK keeps credentials and key material out of JavaScript. The backend
constructs the payment + Core mint transaction; mobile signs it and returns it to
the backend for exact-message verification, persistence and RPC submission.

The Privy mobile app client must allow application identifier
`com.dangervalley.ripsy` and URL scheme `ripsy`. Email must also be enabled under
User Management > Authentication. The release preflight reads Privy's public app
configuration and rejects a release build when any of these settings is missing.

Privy's current native SDK requirements make the minimum versions iOS 17 and
Android API 28.

The app identity URI is `https://www.ripsy.fun`. Its Android association is served by `app/.well-known/assetlinks.json/route.ts` in the web app. The route includes the verified direct-APK release certificate and optionally adds `ANDROID_APP_SHA256_CERT_FINGERPRINTS` from Vercel for separately verified store-signing certificates.

## Game invitations

The Share button sends the canonical `https://www.ripsy.fun/game/<room-code>` URL. The app accepts that Universal/App Link, the `ripsy://game/<room-code>` fallback scheme, a pasted invitation URL, or a plain eight-character room code.

iOS Associated Domains and the website association response are configured for team `L28H25M8LS` and bundle ID `com.dangervalley.ripsy`. Android intent filters are configured, and the association route includes the current direct-APK signing certificate. When distributing through Google Play, also add the separate production Play App Signing SHA-256 fingerprint to Vercel as `ANDROID_APP_SHA256_CERT_FINGERPRINTS`; use a comma-separated list during certificate rotation. Do not substitute the debug or upload-key fingerprint for Play App Signing.

Waiting for opponent now includes a locally generated QR and readable room code.
QR and sharing use `https://www.ripsy.fun/game/<code>?invite=1`; installed apps
handle the existing game path. The web fallback shows installation instead of
joining the game. Vercel-only `RIPSY_IOS_INSTALL_URL`, `RIPSY_ANDROID_INSTALL_URL`
and `RIPSY_SEEKER_INSTALL_URL` change install destinations without changing the QR.
Defaults are the current public TestFlight invitation and APK download page.
Store installation is not deferred joining: return to the invite and open the
game, or enter its code on Home. The room may expire during installation.
Deploy the updated web route/association and ship the mobile QR before testing
the complete phone-camera flow.

The current Android upload certificate SHA-256 fingerprint is `E2:BE:8E:A4:9A:54:47:3B:57:E5:96:88:1B:29:8E:00:44:3B:16:D8:7B:E8:D0:7F:0D:ED:63:1B:66:9A:D5:E5`. This identifies the key used to upload bundles, not the Play App Signing key used to verify production App Links.
