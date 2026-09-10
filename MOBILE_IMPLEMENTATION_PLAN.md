# RIPSY Native Mobile Implementation Plan

This document is the working checklist for rebuilding RIPSY as a real React Native application. The mobile app must use the React Native Community CLI, include native `ios/` and `android/` projects, and must not use Expo, a WebView, MagicBlock, Solana, wallets, or smart contracts.

## Architecture we are keeping

- `backend/`: authoritative Node.js WebSocket game server.
- Redis: durable game state, atomic mutations, expiry, and multi-instance Pub/Sub fan-out.
- `frontend/packages/core`: shared game constants, state, commands, and server-message types.
- `frontend/apps/web`: existing web client; it must keep working during the native migration.

The backend, not either client, decides whether commands are legal and computes game outcomes. Mobile animations are presentation only.

## Milestone 1: native playable foundation

- [x] Scaffold `frontend/apps/mobile` with React Native Community CLI.
- [x] Generate native iOS and Android projects inside the repository.
- [x] Add monorepo-compatible Metro and TypeScript configuration and validate the Android Gradle build. CocoaPods validation remains.
- [x] Add native app theme, safe-area root, and development/production WebSocket configuration.
- [x] Split browser-only behavior out of `@rps/game-client`.
- [x] Build a platform-neutral WebSocket client with request timeouts and reconnect backoff.
- [x] Add prototype native player-session persistence; secure storage is Milestone 2.
- [x] Build the native Home, Create/Join, Waiting Room, Lineup, Game, Tie Choice, and Result states.
- [x] Build a responsive native 7 x 7 board with tap selection and move indicators.
- [ ] Port image and Rive assets to the native bundle.
- [ ] Verify create/join/play/result with two clients against the existing backend.

## Milestone 2: secure and reliable beta

- [ ] Replace the trusted `playerId` query parameter with a server-verified session token.
- [ ] Store mobile credentials in iOS Keychain and Android Keystore.
- [ ] Rename blockchain-era `gamePda`, `publicKey`, and address terminology to game/player terminology.
- [ ] Add runtime protocol validation and typed protocol-version errors.
- [ ] Handle foreground/background transitions, network loss, stale connections, and full-state recovery.
- [ ] Persist and restore the active game.
- [ ] Add native sharing, room-code entry, Universal Links, and Android App Links.
- [ ] Replace timer-driven combat code with an explicit animation queue driven by state transitions.
- [ ] Add structured client/server diagnostics without logging credentials or hidden game data.

## Milestone 3: store-ready release

- [ ] Add turn, opponent-joined, tie-choice, and game-finished push notifications.
- [ ] Add accessibility labels, dynamic text checks, haptics, and tablet layouts.
- [ ] Add unit, component, WebSocket recovery, and two-device end-to-end tests.
- [ ] Test on physical iOS and Android devices, including app suspension and network switching.
- [ ] Configure bundle/application IDs, signing, icons, launch screens, privacy metadata, and store listings.
- [ ] Upload iOS to TestFlight and Android to Play internal testing.

## Implementation order

1. Generate and stabilize the bare native workspace.
2. Make the shared protocol/client platform-neutral.
3. Implement the complete game flow with simple native visuals.
4. Port and polish Rive animations.
5. Secure identity and harden mobile lifecycle recovery.
6. Add invitations, push notifications, tests, and store delivery.

## Definition of the first playable build

Two users can install native builds, create or join the same room, submit hidden lineups, take turns, resolve ties, finish a game, lose and regain connectivity, and recover the authoritative state without loading any web UI.
