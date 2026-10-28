# Direct-figure checkout reconciliation — 2026-10-28

Implementation only; not included in published Android/TestFlight 1.0.0 (69).

## Scope

Direct figure purchases already combine token/SOL payment, any SOL exchange and all selected Core mints in one transaction. This change resolves a stranded local checkout after access to its original anonymous player ID is lost. It does not repair a payment/mint atomicity gap, transfer orders or implement another payment.

`POST /shop/orders/:id/reconcile` requires a valid current player session and the exact original pre-signed transaction from the saved receipt. Receipt comparison is constant-time after the length check. Optional already-signed bytes are verified against that exact original message and all required signatures; they only supply the transaction signature for observation. No wallet prompt, signing, preparation, broadcast, inventory binding or owner change is performed by reconciliation.

The original stored order supplies network, buyer, assets and expiry. Its player ID, quote, signed bytes and status are never rewritten. Existing player-scoped GET/submit permissions remain unchanged; successful reconciliation does not grant access to those operations. Only separate short-lived rate-limit counters are written, capped at 30 checks/minute per current player and per receipt.

## Chain evidence

- Check the configured cluster's genesis before strict reconciliation.
- Require finalized signature status for success/failure. Processed/confirmed observations remain pending in this path; ordinary existing order operations retain their previous confirmation policy.
- If the wallet broadcast before returning its signature, inspect up to ten finalized transactions associated with the unique asset. Match the complete serialized message, not just an address, token movement or returned signature. This can resolve a completed purchase before the original blockhash expires.
- Expiry requires finalized block height beyond the original last-valid height, invalid original blockhash, bounded complete history without a matching transaction and absence of every expected asset at finalized commitment. An existing account with missing mint history is ambiguous, not proof of failure.
- RPC outages, wrong network, malformed height/status/result, missing transaction bodies, full history pages or inconsistent blockhash/account evidence never discard the receipt or authorize a replacement payment.

## Client behavior

After typed HTTP 404 for an existing order, persist `reconciliationOnly` before querying the new route. Repeated checks and remounts then use only that route. All original buyer, order, idempotency key, transaction, quote and asset identities remain intact; only verified status/signature/error are applied locally. Late results from a previous token, unmounted screen or replaced intent cannot finalize the active receipt.

Confirmed/failed/expired results clear durable pending work only after secure storage succeeds, while keeping an in-memory receipt and Done action. Unknown results retain signed bytes and block dismissal/new purchase, including legacy records without `signingStarted`. Recovery never creates a replacement order, calls a signer, submits signed bytes or invokes Retry. A later new purchase requires a separate deliberate user action.

Native and web hide wallet approval/retry controls for read-only receipts and show original-transaction checking/result copy. Native 401 repair in this mode renews only the HTTP session, without opening Seeker authorization. Existing browser cached-token validation/session-repair UI remains unported; web reconciliation applies once a valid session exists. Pack recovery is unchanged and is outside this direct-figure atomic-checkout fix.

If the original server receipt has expired from retention or is unavailable, the endpoint fails closed. It does not trust a client-supplied expiry/quote or clear an ambiguous purchase. Keep the saved receipt for support rather than deleting app storage or paying again.

## Verification and delivery

- 791 mobile tests/56 suites, 228 backend tests and 32 web tests pass. Coverage includes old-player access remaining denied, exact receipt/signature checks, no sends/order writes (including already-submitted stored payments), per-receipt throttling, strict finality/expiry, wallet-broadcast history recovery, malformed RPC evidence, unknown/terminal states, stale token/unmount responses, storage failures and UI no-payment boundaries.
- Backend/mobile/web TypeScript pass. Focused native/shared ESLint has no errors; two existing shared `no-void` warnings remain. Both Android and iOS production-mode Metro bundles pass with existing package-export warnings.
- No production deployment, signed APK/IPA build/upload, store submission, environment/secret/authority operation or live purchase was performed. Signing in tests uses only generated mock/fixture keys and never broadcasts.
- Rollout: deploy the backend endpoint first, then deliver updated native/web clients. No new environment variables or update minimums are required. Published build 69 is unchanged. Until a new backend is present, an unsupported reconciliation endpoint conservatively keeps the receipt saved.

No dependency installation is needed. Verification commands:

```sh
npm run test:mobile -- --detectOpenHandles
npm test -w @rps/backend
npm test -w @rps/web
npm run typecheck -w @rps/backend
npm run typecheck -w @rps/mobile
npm run typecheck -w @rps/web
```

Production-mode JS bundle checks use the existing React Native CLI for each
platform with `--dev false`; their output is retained locally under
`/private/tmp/ripsy-checkout.pxxRif`, not published as a native release.

Protocol references: [signature history](https://solana.com/docs/rpc/http/getsignaturestatuses), [blockhash validity](https://solana.com/docs/rpc/http/isblockhashvalid), [confirmation and expiration](https://solana.com/developers/cookbook/transactions/confirmation).
