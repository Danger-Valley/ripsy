# Adding server-delivered fighters

The mobile and web clients now accept server-issued figure IDs and visual variants. The authoritative registry is `backend/src/figure-registry.json`. The shared `FIGURES` constant is only an offline/legacy bootstrap, not the registration allowlist.

An initial native release containing this implementation is required. Installed build 56 cannot acquire support for unknown fighters through configuration alone. After that release, adding a compatible fighter does not require an iOS/Android rebuild.

## Data flow

- Public `GET /shop/figures`: ID, permanent numeric variant, name, description, purchase/platform flags, preview URL, Rive URL, exact byte length, SHA-256 and animation contract version.
- Public `GET /shop/catalog?catalogVersion=4`: purchasable figures, server-selected prices and availability.
- Authenticated inventory includes the canonical visual variant for each owned Core asset. A specific asset can occupy one slot only; ownership remains checked by the backend.
- Pack price/drop weights/results come from the published onchain edition and the order's saved drop table, not from a client list or the figure registry. Current edition 2 stays Jup 40%, BONK 40%, ORE 20%, 1,099 SKR.
- Native caches the validated manifest across launches. Missing Rives download into private storage and are checked by exact size and SHA-256 before Rive loads them. Download requests are deduplicated, automatic retries are bounded, and the board offers manual retry. Cache size is bounded to 96 MiB.
- The board loads each required remote model once and keeps its loaded file alive across moves/attacks/traps. Foreground refreshes do not reset unchanged definitions/controllers. A newly encountered opponent variant forces a catalog refresh.
- Offline computer lineups preserve generic variant IDs. Saving an army pre-downloads its remote models. If a resource is unavailable, do not silently substitute a different collectible.

## Register a new fighter

1. Choose a new permanent slug (lowercase letters, digits, underscores or hyphens; starts with a letter, max 64 characters) and an unused integer variant 6..255. Never reuse or remap published IDs/variants. Variant 1 is always the free RIPSY 001. Keep historical registrations/assets available.
2. Prepare a compatible Rive, preview PNG and canonical Core metadata. Publish them at `https://www.ripsy.fun/figures/<id>.riv`, `<id>.png` and `<id>.json`. Metadata must have the canonical name, preview URL and Figure trait. The metadata URI and collection remain part of official inventory recognition.
3. Add one entry to the backend registry with name, description, variant, purchase/platform flags, Rive hash/size and price. Do not add imports, requires or switch cases to mobile code.
4. For token pricing, set `tokenPayment` with the verified mint, symbol, decimals and exact positive base-unit amount as a string. For a SOL-priced figure use `priceLamports` as an exact positive integer string. Existing fig2's environment price override remains supported.
5. Run `npm run figures:check`, backend/mobile/web tests and TypeScript. The figure checker reads the registry, validates web bytes/hash and the authored Rive contract; native asset equality is checked only for models already bundled.
6. Deploy the public resources before the backend registration. Run the Vercel upload checker to ensure all registered assets are included and backend/native/secrets are excluded. Deploy the backend through its existing allowlisted staging workflow. A Git push alone is not evidence of a successful deployment.
7. Check the live manifest and version-4 catalog, then use an updated physical phone to browse, acquire, equip, restart offline and encounter the model in a real game. Verify jump/combat/trap/facing and unchanged neighboring instances.
8. To include it in packs, separately update and explicitly approve publication of an append-only pack edition. Editing the registry or local weights does not change the onchain edition or existing receipts. The current program supports at most 32 rewards per edition.

Example registry entry (replace the placeholder digest, size, token address and precision with independently verified values):

```json
{
  "id": "new-fighter",
  "name": "New fighter",
  "variant": 6,
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

## Verification for this implementation

105 backend, 475 mobile and 21 web tests pass. All three TypeScript checks, five-model Rive contract/hash checks, web production build and production Android Metro bundling pass. Unsigned iOS release compilation and Android release Kotlin compilation passed. An unknown test fighter (variant 42) passes catalog, price, pack result, inventory, engine persistence/transport and native file/controller-continuity tests.

No physical-device download/offline/purchase test, onchain transaction, production deployment or native release upload is implied by these checks. A release containing the native cache module is still required.
