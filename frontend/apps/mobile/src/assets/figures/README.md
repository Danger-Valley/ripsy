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

Mobile movement fires the appropriate jump trigger on the moving Rive instance. Horizontal direction is calculated after converting server coordinates to player-visible board coordinates; vertical movement uses `Jump Forward` because the asset has no backward jump.

Resolved Rock/Paper/Scissors combat must reuse the same mounted Rive instances for the full trigger sequence: both fighters receive `Attack Prepare`, then only the authoritative winner receives `Attack`, and finally the loser receives `Death`. Do not reset or remount an instance when changing `actionTrigger`; resetting between phases interrupts the Rive timeline. The `Weapon` input selects the winner's Rock, Paper, or Scissors attack animation.
