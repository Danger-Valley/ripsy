# DigitalOcean production backend

Production moved from Railway on 2026-11-06. Web hosting remains on Vercel;
commerce data/files remain in the existing Firebase project.

## Resources

- App `ripsy-backend`: `51d4e0fb-cca1-4135-b186-771db4c64223`.
- Component `ripsy`: GitHub `Danger-Valley/ripsy`, `master`, root Dockerfile,
  autodeploy enabled. Keep the repository root as the build context.
- Backend: one shared vCPU / 1 GiB container, $12/month, port 8080.
- Valkey 9: `ripsy-valkey-production`, `550236de-2b5a-4999-b7eb-9c8a8af02ac4`,
  one vCPU / 1 GiB, $15/month. Base total $27/month before tax/extra bandwidth.
- Both resources use AMS3 and `default-ams3` VPC. Valkey uses `noeviction`;
  trusted sources allow only this app. `REDIS_URL` uses the private `rediss://`
  hostname with certificate verification. Do not expose Railway Redis.
- Single nodes are not HA. Managed Valkey has no backup/restore support;
  persistence is not an independent backup.

## Endpoints and configuration

HTTP `https://api.ripsy.fun`; WebSocket `wss://api.ripsy.fun`. The starter domain
is `ripsy-backend-e8zyr.ondigitalocean.app`. Cloudflare retains authoritative
DNS: only the DNS-only `api` CNAME changed from `hqtzrmtq.up.railway.app` to
the starter domain. Keep external domain management; do not move nameservers.

HTTP readiness checks `/health` on port 8080 every 10 seconds, timeout 5 seconds,
failure threshold 9, success threshold 1. Health retains real HTTP 503 when
Redis or Firebase is unavailable. The existing Dockerfile CMD starts the server.

Existing credentials were copied unchanged as encrypted `RUN_TIME` variables:
session secret, Firebase/FCM, commerce, RPC/Jupiter and mint authority. Preserve
`RIPSY_REDIS_PREFIX=ripsy:production`, all TTLs, origins and shop settings.
`COMMERCE_STORAGE=firebase` and `COMMERCE_MAINTENANCE=false` remain active.
Keep the separate FCM and commerce service-account identities/permissions.
Never commit exported app-spec credentials or encrypted secret values, put them
in build arguments, or replace the existing session secret with a new value.
The actual app spec is maintained in DigitalOcean.

## Shop JSON errors through App Platform

Live testing found that App Platform replaces application HTTP 503 with an HTML
HTTP 504, losing customer messages and saved-purchase recovery details.
Set `APP_PLATFORM_JSON_ERRORS=true` in the DigitalOcean backend runtime.
Only the shop error boundary then sends status 503 as HTTP 409, with
`x-ripsy-error-status: 503`, preserving the existing JSON error/recovery body.
Other statuses, successful requests, business rules, payments and game protocol
are unaffected. The default is false on other hosts. `/health` is outside this
adaptation so readiness still fails correctly on unavailable dependencies.

Shared native/web ShopClient already handles error bodies independently of
status 503; 401 remains the separate authentication-recovery signal. Do not
clear receipts, replace idempotency keys, sign a new payment or reroll a paid
pack in response to temporary 409 errors. No native release is required.

## Data transfer and verification

Source Redis was 8.2.9, approximately 1.62 MiB memory. All 32 namespace keys
were transferred: 28 strings and four push registration sets; no active games
existed at cutover. Legacy Redis commerce records remain historical, not a
writable fallback to current Firebase commerce.

An atomic read-only logical snapshot avoided RDB format assumptions. Format 2
uses base64 keys/values and absolute expiry timestamps. The 77,439-byte snapshot
SHA-256 was `757169b82dbd9431e3cc1251a22fd74d670f8c362f8f0650590e441da8b5d1b0`.
Transport used authenticated consoles without opening a public source port.
Import required an empty namespace and used an atomic transaction. Target
read-back verified every value, set membership and absolute expiry; records
SHA-256 `f22887f9d559c4674d04f62af67e31cc7611adab04f69daef968d5a9d1492824`.
The source matched the exported records both before and after pausing its
backend process. DNS changed only after this final frozen-source verification.

Before cutover, health, figure manifest, catalog versions 1/2/3/4 and mobile
update policy were byte-identical; a Railway-issued session renewed on the new
backend with the same identity. After cutover, HTTPS and the two-client
WebSocket create/join/lineup/moves/combat/reconnect test passed, without idle
broadcast loops. The diagnostic game expires under the normal TTL. Live admin
authorization, CORS and current prices passed. These tests did not sign/send
payments, mint figures or prove physical push delivery; `push=configured` is
configuration evidence only.

After deployment, run:

```sh
node scripts/check-shop-admin-api.mjs --backend
node scripts/check-pack-api.mjs --backend --buyer-funded --app-platform-json-errors
```

For an intentional disposable two-client game test:

```sh
node --import tsx scripts/check-online-state-stream.mjs --live
```

## Railway retention and rollback

The old backend source is disconnected from GitHub and its deployment was
stopped after successful cutover. Railway Redis and its volume remain private
and intact. Their Railway billing is separate until explicitly retired.

The old Redis is stale after DigitalOcean accepts writes. Do not restart the old
backend against it or simply revert DNS. Prefer rolling back application code
in DigitalOcean against the same active Valkey. A provider rollback requires
a fresh verified transfer of current data under a write freeze, or a secured
connection to the active database. Keep Firebase authoritative for commerce.

References: [App specs](https://docs.digitalocean.com/products/app-platform/reference/app-spec/),
[Valkey limits](https://docs.digitalocean.com/products/databases/valkey/details/limits/),
[TLS connections](https://docs.digitalocean.com/products/databases/valkey/how-to/connect/).
