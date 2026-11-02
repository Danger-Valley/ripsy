# Adding server-delivered fighters

## Startup synchronization — 2026-11-02

Native startup and a genuine return to foreground check the public manifest
without sign-in. Validated names/descriptions/IDs become available immediately;
Rive and PNG data warm in the background without blocking Home or opening Shop.
Two workers skip byte-identical bundled resources and ask the private native
cache for everything else. Existing disk files are checked before any download;
SHA-256 and exact length must match on both cached and newly downloaded data.
No live Rive controllers are constructed just for preloading.

The schema-1 manifest adds optional `portrait: { url, sha256, bytes }` alongside
the existing `imageUrl` and animation descriptor. Its URL must equal `imageUrl`.
PNG URLs are independently versioned by the PNG digest, so an image-only change
does not require a new Rive. The backend registry now records PNG digests/sizes
for all eight current figures, and `npm run figures:check` verifies them.
PNG files are limited to 4 MiB and 2048 × 2048; Rives to 8 MiB. Both share a
96-MiB private LRU cache, excluded from iOS backup. One preload pass selects at
most 64 MiB, leaving room for on-demand battle/Army resources. Excess resources
are still available on demand; this is not an unlimited permanent asset archive.

The last validated manifest restores before the network request. Offline and
malformed responses never erase it or remap permanent identities. Manifest
failures get only two automatic retries (3 s and 9 s); later foreground entry
can retry again. Queued downloads stop when inactive/backgrounded; already
running bounded native requests may finish. One broken resource does not block
the rest. A stale PNG completion cannot replace a newer version, and a failed
disk revalidation drops the stale local path. Missing resources keep the
existing loading/retry behavior rather than substituting a different fighter.
While a private PNG is not ready, static previews retain their existing HTTPS
image fallback; that platform-loaded fallback is not claimed as SHA-verified.
Only successfully checked private-cache files are selected as local image paths.
Unchanged refreshes and PNG/name changes preserve existing animation descriptors
and controllers. Only canonical HTTPS descriptors, not local file paths, are
persisted with the manifest.

Rolling rollout: old servers without `portrait` remain compatible and use the
platform's best-effort image prefetch rather than verified private PNG storage.
Existing build 72 already supports unknown figures on demand; these new startup
and PNG-cache improvements require **one** new native release plus the backend
manifest update. Neither has been deployed/uploaded by this implementation task.
After that, compatible fighters require only public resources and a backend
registry deployment, not another mobile build. Rive files must package the assets
required by contract 1; arbitrary downloaded code/new gameplay is not supported.
Core metadata stays published for mint/inventory recognition; its name/description
and portrait are delivered to the UI through the manifest, not downloaded as code.

Verification: 818 mobile / 230 backend / 32 web tests, all three TypeScript
checks, focused ESLint and all eight PNG/Rive asset contracts pass. Android
Release Kotlin compilation and the actual iOS bridge arm64 object compilation
pass. A local Foundation harness exercises the actual iOS cache's PNG/hash/size/
dimension/unsafe-input guards without network calls. Both production Metro
bundles pass. No new signed app/archive, device visual/download/offline pass,
purchase, on-chain action, production deployment or dependency upgrade is implied.
No Android device is connected; configured AVDs have no installed `system.img`.

## Alien, Robot and Skull - 2026-10-21

Registered `alien` / Alien / variant 6, `robot` / Robot / variant 7 and `skull` / Skull / variant 8 at **450 SKR each** (`450000000` base units, six decimals). All three are unrestricted general figures, not Seeker exclusives. Source assets are the user-provided `rps_alien.riv`, `rps_robot.riv` and `rps_skull.riv`. Canonical resources are published under `/figures/<id>.riv`, `.png` and `.json`; preview PNGs are exported from real Idle / No Weapon frames, not generated lookalikes.

The complete authored contract matches the starter: 1000x1000 artboard, 26 timelines, Front/Back machines and identical input types/timings. No native imports, bundled assets, shared-bootstrap IDs, animation controllers or gameplay rules were added/changed. Dynamic-capable installed clients (including build 67) load these models through the existing validated cache. Admin figure pricing automatically includes all three, while old catalog versions retain their original model limits. Existing figure prices and saved receipts remain unchanged.

Packs remain globally paused and their existing 10-SKR / Jup 40%, BONK 40%, ORE 20% table is unchanged. The three figures are eligible for a future admin-configured table, not automatically added to current odds. The custom contract is retired; preserve its source and never republish an onchain edition for this backend flow.

The earlier Railway deployment pause is historical, not the current registration state. A read-only production manifest check on 2026-11-02 returns all eight registered IDs, including Alien/Robot/Skull. The current server has no `portrait` descriptors yet; that new manifest enhancement remains undeployed. Historical publication evidence: `files/releases/figures-alien-robot-skull-2026-10-21.md`.

The mobile and web clients now accept server-issued figure IDs and visual variants. The authoritative registry is `backend/src/figure-registry.json`. The shared `FIGURES` constant is only an offline/legacy bootstrap, not the registration allowlist.

Build 56 cannot acquire the dynamic loader through configuration alone; later releases including build 72 already contain it. See the startup enhancement rollout above for the one-time release needed for its new PNG-cache bridge.

## Data flow

- Public `GET /shop/figures`: ID, permanent numeric variant, name, description, purchase/platform flags, preview URL, Rive URL, exact byte length, SHA-256 and animation contract version.
- Public `GET /shop/catalog?catalogVersion=4`: purchasable figures, server-selected prices and availability.
- Authenticated inventory includes the canonical visual variant for each owned Core asset. A specific asset can occupy one slot only; ownership remains checked by the backend.
- Pack price/drop weights/results come from backend settings and each order's captured table, not from a client list. Packs are currently paused; the saved settings remain 10 SKR and Jup/BONK/ORE 40/40/20. Historical onchain editions and retired contract source are preserved only as evidence. See `PACK_SHOP_SETUP.md`.
- Native caches the validated manifest across launches. Startup/foreground preloads missing Rives and verified PNGs into private storage, checking exact size and SHA-256 before use. Requests are deduplicated, retries/budget/concurrency are bounded, and the board retains manual retry. The shared Rive/PNG cache is bounded to 96 MiB; image-only updates retain the Rive controller.
- The board loads each required remote model once and keeps its loaded file alive across moves/attacks/traps. Foreground refreshes do not reset unchanged definitions/controllers. A newly encountered opponent variant forces a catalog refresh.
- Offline computer lineups preserve generic variant IDs. Saving an army pre-downloads its remote models. If a resource is unavailable, do not silently substitute a different collectible.

## Register a new fighter

1. Choose a new permanent slug (lowercase letters, digits, underscores or hyphens; starts with a letter, max 64 characters) and an unused integer variant 6..255. Never reuse or remap published IDs/variants. Variant 1 is always the free RIPSY 001. Keep historical registrations/assets available.
2. Prepare a compatible Rive, preview PNG and canonical Core metadata. Publish them at `https://www.ripsy.fun/figures/<id>.riv`, `<id>.png` and `<id>.json`. Metadata must have the canonical name, preview URL and Figure trait. The metadata URI and collection remain part of official inventory recognition.
3. Add one entry to the backend registry with name, description, variant, purchase/platform flags, Rive hash/size, PNG `portrait` hash/size and price. Compute each digest from its actual canonical file. Do not add imports, requires or switch cases to mobile code.
4. For token pricing, set `tokenPayment` with the verified mint, symbol, decimals and exact positive base-unit amount as a string. For a SOL-priced figure use `priceLamports` as an exact positive integer string. Existing fig2's environment price override remains supported.
5. Run `npm run figures:check`, backend/mobile/web tests and TypeScript. The figure checker reads the registry, validates web bytes/hash and the authored Rive contract; native asset equality is checked only for models already bundled.
6. Deploy the public resources before the backend registration. Run the Vercel upload checker to ensure all registered assets are included and backend/native/secrets are excluded. Deploy the backend through its existing allowlisted staging workflow. A Git push alone is not evidence of a successful deployment.
7. Check the live manifest and version-4 catalog, then use an updated physical phone to browse, acquire, equip, restart offline and encounter the model in a real game. Verify jump/combat/trap/facing and unchanged neighboring instances.
8. To include it in future backend packs, separately edit price/chances/availability in the existing admin settings. Registration alone never changes saved weights or purchased receipts. Do not re-enable the global pack flag without a new user request; the retired contract must not be called.

Example registry entry (replace the placeholder digest, size, token address and precision with independently verified values):

```json
{
  "id": "new-fighter",
  "name": "New fighter",
  "variant": 9,
  "description": "A new rival joins the playground.",
  "purchasable": true,
  "seekerExclusive": false,
  "tokenPayment": {
    "mint": "<verified-token-mint>",
    "symbol": "TOKEN",
    "decimals": 6,
    "amount": "1000000"
  },
  "animation": {
    "sha256": "<64-lowercase-hex-characters>",
    "bytes": 400000
  },
  "portrait": {
    "sha256": "<sha256-of-the-png-file>",
    "bytes": 80000
  }
}
```

## Compatibility and limits

- Contract 1 is the existing 1000x1000 artboard, timeline durations, state machines, inputs, facing/weapon behavior and action triggers. New images/Rives are downloadable data, not executable code.
- A fighter requiring new gameplay rules, triggers, state-machine inputs or an incompatible runtime needs a normal app update. Files larger than 8 MiB or unknown contract versions fail closed.
- Registry validation happens before backend startup. Duplicate identities, malformed URLs, digests, sizes, prices and token descriptions are rejected.
- Legacy catalog versions remain capped: unversioned/v1 fig2; v2 through Jup; v3 through ORE. This does not make old binaries capable of rendering new opponent models or parsing new pack tables.
- Browser resource fetching requires the existing CORS header on the public /figures assets. Browser Rive buffers are also checked against the manifest and stored in bounded CacheStorage when available.
- Do not delete or set `purchasable:false` on an already-issued collectible as a retirement shortcut: existing ownership recognition currently uses that flag. RIPSY 001 is the only permanent free starter.

## Historical initial-loader verification (2026-10-08)

105 backend, 475 mobile and 21 web tests pass. All three TypeScript checks, five-model Rive contract/hash checks, web production build and production Android Metro bundling pass. Unsigned iOS release compilation and Android release Kotlin compilation passed. An unknown test fighter (variant 42) passes catalog, price, pack result, inventory, engine persistence/transport and native file/controller-continuity tests.

No physical-device download/offline/purchase test, onchain transaction, production deployment or native release upload is implied by these checks. A release containing the native cache module is still required.
