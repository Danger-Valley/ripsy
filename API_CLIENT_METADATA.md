# Native client API metadata

The native app attaches these headers to every HTTP request whose origin exactly
matches its configured RIPSY API, including sessions, shop, inventory, push and
update-policy checks:

| Header | Installed value |
| --- | --- |
| `X-Ripsy-App-Version` | Marketing version, for example `1.0.0` |
| `X-Ripsy-App-Build` | Android `versionCode` / iOS `CFBundleVersion` |
| `X-Ripsy-App-Platform` | `android` or `ios` |
| `X-Ripsy-App-Channel` | `android`, `ios` or `seeker`, using existing installer/hardware routing |

Values come from native installed-app constants, not a hardcoded JavaScript
version. The wrapper is installed before background push handling and app
mounting. It preserves request bodies, auth, abort signals and existing headers.
Missing/invalid native metadata is omitted rather than invented. Third-party
initial request targets, including account providers and figure resources, are
not decorated. Native WebSocket handshakes use the same scoped headers without
changing gameplay messages.

Backend `readAppRequestMetadata` validates and returns a typed value or `null`.
It accepts older apps and browsers without the headers. Server CORS allows the
four names; bounded `api.request` diagnostics contain only validated metadata
and a route family, never authorization, purchase payloads or arbitrary paths.
Handlers can use the metadata for additive compatibility decisions later.

These headers are advisory and spoofable. They must never grant wallet access,
ownership, Seeker eligibility or admin permissions, or replace protocol checks.
The mobile update gate remains a separate public policy and is not activated by
sending version headers. Web has no installed native build number and does not
pretend to have one.
