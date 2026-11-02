# Firebase commerce persistence — 2026-11-02

## Provisioned; production cutover pending verification

The user selected Firebase for figure bytes, catalog and orders, enabled Blaze,
and explicitly approved Frankfurt. Resources now exist in project `ripsy-app`:

- Firestore `ripsy-commerce`, Enterprise Native API, `europe-west3`, optimistic
  transactions, deletion protection enabled. MongoDB API and realtime updates
  are disabled; no PITR/paid backup schedule was enabled.
- Private default Storage bucket `ripsy-app.firebasestorage.app`, same region,
  uniform bucket access and public-access prevention enforced.
- Dedicated `ripsy-commerce` runtime service account: `datastore.user` conditioned
  to this named database; object read/create on this bucket, no object deletion,
  overwrite, IAM, billing, FCM or mint-authority privileges. The user generated
  its JSON key; private material never belongs in Git, a build or operator logs.
- Deny-all Firestore and Storage client rules compiled, deployed and verified
  through the official Firebase tooling. Recovery `packOrders.pendingAt` index
  is deployed. No mobile/web Firebase data SDK or new auth flow is introduced.

This record initially accompanies disabled-by-default source. It is not evidence
of production migration until the cutover results are recorded below. GitHub
pushes auto-deploy this repository: do not manually upload a duplicate source.

## Runtime contract

`COMMERCE_STORAGE=redis` remains the compatibility default. Firebase requires
`FIREBASE_COMMERCE_PROJECT_ID`, `FIREBASE_COMMERCE_DATABASE_ID`,
`FIREBASE_COMMERCE_BUCKET` and the dedicated
`FIREBASE_COMMERCE_SERVICE_ACCOUNT_JSON` (or supported ADC in a Google runtime).
Set `FIRESTORE_ENABLE_TRACING=OFF`; no tracing exporter is installed/configured.
Startup refuses an unverified migration marker, wrong target or credential
identity. Never silently fall back to Redis or dual-write paid orders.

The durable namespace is `commerce/{RIPSY_REDIS_PREFIX}` (`ripsy` by default):

The actual production prefix is `ripsy:production`; preserve it exactly, including
the colon, in Redis source reads and Firestore/Storage namespaces. Initial
operator inspection rejected the colon before any data copy; the guard was
corrected and the real integration fixture now exercises a colon namespace.

- `settings/{prices,pack,registry}`: exact existing revisions, currencies,
  registration IDs/variants, disabled-pack settings and bounded audit history.
- `settings/catalog`: immutable original-eight compatibility baseline and,
  when requested by migration, verified archival copies of their public files.
- `settings/draft`: only metadata/references, logically expires after 30 minutes.
- `shopOrders/{id}`, `packOrders/{id}`: structured receipt payloads, original
  player/buyer, prepared/signed bytes, quotes, paid seed/draw/delivery and retry
  schedule. No expiry policy deletes paid receipts; all migrated receipts are
  retained. Advisory retention metadata is not an automatic delete policy.
- `leases/{id}`: bounded fencing tokens. Every order write verifies the current
  token and deadline in the same Firestore transaction. Immutable owner/quote,
  paid entitlement and saved draw cannot be replaced. Chain/network actions
  occur outside retryable transactions and only after durable writes.

New Rive, PNG and generated Core metadata bytes live exclusively in private
Storage at `figures/{namespace}/{sha256}.{riv,png,json}`. Objects are create-only;
existing bytes must match exactly. Upload/verify files before atomically
committing registry + consuming the verified draft. A failed commit may leave
private unreferenced bytes, never a partly published figure. Discard/expiry does
not delete shared/minted files. Operator cleanup must prove non-reference.
The existing backend immutable GET/HEAD route, MIME, hashes, ETags, paths and
minted metadata URLs remain stable; no signed temporary download URLs or bucket
wide public access. Original eight public URLs remain unchanged even when their
verified bytes are archived in Firebase. Redis is retained for games, sessions,
wallet verification, rate limits and caches, not commerce durability after cutover.

## Controlled migration

1. Deploy source with `COMMERCE_STORAGE=redis`, dedicated credentials configured,
   and `COMMERCE_MAINTENANCE=false`. Verify actual SUCCESS and health/catalog.
2. Redeploy the same image with `COMMERCE_MAINTENANCE=true`. Only public catalog,
   manifest and published assets remain available; admin/checkout/status writes
   and background paid-pack recovery pause. Wait for the old replica/in-flight
   leases to drain; do not copy a live writable source.
3. From the protected operator/container process, with existing private Redis:
   `node --import tsx backend/scripts/migrate-commerce.ts` inspects read-only.
   Add `--apply --archive-builtins` to copy, verify every nested value/file,
   re-read the source for changes, and seal the exact target. No raw receipt,
   signed transaction, private nonce or service key is printed/exported.
4. Only after `state=verified`, redeploy the same image with
   `COMMERCE_STORAGE=firebase`, `COMMERCE_MAINTENANCE=false`. Require SUCCESS,
   health `commerce=firestore`, unchanged catalog/prices/pack policy and guards.
5. Keep the old Redis commerce keys intact as a frozen migration source, not a
   writable replica. **Never** recopy or roll back to stale Redis after Firebase
   accepts new orders without a separately verified reconciliation plan.

No Redis FLUSH, namespace/image/volume change, public port or Railway backup
schedule is part of this migration. Temporary SSH, if needed, must use the
previously approved exact Railway host fingerprint and be revoked after use.
No real purchase, SOL/NFT transfer, mint test or authority change is authorized
or needed to verify persistence.

## Verification and limits

Backend TypeScript and local regression checks pass. Explicit real Firebase
integration used unique `itest-*` namespaces, artificial receipts and mocked
chain calls: absent/wrong readiness, concurrent revision CAS, expired lease,
original owner and quote, persist-before-broadcast/ambiguous response, read-only
reconciliation, paid-pack one-draw/one-delivery restart recovery, frozen-source
copy/verification/collision/seal, metadata-only drafts, atomic/idempotent
publication, object hash/length, private unauthenticated access denial and
restart all pass. These are not real payment or physical-device proofs.

The local Firestore emulator requires Java 21; installed Java17 cannot run the
current official JAR. Cloud integration covers actual Enterprise behavior
instead; no local-emulator pass is claimed. Google Storage's existing
`teeny-request` stream dependency emits MaxListeners warnings under Node24
during binary operations; traces point into that dependency. Verified bytes
and operations pass, but no SDK memory-leak fix is claimed and warnings were
not globally suppressed. Existing dependency/security work remains separate.

Generated client Security Rules are a prototype: all direct access, including
authenticated/admin claims, is denied. Admin SDK bypasses rules, so IAM and
backend validation/fencing still matter. Review and verify the rules before
broadly sharing the app; this is not an exhaustive security audit.

## Production result

Pending controlled cutover and live verification. No completion is claimed here.
