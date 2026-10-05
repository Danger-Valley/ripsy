# RIPSY Toy Box sound pack · v1

Thirteen original procedural effects, created for RIPSY on 2026-10-04. No
recordings, samples, copied game sounds, third-party music or AI voice services.
The deterministic synthesizer is `scripts/create-game-sounds.mjs` at repo root.

| File | Duration | Trigger |
| --- | --- | --- |
| click.wav | 90 ms | Enabled shared button presses |
| select.wav | 130 ms | Board/Army selection and settings preview |
| shuffle.wav | 320 ms | Explicit Shuffle |
| ready.wav | 480 ms | Successful lineup save and explicit sound preview |
| jump.wav | 220 ms | Actual single Rive Jump trigger, not move command |
| land.wav | 130 ms | Authored movement completion, not destination initialization |
| rock.wav | 480 ms | Winning fighter's actual Rock Attack |
| paper.wav | 550 ms | Winning fighter's actual Paper Attack |
| scissors.wav | 970 ms | Winning fighter's actual Scissors Attack |
| trap.wav | 790 ms | Both Trap Activate / Fall In Trap reported once |
| tie.wav | 380 ms | Enlarged tie hold, including each repeated reveal |
| victory.wav | 1750 ms | New local victory after presentation is idle |
| defeat.wav | 900 ms | New local defeat after presentation is idle |

PCM WAV: mono, 22,050 Hz, signed 16-bit, peak at most 0.65, short click-free
attack/tail fades. Soft bell harmonics, pitched rubber-toy sweeps, seeded filtered
noise and an original four-note reward motif. No background music is added.

`sound-data.ts` is generated from these exact WAV bytes. It embeds the short pack
in Metro's JS bundle for offline preloading, including debug builds; native code
does not download URLs or depend on Xcode resource membership. The WAV files
remain available for listening/editing and future web reuse. Do not hand-edit the
generated base64. Replace the synthesis or WAVs and regenerate the data together.

Commands from mobile workspace: `npm run sounds:generate`, `npm run sounds:check`.
Both-platform release preflight also runs the sound check before a future upload.
The iOS preflight additionally runs `scripts/check-ios-audio-bridge.mjs`; run its
six regression cases with `node --test scripts/check-ios-audio-bridge.test.mjs`.
The PCM check validates all headers, sample format, native-byte equality, decoded size,
signal level, DC offset and zero endpoints. Demo: `files/sounds/ripsy-toy-box-demo.wav`.
Order: click, select, shuffle, ready, jump + land, rock, paper, scissors, trap, tie,
victory, defeat, separated by 300 ms of silence.

## Playback / settings

- `src/audio/sound-engine.ts`: one app-wide preloaded pool, bounded native
  polyphony (4 voices), softer UI mix, short duplicate-call throttle, no delayed
  playback of skipped cues. No sound/controller per Rive figure.
- `src/audio/sounds.ts`: native adapter and separate Keychain preference service
  `com.dangervalley.ripsy.sound-preferences`. Enabled/volume persist across launches;
  default enabled at 70%. Restore before any playback; unreadable preferences
  default to quiet with explicit retry. Serialize setting writes.
- `SoundSettings`: accessible on/off switch, 10–100% effects volume, explicit
  preview, current/unavailable/loading/error states. Available in Home Settings
  and Battle guide/settings. Haptics and OS push sounds remain independent.
- iOS: AVAudioPlayer, Ambient category (implicit mixing; no extra category
  options), respects Ring/Silent; interruptions/inactivity stop effects, never
  auto-resume them. Standalone module compiles through `PrivyWalletModule.m` via
  `Audio/RipsyAudioModule.inc`, only because the existing legacy project has no
  synchronized source folder. It has no wallet SDK dependency. Do not add the
  `.inc` as another Compile Sources entry or duplicate the class.
  Export `prepare` with a **plain `NSDictionary *`**, then validate dictionary
  values inside Objective-C. In RN 0.87.1, an exported
  `NSDictionary<NSString *, NSString *> *` is parsed as `NSStringDictionary`,
  but no such `RCTConvert` converter exists: native compilation and Jest mocks
  pass while runtime loading fails (TestFlight build 49). Do not restore that
  typed bridge signature; lightweight generics on internal properties are fine.
- Android: independent `RipsyAudioPackage`, SoundPool with USAGE_GAME, device
  media volume, no audio-focus stealing/background service or new permission.
  Temporary cache files are deleted after decoding or cancellation; playback is
  skipped in voice/call mode. Native host pause/destroy stops or releases voices.
- App lifecycle stops all effects on background, releases on unmount. Battle
  callbacks are stable and focus-scoped. Audio failure never blocks rules, AI,
  animation watchdogs, navigation or input. No change to Rive jump/combat timing.
- Already-finished snapshots, spectators, lineup cancellation, hidden/background
  results and ordinary clock/state updates never trigger a fanfare. A result
  interrupted/suppressed by focus/app state is consumed, not replayed on return.
- No permissions, new npm dependencies, CocoaPods changes, Expo or backend changes.
  A new **native build** is necessary; a Metro refresh cannot add the audio bridge.

Physical iPhone/Seeker speaker/Bluetooth, hardware silent-mode, interruption and
perceived loudness/latency checks remain required; compilation and mocked tests
alone do not prove those. Web integration is not included: reuse this pack and
observable event contract, unlock browser audio from a real user gesture, and
persist browser preferences separately.
