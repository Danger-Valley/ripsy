# RIPSY Native Mobile Implementation Plan

This document is the working checklist for rebuilding RIPSY as a real React Native application. The mobile app must use the React Native Community CLI, include native `ios/` and `android/` projects, and must not use Expo, a WebView, MagicBlock, Solana, wallets, or smart contracts.

## Architecture we are keeping

- `frontend/packages/game-engine`: shared authoritative rules used by both the backend and offline play.
- `backend/`: authoritative Node.js WebSocket transport and persistence layer for multiplayer games.
- Redis: durable game state, atomic mutations, expiry, and multi-instance Pub/Sub fan-out.
- `frontend/packages/core`: shared game constants, state, commands, and server-message types.
- `frontend/apps/web`: existing web client; it must keep working during the native migration.

The backend, not either client, decides whether commands are legal and computes game outcomes. Mobile animations are presentation only.

For offline computer games, the mobile app invokes the same shared game engine directly; it does not duplicate or weaken the rules.

## Milestone 1: native playable foundation

- [x] Scaffold `frontend/apps/mobile` with React Native Community CLI.
- [x] Generate native iOS and Android projects inside the repository.
- [x] Add monorepo-compatible Metro and TypeScript configuration; validate Android Debug/Release and CocoaPods/iOS Simulator builds; launch both Release apps against the production backend.
- [x] Add native app theme, safe-area root, and development/production WebSocket configuration.
- [x] Split browser-only behavior out of `@rps/game-client`.
- [x] Build a platform-neutral WebSocket client with request timeouts and reconnect backoff.
- [x] Add native player-session persistence.
- [x] Build the native Home, Create/Join, Waiting Room, Lineup, Game, Tie Choice, and Result states.
- [x] Build a responsive native 7 x 7 board with tap selection and move indicators.
- [x] Port image and Rive assets to the native bundle.
- [x] Verify create/join/lineup/moves, hidden player views, and reconnect recovery with two clients against the production backend.
- [ ] Verify the complete native two-client flow through the result screen on physical devices.

## Milestone 2: secure and reliable beta

- [x] Replace the trusted `playerId` query parameter with a server-verified session token.
- [x] Store mobile credentials in iOS Keychain and Android Keystore.
- [x] Rename blockchain-era `gamePda`, `publicKey`, and address terminology to game/player terminology.
- [x] Add runtime protocol validation and typed protocol-version errors.
- [x] Handle foreground/background transitions, network loss, stale connections, and full-state recovery.
- [x] Persist the last active game and restore it only after the backend confirms it is still unfinished.
- [x] Add native sharing, validated room-code entry, invitation deep-link routing, and iOS Universal Links.
- [x] Add production Android signing configuration that keeps the upload key and passwords outside Git.
- [x] Provision and back up the Android upload key, then verify a signed production App Bundle.
- [ ] Enable Play App Signing and publish its signing fingerprint to verify Android App Links.
- [x] Replace timer-driven combat code with an explicit animation queue driven by state transitions.
- [x] Recreate the full Rive battle scene: approach, facing, 2× scale, weapon-specific winner attack, loser death, and authoritative settle.
- [x] Add structured client/server diagnostics without logging credentials or hidden game data.

## Milestone 3: store-ready release

- [x] Add Redis-backed FCM turn, opponent-joined, tie-choice, and game-finished push notifications with notification deep links.
- [x] Create the production Firebase project, register the native apps, add the upload-key fingerprint, and bundle their SDK configurations.
- [ ] Provision production Firebase/APNs credentials and verify push delivery on physical iOS and Android devices.
  - [x] Provision the dedicated Railway FCM service account and verify `push: configured` in production health checks.
  - [x] Upload the production APNs authentication key to Firebase and deliver iOS build `1.0.0 (2)` to TestFlight.
- [x] Add accessibility labels and state, dynamic text-safe scrolling, system-respecting haptics, and tablet-width layouts.
- [x] Add unit, component, WebSocket recovery, and two-client end-to-end tests.
- [ ] Test on physical iOS and Android devices, including app suspension and network switching.
- [x] Configure bundle/application IDs, icons, launch screens, privacy metadata, and draft store listings.
- [x] Provision the App Store distribution certificate and provisioning profile for TestFlight.
- [x] Provision Play upload signing credentials and capture Android phone screenshots from a signed release build.
- [ ] Finalize store listing contacts and capture the remaining iOS gameplay and tablet screenshots.
- [x] Register the iOS test device, produce a signed App Store archive, and add a reproducible TestFlight upload command.
- [x] Create the App Store Connect app record and upload iOS build `1.0.0 (1)` to TestFlight.
- [x] Configure the `RIPSY Internal` TestFlight group with automatic distribution and invite the Account Holder.
- [x] Restore release dSYM coverage for React, React Native dependencies, and Hermes crash symbolication.
- [ ] Upload Android to Play internal testing.

## Milestone 4: offline computer opponent

- [x] Extract the pure game engine into a shared package without changing online backend behavior.
- [x] Add a `Play vs computer` entry that works independently of backend connectivity.
- [x] Generate a valid hidden computer lineup and start immediately after the player saves theirs.
- [x] Add legal-move AI with forward/contact/centre heuristics, bounded randomness, and no access to hidden opponent piece types.
- [x] Resolve computer tie choices locally and reuse confirmed movement animations, clocks, haptics, and result UI.
- [ ] Persist an unfinished offline game across app termination.
- [ ] Add selectable difficulty levels and improve strategy through simulations/evaluation rather than hidden-information access.

## Implementation order

1. Generate and stabilize the bare native workspace.
2. Make the shared protocol/client platform-neutral.
3. Implement the complete game flow with simple native visuals.
4. Port and polish Rive animations.
5. Secure identity and harden mobile lifecycle recovery.
6. Add invitations, push notifications, tests, and store delivery.

## Definition of the first playable build

Two users can install native builds, create or join the same room, submit hidden lineups, take turns, resolve ties, finish a game, lose and regain connectivity, and recover the authoritative state without loading any web UI.
