# Alien, Robot and Skull - 2026-10-21

## Registration

Three backend-only general fighters, each priced at **450 SKR**. Exact payment: classic SKR mint `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`, six decimals, `450000000` base units. No Seeker-only restriction, new payment mechanism, native imports, dependency update or native release.

| ID / name | Variant | Rive bytes | SHA-256 |
| --- | --- | --- | --- |
| alien / Alien | 6 | 375940 | `8931145bd2867571f23266f6d6297b982bd4d78ac6632424b0c0a4754c325137` |
| robot / Robot | 7 | 376238 | `15ddc0bed53355eb0e81c3e463abd24118d5b2b346d660ceb4960890deb0e015` |
| skull / Skull | 8 | 382182 | `e6870dd08e41c4c7ee98baa89d5b6b6396728a7f9bff5586f36b8635163a8ae4` |

Sources are the user-provided `files/rps_alien.riv`, `files/rps_robot.riv`, `files/rps_skull.riv` in the parent project folder. Canonical resources live in `frontend/apps/web/public/figures`: `<id>.riv`, `<id>.png`, `<id>.json`. Previews were rendered in a real browser from the initial Idle / No Weapon pose. No alternate generated artwork or animation edits.

The full contract matches fig1: one 1000x1000 artboard, 26 timeline names/durations/FPS, Front/Back machines and all typed inputs. Existing dynamic-capable phones, including build 67, use the existing manifest, verified disk cache, inventory and generic board variants. Older v1/v2/v3 catalogs stay capped; only v4 sees new products. Existing product prices and saved orders are not rewritten. Pack price/chances and `PACK_ENABLED=false` are unchanged; these figures are not added to current pack odds.

## Verification

- Eight-model asset/contract checker passes; old bundled bytes/previews are unchanged.
- 217 backend tests, 677 mobile tests (51 suites), 31 web tests, all app TypeScript checks and production web build pass.
- Each new figure is covered by actual transaction construction against mocked RPC: exact checked SKR transfer, canonical Core name/URI, buyer owner/payer, required signatures, one/three-figure atomic messages within the packet limit, correct totals, insufficient balance, currency/decimal/owner validation and client-price tampering. No real purchase or mainnet payment was sent.
- Server registration automatically includes the products in admin pricing. No Redis price save, old receipt edit, pack settings save, custom contract call or authority change was performed.
- Export helper now selects registry IDs and reads canonical web Rives. New remote-only figures do not gain bundled mobile files; existing bundled models still export matching web/mobile PNGs.
- Physical-device purchase/equip/restart/offline/combat verification remains a user test, not implied by these checks.

## Production rollout: assets ready, backend blocked

Vercel deployment `dpl_9e7eihMSNqsV6j81i8Ca3wpVYM6d` is READY at `https://ripsy-g0vh4v4q4-danger-valley.vercel.app`, aliased to `https://www.ripsy.fun`. All nine live Rive/PNG/JSON responses match local SHA-256 values; Rive CORS is `*`. Actual uploader validation verified 181 source files / 66,129,311 bytes with backend/native/secrets excluded. This web release also contains the prior unavailable-pack-card hiding change.

The allowlisted backend stage contained 94 files / 2,408,179 bytes and no secrets. Railway rejected `up` before creating a deployment: `UPLOAD_FAILED`, `Deploys have been paused temporarily`. The official status page, `https://status.railway.com/`, reports a global dashboard/API outage and builds paused in every region on 2026-10-21. Do not bypass or change project settings to work around a platform pause.

At verification, the active backend remained deployment `3b231db9-145b-4bca-b728-eca50f26eda3`, source `76da461`. Live v4 catalog still has fig2/BONK/Jup/ORE at 1 SKR / 6900 BONK / 1 JUP / 0.01 ORE. New figures are **not yet live products**. Live paused-pack/health/auth/legacy-compatibility checks pass, pack price remains 10 SKR and paid recovery is intact.

### Resume after Railway restores builds

1. Regenerate the allowlisted stage with `node scripts/stage-backend-deploy.mjs`; do not rely on a temporary directory surviving a restart.
2. Deploy that returned stage using Railway `up <stage> --path-as-root --detach --json`, project `ad9b7d5e-af13-4426-926b-e6c02d35e99f`, service `60da7716-25a2-43ce-8a81-97f6e772f920`, production environment `8d25e978-ef5a-4f5c-b2fe-a90656efc8ac`. Keep existing environment values, especially `PACK_ENABLED=false`.
3. Wait for SUCCESS. A Git push or queued build is not activation evidence.
4. Verify `/shop/figures` has eight entries and `/shop/catalog?catalogVersion=4` has seven purchasable entries. Assert `alien`/`robot`/`skull` are variants 6/7/8, available, unrestricted and exactly 450 SKR each; old live prices stay unchanged. Fetch each public resource and verify length/hash against the manifest.
5. Run `node scripts/check-shop-admin-api.mjs --backend` and `node scripts/check-pack-api.mjs --backend --buyer-funded --price=10000000` without `--enabled`. These do not sign or submit a payment. Record successful deployment/live verification before calling rollout complete.
