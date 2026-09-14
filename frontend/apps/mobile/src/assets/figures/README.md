# `fig1.riv` runtime contract

The file contains one `Artboard` with two state machines:

- `State Machine Back` — local pieces facing away from the player.
- `State Machine Front` — opponent pieces facing the player.

## Timeline animations

`Flagstoke`, `No Weapon`, `Scissors`, `Stone`, `Paper`, `Clipping`, `Idle Back Weapon Revealed`, `Idle Back`, `Idle`, `Jump Forward`, `Jump Right`, `Jump Left`, `Attack Prepare Back`, `Attack Prepare`, `Attack Scissors Front`, `Attack Scissors Back`, `Attack Paper Back`, `Attack Paper Front`, `Attack Stone Back`, `Attack Stone Front`, `Trap Front`, `Trap Back`, `Trap Back Idle`, `Fall In Trap Back`, `Fall In Trap Front`, and `Death`.

## State machine inputs

Both machines expose the numeric `Weapon` input and these triggers: `Jump Forward`, `Jump Right`, `Jump Left`, `Attack Prepare`, `Attack`, `Trap Activate`, `Fall In Trap`, and `Death`.

`State Machine Back` additionally exposes numeric `WeaponVisible` and the `Trap Idle` trigger. `WeaponVisible` is a number (`0` or `1`), not a boolean.

A trap is not a `Weapon` value in the Rive state machine. Before starting trap idle, set `Weapon` to `Piece.Empty` (`0`) and `WeaponVisible` to `0`, start playback, reassert both values, and then fire `Trap Idle`. Passing `Piece.Trap` into `Weapon` can leave a stale weapon layer visible inside the trap artwork.

Every native Rive view stays hidden until its `Weapon`/`WeaponVisible` inputs and required idle state are applied and playback is ready. This prevents iOS opponent placeholders from briefly exposing the asset's default weapon. Android additionally needs a hidden playback bootstrap before pause/reset because a state machine created with `autoPlay={false}` may otherwise ignore `Weapon` and leave every figure in the default Scissors state.

React Native 0.87's Fabric runtime requires custom `RCTViewComponentView` subclasses to install their concrete default props before `updateProps`. Keep `patches/@rive-app+react-native+0.4.20.patch` active through the root `postinstall`; otherwise iOS crashes as soon as the board mounts its first `HybridRiveViewComponent`.

Regular confirmed movement must not create a temporary Rive instance. Keep the already configured figure mounted, fire `Jump Left`, `Jump Right`, or `Jump Forward` on that same instance, and animate its container in sync with the complete Rive timeline. The Rive component reports when `triggerInput` has actually fired; only that callback may start container travel. Deduplicate the same active trigger so React effect reruns cannot restart a jump. Do not call `playIfNeeded()` after `triggerInput()`: the iOS bridge already resumes playback inside `triggerInput`, and a second JS call can queue another native `play()` before `isPlaying` updates, restarting the jump. Reusing the mounted instance preserves `Weapon` and `WeaponVisible` for both local and opponent pieces, avoiding weapon changes during a move. Local-piece container travel lasts for the full authored animation: `Jump Left`/`Jump Right` are 38 frames at 60 FPS (633 ms), while `Jump Forward` is 45 frames (750 ms). Opponent container travel starts 100 ms after its Rive jump fires and lasts 100 ms less (533 ms horizontal or 650 ms forward), so it still lands with the authored animation. Durations never change with board distance. At landing, keep the translated source instance visible, mount the authoritative destination Rive invisibly underneath it, and swap only after that destination reports that its state machine is configured. Run `npm run rive:timings` from the repository root after replacing the asset to inspect every authored timeline. Resolved combat continues to use the Rive `Attack Prepare`, `Attack`, and `Death` triggers.

Resolved Rock/Paper/Scissors combat must reuse the same mounted Rive instances for the full trigger sequence: both fighters receive `Attack Prepare`, then only the authoritative winner receives `Attack`, and finally the loser receives `Death`. For a tie, complete the approach, hold both figures at 2× scale, and show the weapon picker only after that hold begins. Keep the scene mounted while choices arrive and resume it directly at `Attack` when the server resolves the tie. Do not reset or remount an instance when changing `actionTrigger`; resetting between phases interrupts the Rive timeline. The `Weapon` input selects the winner's Rock, Paper, or Scissors attack animation.
