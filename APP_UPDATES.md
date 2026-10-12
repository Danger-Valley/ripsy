# Mandatory mobile updates

The native app checks the public `GET /mobile/update-policy` endpoint before mounting navigation, then on foreground and once a minute during an active session. A required update replaces the whole app with a Toy Box screen. There is no Skip, Close, Back, notification or invite bypass. Returning from a store checks again; merely tapping Update does not unlock the app.

This feature requires a new native release first. Previously installed builds without the gate cannot be remotely forced to update by this endpoint.

The default title is now **You have to update the app**. On the Seeker update
channel the primary button is **Open dApp Store** and opens the exact
`solanadappstore://details?id=com.dangervalley.ripsy` URI. A configured HTTPS
destination is retained as fallback if the native store cannot open. Other
channels retain their configured store destination. This changes presentation
and routing, not the activation policy: minimum builds remain disabled until a
reachable, installable store release has been verified.

## Railway configuration

Set **MOBILE_UPDATE_POLICY** on the backend service in Railway. It is one JSON value, not a mobile build variable and not a Vercel setting. Restart/redeploy the backend to apply a change. No app rebuild is required for subsequent policy changes.

If the variable is absent or empty, all channels are disabled. An invalid configured value rejects backend startup with a non-sensitive configuration error. The endpoint contains no secrets and does not require login, a wallet or a game session. Responses are `no-store`.

Start with this disabled policy:

```json
{
  "schema": 1,
  "ios": { "minimumBuild": 0, "storeUrl": null },
  "android": { "minimumBuild": 0, "storeUrl": null },
  "seeker": { "minimumBuild": 0, "storeUrl": null }
}
```

Each channel accepts:

| Field | Meaning |
| --- | --- |
| `minimumBuild` | Inclusive minimum native build number. `0` disables the gate. Builds below the minimum must update; equal/newer builds can play. |
| `storeUrl` | Required when enabled. Credential-free HTTPS destination, or the exact Seeker URI below. |
| `fallbackUrl` | Optional HTTPS fallback if the native store link cannot open. |
| `latestVersion` | Optional display-only string, e.g. `1.0.1`. Never used for comparison. |
| `title`, `message` | Optional screen copy, defaults provided. Max 100 / 400 characters. |

Do not use the marketing version as `minimumBuild`. iOS uses `CFBundleVersion`; Android uses `versionCode`. The installed value is displayed on the update screen. We currently release integer build numbers, often with the same marketing version across many builds.

## Channels and destinations

- **ios**: all iOS copies, including TestFlight. During beta, the known invite URL is `https://testflight.apple.com/join/VU1k1zfy`. After public release, configure the actual published App Store URL instead. There is intentionally no fabricated live listing URL in code.
- **android**: ordinary Android and copies installed via `com.android.vending`, including Play-installed copies on Seeker. Configure the real published Google Play listing. For APK beta distribution the existing HTTPS download page is `https://www.ripsy.fun/download`.
- **seeker**: Seeker hardware, except a positively identified Play-installed copy. Supports `solanadappstore://details?id=com.dangervalley.ripsy` and an optional HTTPS fallback. Verify the actual listing and URI on a physical Seeker before activation. Sideloaded Seeker copies also use this channel. Installer metadata can be absent, so it is routing, not security attestation. Other Solana Mobile models are not inferred to be Seeker automatically.

Links must be destinations users can actually install from. The server validates URL syntax, not store availability, tester eligibility, OS support or rollout completion. A syntactically valid but unavailable listing can lock users out. Keep independent channel minimums to avoid forcing iOS users toward an Android-only release.

Example of enabling **only iOS beta** after build **57** is confirmed available to all affected testers (57 is illustrative, not a release assertion):

```json
{
  "schema": 1,
  "ios": {
    "minimumBuild": 57,
    "latestVersion": "1.0.0",
    "storeUrl": "https://testflight.apple.com/join/VU1k1zfy",
    "title": "A new adventure awaits!",
    "message": "Update RIPSY to keep playing with the latest improvements."
  },
  "android": { "minimumBuild": 0 },
  "seeker": { "minimumBuild": 0 }
}
```

## Safe activation and rollback

1. Ship a gate-capable native build, leaving all minimums at 0.
2. Publish the successor to each intended store and confirm it can actually be installed by every affected user. Do not raise a minimum during review or a partial/staged rollout.
3. Set the corresponding minimums/links in Railway and restart the backend. Verify `GET https://api.ripsy.fun/mobile/update-policy` and older/current builds on real devices.
4. To roll back, lower the affected minimum or set it to 0 and restart. Users unlock after a successful check, including Check again / foreground refresh. Offline users with a known required minimum need a connection to receive a rollback.

The last validated policy is cached in device-only Keychain, scoped to the backend origin. Known mandatory updates remain mandatory offline and across restarts when device storage is available. A storage failure does not lift the current session's gate, but may prevent persistence across restarts. Installing a sufficient build clears the local gate even offline. Fresh installations with no cached policy fail open after a bounded check (network 4 seconds, storage wait at most 0.8 seconds); an outage should not prevent offline computer games. Invalid responses never clear a previously known gate. This is a cooperative client UX gate, not a security or protocol enforcement boundary for obsolete/tampered clients.

## Verification before production activation

Test an older, equal and newer native build for every channel. Check hardware Back, push/invite opens while blocked, return from the store without installing, real installation, cold launch offline with/without cached policy, foreground changes, bad responses, URL failures/fallback, rollback, short screens and large text. Do not enable production minimums solely because automated tests pass.

Web remains accessible and ignores the mobile gate. No game rules, WebSocket protocol, authentication, payment, pack probabilities or ownership checks are changed.
