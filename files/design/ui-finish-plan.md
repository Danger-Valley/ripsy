# Native Toy Box completion plan — 2026-10-02

Scope: finish the remaining native secondary UI. Keep rules, Rive timing,
WebSockets, wallet ownership, transaction signing and backend prices unchanged.
No upload, push or live payment is part of this task.

- [x] Shared safe-area, scrollable Toy Box dialogs and illustrated headings.
- [x] Draw-breaker weapon picker: whole-card buttons, readable artwork, locked while submitting.
- [x] Victory, defeat and lineup-timeout result cards with truthful reason and return action.
- [x] Waiting/invite, joining/failure and lineup draft/changed/ready controls.
- [x] Settings and illustrated battle guide, actual notification states and recovery.
- [x] Android optional identity-wallet card, all connection states and selectable address.
- [x] Army/Shop wallet dialogs, email/OTP, purchase review/status/receipt visual consistency.
- [x] TypeScript, focused lint and mobile regression tests: 196 tests / 26 suites.
- [x] iOS Simulator visual checks/screenshots; isolated test-only fixtures for uncommon states (no real mint).
- [x] Web parity handoff and this plan updated with verified results and limits.

Use the existing real Rive previews and approved Toy Box art. System share,
permission and external wallet dialogs remain platform-owned, not re-skinned.

## Completed

Shared dialog/button/status primitives, battle decision/result/preparation panels,
Settings/guide, identity-wallet card and Army/Shop wallet states are implemented.
Settings rechecks permission on foreground return without asking automatically.
No gameplay/Rive/transaction changes, release uploads or version bumps were made.

## Visual evidence and limits

Actual iOS Simulator Settings, battle guide, local lineup and lineup-timeout
cancellation were checked. Isolated no-network fixtures checked the weapon picker,
320-point lineup controls, timeout victory, identity-wallet layout and Shop
email/OTP/review/confirmed receipt. Fixture screenshots are explicitly labeled.
The temporary preview entry was removed; normal `index.js` is restored.

- [Settings](settings-2026-10-02.png)
- [Battle guide](battle-guide-2026-10-02.png)
- [Weapon picker fixture](weapon-picker-preview-2026-10-02.png)
- [Narrow lineup fixture](lineup-controls-preview-2026-10-02.png)
- [Result fixture](battle-result-preview-2026-10-02.png)
- [OTP fixture](shop-otp-preview-2026-10-02.png)
- [Mint review fixture](shop-review-preview-2026-10-02.png)
- [Mint receipt fixture](shop-receipt-preview-2026-10-02.png)
- [Identity wallet fixture](identity-wallet-preview-2026-10-02.png)

Mac lock stopped an additional visual pass. No Android hardware, live email/OTP,
paid mint/signature, large-font system setting or two-player online visual test
was performed. All corresponding state/callback guards have automated coverage;
this is not a substitute for provider/device release QA. Web visual ports are
documented as pending in `WEB_PARITY_HANDOFF.md`, not claimed complete.
