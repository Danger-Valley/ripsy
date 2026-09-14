# RIPSY Web Parity Handoff

Last updated: 2026-09-14
Baseline: `master` plus the lineup-deadline implementation documented below

## Purpose

This is the living implementation handoff for an agent finishing the RIPSY web client. It records shared backend behavior, the native React Native UX that web should match, animation details, known gaps, and the source files that define each behavior.

Update this file in the same commit whenever a backend, protocol, mobile gameplay, lineup, board, Rive animation, timer, invitation, recovery, or result-flow change affects web parity. Do not mark an item complete from memory: verify the current web implementation and its tests first.

`MOBILE_IMPLEMENTATION_PLAN.md` tracks native/store delivery. This document tracks gameplay parity and should be the first document read before changing `frontend/apps/web`.

## Non-negotiable architecture

- There is no MagicBlock, Solana, wallet, or smart-contract gameplay path.
- `frontend/packages/game-engine` is the single rules implementation. Online games invoke it through the Node.js backend; offline computer games invoke it directly on-device.
- Clients send commands; they do not decide whether moves are legal or calculate authoritative outcomes.
- Redis contains persistent game state, player game indexes, clock deadlines, and push installations.
- Redis compare-and-swap protects concurrent mutations.
- Redis Pub/Sub distributes state changes to WebSocket clients connected to any Railway replica.
- Sticky sessions are not required. Reconnecting clients request a complete fresh snapshot.
- Web runs on Vercel. The long-lived HTTP/WebSocket backend runs on Railway.
- Production HTTP and WebSocket endpoint: `https://api.ripsy.fun` / `wss://api.ripsy.fun`.
- The Railway `Dockerfile` must copy and install `@rps/game-engine` alongside `@rps/backend` and `@rps/core`; production backend imports resolve it as a local npm workspace.
- Mobile is bare React Native Community CLI with checked-in `ios/` and `android/` projects. Never introduce Expo.

## Canonical code map

| Concern | Source of truth |
| --- | --- |
| Constants, enums, wire types, runtime parsing | `frontend/packages/core/src/index.ts` |
| Shared authoritative game rules and player-specific views | `frontend/packages/game-engine/src/index.ts` |
| Reusable WebSocket client and reconnect behavior | `frontend/packages/game-client/src/ripsy-socket-client.ts` |
| Existing React web hook | `frontend/packages/game-client/src/use-ripsy-game.ts` |
| Native game hook | `frontend/apps/mobile/src/hooks/use-native-ripsy-game.ts` |
| Backend compatibility re-export for game rules | `backend/src/game-engine.ts` |
| Redis CAS, indexes, deadlines, Pub/Sub | `backend/src/redis-game-store.ts` |
| WebSocket authentication and command routing | `backend/src/game-websocket-server.ts` |
| Railway process, timeout scheduler, HTTP endpoints | `backend/src/server.ts` |
| Native game flow | `frontend/apps/mobile/src/screens/game-screen.tsx` |
| Native board rendering and hit testing | `frontend/apps/mobile/src/components/game-board.tsx` |
| Native Rive integration | `frontend/apps/mobile/src/components/rive-game-piece.tsx` |
| Rive asset contract | `frontend/apps/mobile/src/assets/figures/README.md` |
| State-transition animation detection | `frontend/apps/mobile/src/game-animation.ts` |
| Ordered animation playback | `frontend/apps/mobile/src/hooks/use-game-animation-queue.ts` |
| Native clocks | `frontend/apps/mobile/src/components/game-clocks.tsx` |
| Current web game implementation | `frontend/apps/web/app/game/[id]/page.tsx` |
| Current web Rive wrapper | `frontend/apps/web/app/game/[id]/RpsFigure.tsx` |

## Authoritative game contract

### Board and lineup

- Board size is 7 × 7 (`WIDTH = 7`, `HEIGHT = 7`).
- Each player submits exactly 14 pieces in their two starting rows:
  - 4 Rock
  - 4 Paper
  - 4 Scissors
  - 1 Flag
  - 1 Trap
- Player 0 uses server rows 5–6. Player 1 uses server rows 0–1.
- A player may save and replace a lineup any number of times until the game becomes `Phase.Active`.
- Each player has three minutes to save their first valid lineup. Player 0's deadline starts when the room is created; Player 1's independent deadline starts when they join.
- The first successful save clears that player's setup deadline permanently. They may continue shuffling and replacing the saved lineup until battle start without restarting or reactivating the timer.
- If either unsaved deadline expires, the server cancels the whole game as `Phase.Finished`, with `winner: null` and `finishReason: lineup_timeout`.
- The game becomes active only after both lineups are saved.
- Player 0 moves first.
- Lineups and opponent weapons are hidden by `gameView`; never infer or expose hidden pieces client-side.
- During lineup configuration, native interaction is intentionally shuffle-only. Tapping two pieces must not swap their weapons or positions.
- Saving remains explicit. The UI must distinguish unsaved, changed, saved, and ready states.

### Movement and battles

- A move is one orthogonal cell.
- Empty pieces and traps cannot move. Use shared `isMovablePiece`; do not duplicate this rule in a client.
- Moving onto a trap removes the attacker.
- Moving onto the opponent flag finishes the game and awards the attacker the win.
- Normal Rock/Paper/Scissors combat is resolved by the backend.
- A tied battle sets `tiePending` and requires both players to submit a new weapon choice.
- `tieFrom` and `tieTo` are recorded on every accepted move, including movement into an empty cell. Clients use them to animate the confirmed move.

### Game phases

The shared numeric phases are:

| Value | Phase |
| --- | --- |
| 0 | `Created` |
| 1 | `Joined` |
| 2 | `LineupP0Set` |
| 3 | `LineupP1Set` |
| 4 | `Active` |
| 5 | `Finished` |

Use the exported `Phase` constants. Do not hard-code numeric phases in new web code.

## Authentication, sockets, and recovery

- The backend issues an anonymous signed session through `POST /session`.
- Clients authenticate the WebSocket using `{ type: "authenticate", token, protocolVersion }`.
- Never put a trusted `playerId` in the WebSocket URL or accept it as authorization.
- Shared commands: `createGame`, `listGames`, `getGame`, `joinGame`, `submitLineup`, `movePiece`, `chooseWeapon`.
- Server messages are runtime-validated by `parseServerMessage`.
- A protocol mismatch is typed as `UNSUPPORTED_PROTOCOL_VERSION`.
- The reusable socket client has request timeouts, exponential reconnect backoff with jitter, pending-request rejection, and full-state recovery.
- Native suspends its socket in the background and reconnects/refetches when active.
- Cold-start recovery never opens a locally saved room ID blindly. Home first calls `listGames`, verifies that the matching game belongs to the player and has `phase < Finished`, and only then navigates to it. A missing or finished game clears the saved recovery ID; an unverifiable game stays closed while offline or on request failure.
- Web should converge on the reusable `RipsySocketClient` instead of maintaining a second, weaker WebSocket implementation in `use-ripsy-game.ts`.
- Safe diagnostics must not log credentials, player IDs, room IDs, request IDs, coordinates, lineups, or board state.

## Offline computer mode

- Native Home exposes `Play vs computer`; it remains available when the backend is disconnected.
- The computer game is created and mutated entirely in app memory. It does not create a session, room, Redis record, HTTP request, or WebSocket connection from the battle screen. Leaving Home for this screen suspends and disconnects Home's multiplayer socket.
- Both online and offline modes call the same `@rps/game-engine` rules, including lineup validation, hidden opponent views, combat, tie choices, flag wins, and cumulative ten-minute clocks.
- The computer starts with a valid randomized 4/4/4/1/1 lineup. The player can shuffle and save normally; saving starts the game immediately because the computer is already ready.
- Computer turns wait 550–1200 ms **after the native presentation queue becomes idle**. The battle screen reports its animation state back to the local controller, and the AI scheduler remains paused throughout the player's movement/combat animation. Never rely on a fixed delay being longer than every Rive sequence: combat duration varies by weapon.
- The AI scheduler depends on phase/turn/tie transitions and local action revision, not the whole clock-updated `GameState`. The 250 ms local clock publications must never cancel and restart the longer computer-action timer.
- The first AI is intentionally lightweight: enumerate legal moves, prefer contact, forward pressure and central files, then add bounded randomness. It does not inspect the hidden type of a player piece when scoring a destination.
- During tied combat, the computer independently chooses Rock, Paper, or Scissors. A completely blocked computer side loses through the existing clock-expiry rule instead of retrying forever.
- Current local sessions are memory-only and restart when the battle screen/app process is discarded. Persistence and difficulty levels are follow-up features.
- Web parity is optional for this mode, but a web implementation should reuse `@rps/game-engine` and preserve the no-network and no-hidden-information guarantees.

## Ten-minute chess clocks

Implemented on backend, mobile, and web in `c2f95a5`; legacy migration fixed in `74eada0`.

- Each player gets 10 cumulative minutes for the entire game.
- Both clocks are paused during room waiting and lineup configuration.
- The Player 0 clock starts when the second lineup activates the game.
- Before an accepted action, elapsed time is settled against the currently active player.
- After a move, that player’s clock stops and the opponent’s clock starts.
- An invalid action does not reset the deadline; the active clock continues running.
- At zero, the active player loses, `phase` becomes `Finished`, the other player becomes `winner`, and `finishReason` becomes `timeout`.
- During a tied battle the clock has already switched with the accepted move. The `isP1Turn` owner’s clock remains the running clock while tie choices resolve.
- Redis stores `clock0Ms`, `clock1Ms`, and `clockStartedAt` in the game record.
- A Redis sorted set stores absolute current-turn deadlines.
- Every Railway instance polls due deadlines every 500 ms. CAS ensures only one instance records the timeout; Pub/Sub broadcasts the result to all connected clients.
- Existing schema-v1 active games receive a fresh 10 minutes when first read and are atomically migrated to schema v2.
- Wire state exposes `clock0Ms`, `clock1Ms`, `clockRunning`, and `finishReason`. Fields are parser-compatible with an older backend during rolling deployment.
- Client displays tick locally every 250 ms from the last authoritative snapshot; clients never declare a timeout themselves.
- Display uses `Math.ceil(ms / 1000)`, tabular digits, and `M:SS` formatting.
- Running clock: turquoise emphasis. Last 60 seconds: red emphasis. Finished timeout copy must say why the user won or lost.

Known backend follow-up: scheduler-driven timeout currently reaches connected clients through WebSocket Pub/Sub, but it does not independently send an FCM push because push dispatch is currently tied to player commands.

## Three-minute lineup deadlines

- `LINEUP_SETUP_DURATION_MS` is shared from `@rps/core` and currently equals 180,000 ms.
- Redis game schema v3 persists `lineupDeadline0At` and `lineupDeadline1At` as absolute epoch milliseconds. Existing schema-v1/v2 records migrate on first read.
- Lineup and active-turn deadlines share the existing Redis sorted-set scheduler. Every Railway replica may poll it; CAS guarantees a single cancellation and Pub/Sub broadcasts the authoritative finished state.
- Wire state exposes only the viewing player's `lineupDeadlineAt`; clients do not need the opponent's private setup deadline.
- Native ticks the displayed setup countdown locally from the authoritative absolute deadline, but only the server can cancel an online game.
- During setup the ten-minute chess clocks are hidden. Unsaved lineup UI shows `SAVE IN M:SS`; the final minute uses danger styling. After first save it is replaced by the READY state.
- Web must implement the same setup countdown and canceled-game copy. It must not create a client-side cancellation or reset the deadline after Shuffle/Save changes.

## Native UX reference for web

### Home and active games

- Home shows the user’s active and unfinished games.
- Active games use a compact horizontal snap carousel. A card occupies roughly 84% of the available mobile content width (capped at 420 px), leaving the next card visible as a swipe affordance; the header shows the current page and total count.
- Each item includes an 80 px miniature board preview, room identifier, current status, and continuation action.
- Finished games are removed from the Redis player index and should not appear.
- Relevant native files: `home-screen.tsx`, `active-game-card.tsx`, and `use-native-ripsy-game.ts`.

### Create, join, and invitations

- Creating a game navigates directly into its battle screen.
- Entering a valid room ID or opening an invitation automatically attempts `joinGame` if a slot is open.
- Do not show a redundant board preview plus “Join this game” confirmation after the user already chose to join.
- While joining, show a compact progress gate. On success, go directly to lineup setup.
- Preserve explicit failure/unavailable states with Retry and Back actions.
- Battle title format is `Battle <8-character id>`. Do not show a separate ROOM label or LIVE badge.
- Invitations use the shareable game URL and deep-link into the same room.

### Waiting and lineup setup

- Show a dedicated “Waiting for opponent” card with an Invite opponent action.
- Explain that the lineup stays editable until battle start.
- Keep Shuffle and Save lineup grouped in one `YOUR LINEUP` panel.
- Shuffle creates a fresh exact 4/4/4/1/1 composition without intermediate text placeholders or flicker.
- Do not support tap-to-swap during lineup configuration.
- After Save, show a visible READY badge and copy explaining that the game can start automatically.
- If the user shuffles after saving, return to the dirty state and change the button to Save changes.
- Remove the old “Your pieces / Opponent pieces” summary cards from the waiting screen.
- Show 14 opponent placeholder figures in the top two rows even before their real lineup is visible, so the board reads as a confrontation.

### Board geometry and hit testing

- Board must remain square and fit the viewport; native formula is `min(viewport width - 32, 600)`.
- Player 1 sees both axes reversed so the player’s own formation remains at the bottom.
- Piece artwork intentionally overflows its cell and the board frame. The board uses visible overflow; never clip heads at the top border.
- The visual overflow must not expand the interactive hit area. Pointer events belong to the cell, while the Rive visual is non-interactive.
- Native visual reference:
  - board border: 2 px
  - visual wrapper: 0.88 × cell size
  - Rive size: 1.68 × cell size
  - regular vertical offset: `-0.43 × cell size`
  - opponent lineup-preview vertical offset: `-0.34 × cell size`
- There is no colored circular plate/ring behind either player’s pieces.
- Selection and legal-move highlighting belong to cells only.
- A trap is rendered as the trap character, without scissors or another weapon leaking through it.

### Orientation and hidden opponent state

- Own pieces use Rive `State Machine Back`.
- Opponent pieces always use `State Machine Front`, regardless of whether the local user is Player 0 or Player 1.
- Do not fix orientation with an Android-only or Player-1-only horizontal mirror. Choose the correct state machine.
- Opponent pieces do not reveal weapons until game rules reveal them.
- During lineup preview, opponent figures are placeholders with no weapon.

### Rive initialization and idle staggering

- Use the single shared `fig1.riv` file, but a separate Rive instance/state machine per piece.
- Native iOS on React Native 0.87 requires the checked-in `patches/@rive-app+react-native+0.4.20.patch`. It initializes the concrete Fabric props for `HybridRiveViewComponent`; without it, mounting the first game board throws an `RCTViewComponentView updateProps` assertion and crashes. This is native-runtime compatibility only and does not need a web port.
- Set numeric `Weapon` before playback so Shuffle never briefly renders `S`, `R`, `P`, or a stale weapon.
- Native Android first initializes playback while the view is hidden, then pauses/resets, writes `Weapon`/`WeaponVisible`, restarts playback, and reveals the view. Without this bootstrap, the native Rive runtime can leave every local figure in its default Scissors state.
- Both native platforms keep each Rive view hidden until its intended weapon/empty/trap state is configured and playing. This prevents iOS opponent placeholders from flashing the asset's default weapon before becoming correctly unarmed.
- Own pieces set `WeaponVisible` to 1 only for Rock/Paper/Scissors/Flag and to 0 for Empty/Trap.
- A trap is a separate Rive state, not a weapon enum value: set `Weapon` to `Piece.Empty` (`0`) and `WeaponVisible` to `0` before playback, reassert both values after playback starts, and only then trigger `Trap Idle`. Never pass `Piece.Trap` into the numeric `Weapon` input.
- Opponent preview instances mount with an independently generated 60–400 ms delay so 14 idle/blink animations do not synchronize.
- Respect reduced-motion preference by skipping the stagger delay.
- Do not use one shared randomized value or remount all pieces together, which resynchronizes the animation.
- The complete state/trigger inventory is maintained in `frontend/apps/mobile/src/assets/figures/README.md`.

### Confirmed move animation

- Never animate an optimistic move. Wait for an authoritative server state transition.
- Compare the previous and next full state and enqueue transitions. Do not replace a running transition when another WebSocket state arrives.
- Use `tieFrom` / `tieTo` first; board-diff inference is only a fallback.
- Keep the source cell's existing, fully configured Rive instance mounted. Do not create a temporary movement instance: remounting can expose a default or stale weapon while the new instance initializes.
- Render the checkerboard backgrounds/borders as a dedicated static layer below transparent interactive cells and Rive artwork. Raise the moving artwork, its transparent source cell, and its entire transparent source row above later rows while preserving visible overflow. Raising only the child is insufficient on native Android, while raising a row that still owns opaque cell backgrounds clips the heads of figures overflowing from the row below. The cell remains the only hit target; its interactive bounds must not expand with the artwork.
- Calculate the translation after converting server coordinates into player-visible coordinates so the same motion works for both players and for local/opponent figures.
- Fire `Jump Left`, `Jump Right`, or `Jump Forward` on that mounted instance. Allow 200 ms for the Rive takeoff, then synchronize the container translation with the asset: 300 ms horizontal travel (500 ms total) or 500 ms vertical travel (700 ms total), using a shallow arc and subtle scale change. Reveal the new authoritative board at the destination and allow a 140 ms settle.
- Start native-driver timing on the next event-loop turn, after React has committed the moving Rive view. Guard every presentation stage with a duration-bounded watchdog and advance the queue even if the platform reports a canceled animation or loses its completion callback. A permanently busy presentation queue blocks the offline AI scheduler and can leave `Moving piece…` visible forever.
- If the next authoritative state has `tiePending`, do not run the positional movement yet. Wait for the weapon choices and play the resolved combat sequence instead of jumping into an occupied cell and snapping back.
- Haptic move feedback fires only when a confirmed turn advance or board-changing finish is observed.

### Resolved combat animation

- A Rock/Paper/Scissors battle starts from the authoritative collision state. For an immediate result, run the full sequence below. For `tiePending`, create a pending combat scene before showing the weapon picker.
- Read both original occupants from the previous board and the revealed weapons/winner from `attacker`, `defender`, and `outcome`. This supports both immediate battles and post-tie resolution without leaking hidden weapons early.
- Hide both stationary sprites and render two persistent overlay instances above the board. Arrange them horizontally around the midpoint and mirror them so they face each other, including a vertically initiated attack.
- Match the existing web choreography: fire `Attack Prepare` on both figures; wait 100 ms, move both into the shared fight position over the remaining 300 ms; then animate both to 2× scale.
- On a tie, use a 620 ms eased prepare/approach, freeze both fighters at 2× scale, switch the combat phase to `hold`, and only then open the weapon picker. Keep that exact scene mounted while either player is choosing; `playerChoice` updates must not clear it.
- When the server resolves the tie, resume the held scene at the attack phase with the newly revealed choices. Do not replay the approach or reset the board between the picker and the attack.
- At the attack phase, fire `Attack` only on the authoritative winner. Its numeric `Weapon` input selects the Rock throw, Paper win, or Scissors win timeline. Keep the attack visible for 383 ms (Rock), 500 ms (Paper), or 966 ms (Scissors), plus the web's 100 ms impact offset.
- After impact, fire `Death` only on the loser for 200 ms. Reveal the new authoritative board only after that beat, then fade the combat overlays during the 260 ms settle.
- Keep each Rive instance mounted through `Attack Prepare` → `Attack`/`Death`. Changing a trigger must not reset its state machine, or the battle timeline will restart instead of progressing.

### Haptics and accessibility

- Mobile uses light selection haptics, move haptics, warning feedback for tied battles, and success feedback for lineup save/game finish.
- Web does not need to emulate device vibration by default, but must preserve the corresponding visible state feedback.
- Every actionable cell needs an accessible label, selected/disabled state, and a useful hint.
- Respect reduced motion and avoid animation-only status communication.
- Layout must tolerate dynamic text and narrow mobile browsers.

## Web parity matrix

Legend: **Shared** means no duplicate client logic; **Done** means present in current web code; **Port/verify** means the web agent must implement or validate it against the native behavior and tests.

| Feature | Status | Web action |
| --- | --- | --- |
| Authoritative backend rules | Shared | Consume state/commands only; never recreate rules. |
| Offline computer opponent | Native done, web optional | Reuse `@rps/game-engine` locally; do not route this mode through WebSocket or inspect hidden player piece types in AI scoring. |
| Redis multi-instance persistence and Pub/Sub | Shared | No web work. |
| Signed anonymous sessions | Done | Preserve `/session` token flow. |
| Runtime protocol parsing | Done | Keep `parseServerMessage` on every message. |
| Reusable robust socket client | Port/verify | Replace or align the legacy React hook with `RipsySocketClient` recovery semantics. |
| Safe last-game restoration | Port/verify | Verify saved game membership and unfinished phase through `listGames` before automatic navigation; never open stale local IDs. |
| Create/join/play commands | Done | Retest after socket-hook convergence. |
| Automatic join after room entry/deep link | Port/verify | Remove redundant join confirmation screen and board preview. |
| Active unfinished games on Home | Port/verify | Add native-style list with miniature boards using `listGames`. |
| Waiting opponent + Invite card | Port/verify | Match the compact native waiting hierarchy. |
| Editable lineup until both ready | Done, verify UX | Ensure repeated saves work before `Active`. |
| Shuffle-only lineup editing | Port/verify | Disable piece-to-piece swapping in setup. |
| Saved/dirty/READY lineup states | Port/verify | Mirror native labels and disabled saved button. |
| Opponent pregame formation | Done, verify | Keep placeholders front-facing and weaponless. |
| Board responsive bounds | Port/verify | Prevent overflow on narrow Android/mobile browser widths. |
| Piece art overflow without clipping | Port/verify | Let heads cross the frame without enlarging hit targets. |
| No background circles | Port/verify | Remove all opponent/own decorative rings. |
| Opponent always faces local player | Done, verify both sides | Use Front state machine; test Player 0 and Player 1. |
| Trap rendering and immobility | Shared + Port/verify visual | Use `isMovablePiece`; confirm no weapon leaks through trap art. |
| Independent opponent idle timing | Port/verify | Use per-instance 60–400 ms stagger and reduced-motion handling. |
| Explicit animation queue | Port/verify | Replace overlapping timer-driven web combat/movement effects with state-transition queue. |
| Stable confirmed-move motion | Port/verify | Fire the directional jump on the mounted, configured Rive figure and synchronize its container motion; never remount it, which can switch weapons. |
| Tied-combat hold before picker | Port/verify | Run `Attack Prepare`, approach and 2× scale first; hold the scene through both choices and resume it at `Attack` after resolution. |
| Full resolved combat scene | Done, migrate to queue | Preserve the existing web choreography and weapon attacks, but drive it from the authoritative transition queue using the sequence documented above. |
| Light move feedback | Visual equivalent | Provide visible acknowledgement; browser vibration is optional. |
| Two 10-minute clocks | Done | Keep server snapshots authoritative and verify narrow layouts/result state. |
| Timeout result copy | Done | Preserve `finishReason === "timeout"` messaging and final clocks. |
| Push notifications | Mobile only | No parity requirement unless web push is scoped later. |
| Android APK download page | Done | Stable page is `/download`; unrelated to gameplay parity. |

## Recommended web implementation order

1. Refactor the web connection layer to reuse `RipsySocketClient`; retain current UI until recovery tests pass.
2. Add focused web tests for create, automatic join, repeated lineup save, reconnect, and timeout state.
3. Simplify the join/waiting/lineup flow to match native behavior.
4. Port active-game cards and miniature board previews to Home.
5. Extract the 7 × 7 web board and Rive piece into smaller testable components.
6. Fix board sizing, visible artwork overflow, non-overlapping hit targets, facing, circles, and traps.
7. Replace timer-driven animation state in `page.tsx` with the explicit transition queue model.
8. Validate both player perspectives and tied battles in two browsers at narrow and desktop widths.
9. Remove legacy debug logging, numeric phase checks, duplicate rule calculations, and dead UI panels.
10. Run `npm run build` and the full test suite before marking parity complete.

## Web acceptance checklist

- [ ] Two browsers can create, auto-join, configure lineups, play, resolve ties, reconnect, and finish.
- [ ] Refresh during every phase restores the exact authoritative state.
- [ ] The same game works when players are connected to different Railway replicas.
- [ ] No opponent weapon or hidden piece leaks through protocol handling, DOM, labels, logs, or Rive inputs.
- [ ] Both players see their own side at the bottom and all opponent figures facing them.
- [ ] Piece heads can cross the frame without clipping; clicks outside a cell never select it.
- [ ] Shuffle never flashes letters, stale weapons, or all-scissors lineups.
- [ ] Traps look like traps and cannot be selected as movable pieces.
- [ ] Pregame opponent animations are visibly desynchronized.
- [ ] Every accepted move runs the directional Rive jump and visibly travels to its destination without remounting Rive or changing its weapon.
- [ ] Offline AI never publishes its move while the player's previous movement/combat transition is still being presented; its move appears as a separate queued animation before control visibly returns to the player.
- [ ] A tied collision reaches the enlarged combat hold before the weapon picker appears, and resolving it continues the same scene without replaying the approach.
- [ ] Lineup controls have clear dirty/saved/ready states and remain editable only before `Active`.
- [ ] Both 10-minute clocks switch on accepted moves and server timeout finishes the game.
- [ ] The board fits 320 px-wide mobile web and common desktop layouts without horizontal overflow.
- [ ] Keyboard, screen-reader, reduced-motion, and zoomed-text flows remain usable.
- [ ] Production Vercel build and all tests pass.

## Change ledger

This ledger summarizes the recent work that established the native reference. Consult `git show <commit>` for exact diffs.

### Backend, protocol, scaling, and delivery foundation

- `8304ac4` — bare React Native game foundation.
- `0abdd27` — signed player sessions across web and mobile.
- `c24d892` / `e08e6ce` / `1210997` — recovery hardening, Railway deployment, production API subdomain.
- `3ad2bd7` — runtime protocol validation and version errors.
- `6fc78da` — native state animation queue.
- `1a26e81` — privacy-safe structured diagnostics.
- `f01b8b0` — Redis-backed FCM notifications.
- `ee36ca2` — real two-client WebSocket integration coverage.
- `8c589f8` — repeated pregame lineup revisions supported by backend.
- `c2f95a5` / `74eada0` — multi-instance Redis chess clocks and safe legacy migration.
- `da242d7` — shared pure game-engine package plus fully local, hidden-information-safe native computer opponent.
- `183919b` — verify the saved game is still unfinished before cold-start restoration.

### Mobile room, lineup, board, and Rive UX

- `240da34` / `f89ee24` / `aca5d1e` — reset and initialize Rive weapon state without Shuffle flicker.
- `f32c97b` / `42afa9b` / `d9d77e0` / `dec636f` / `d5576f8` — larger, progressively raised piece layout.
- `da3a0f6` — active unfinished games with miniature boards on Home.
- `afb0265` / `e9f9941` — removed own and opponent background circles.
- `7cc5996` — grouped lineup controls and improved waiting/invite card; removed piece-count cards.
- `529cfec` — moved room ID into `Battle <id>` title and removed LIVE labeling.
- `f5bf038` / `f06f850` — opponent pregame formation and vertical alignment.
- `f209094` / `5084855` — per-instance delayed opponent playback to avoid synchronized blinking.
- `8fa42a0` / `362fdef` — trap artwork hides weapons and traps cannot move or be selected.
- `4596705` — lineup editing restricted to Shuffle rather than tap swapping.
- `22b5cdd` — saved/dirty/READY lineup feedback.
- `3f403ef` / `2144b8f` — artwork overflow separated from hit testing and board clipping.
- `d1955ca` — haptics for confirmed moves.
- `915c016` — automatic join before lineup setup.
- `5e82b3f` / `dcfaf08` — opponent-facing state machine on both platforms and Android board bounds.
- `dd4ae9e` / `09500a2` — initial authoritative positional movement and Rive jump-trigger approach (superseded on native by mounted-instance container motion).
- `c91e54b` — keep the moving source row/cell above opaque sibling rows so computer moves remain visible; local AI coverage now verifies a real board-coordinate change, not only a returned turn.
- `bcda6e5` — pause the local AI until the native presentation queue is idle, guaranteeing the computer move is shown as its own transition after the player's animation.

### Release tooling that web should preserve

- `4a3b32b` / `4ed3a94` — `npm run build:prod-seeker`, build-number bump, and local APK copies.
- `32cf97a` — publish versioned Seeker APK builds to the stable `ripsy.fun/download` flow.
- `f635d82` / `edde6e4` / `af31112` — Vercel monorepo install/build fixes and web-only patch behavior.

## Maintenance template

For each future parity-relevant change, update:

1. The relevant behavioral section above.
2. The web parity matrix status/action.
3. The acceptance checklist if a regression test is needed.
4. The change ledger with the final commit hash after committing (a follow-up documentation-only commit is acceptable).

Describe observable behavior and authoritative data flow, not just filenames or visual intent.
