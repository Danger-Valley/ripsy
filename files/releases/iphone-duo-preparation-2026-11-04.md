# iPhone Duo — implementation and remaining device QA

Date: 2026-11-04. Source preparation and local Simulator build verified;
**native visual/fold verification blocked, not a released or fully Duo-validated build**.

## Implementation

- On iOS 27.1+, the React Native factory hosts its one React root in the primary
  child of a UIKit `UIArrangementViewController` with an overlay arrangement.
  UIKit can keep interactive content in one continuous region when a division
  is active; the secondary child is a noninteractive brand-color backdrop.
  The primary receives its React view before being installed in the arrangement.
  No resize handler recreates the factory, root, navigation, session, order,
  lineup or animation controller. iOS 17–27.0 retains the superclass hosting
  path. Runtime pose behavior still requires QA.
- Home, Army and Battle size from the nearest SafeAreaProvider frame, not an
  assumed physical display. Home keeps the active carousel page when its snap
  distance changes. Room input remains in the same component.
- Army, Shop and Battle reserve independent left/right insets outside their
  capped content boxes. Army card widths use that same available box. Existing
  top/bottom handling remains reactive; backgrounds stay full bleed.
- GameBoard measures its parent. Art, cells, hit targets, movement and combat
  coordinates derive from the same square. Resizing does not rekey Rive pieces.
  Short panes remain scrollable.
- ToyDialog uses a modal-local SafeAreaProvider for content and push overlay.
  Each edge is independent. Content scroll resets only for the existing flow
  contentKey, not geometry. Push/splash overlays also clear horizontal insets.
- iOS release preflight requires SDK 27.1+; deployment minimum stays iOS 17.
  No Expo, dependency, entitlement or orientation-mask change.

## Apple modernization coverage

Read the exported Apple app-resizability skill and all five task references;
independent native coverage audit completed. First-party native sources have
no legacy UIScreen, layout-orientation, idiom, obsolete inset-guide or app-only
lifecycle target requiring replacement. SceneDelegate already uses
UIWindow(windowScene:) and forwards links without recreating React on resize.
Preserve AppDelegate.window for RN Firebase bootstrap compatibility. Privy,
native audio, Firebase initialization and scene configuration are unchanged.

Plist/project/xcconfig prerequisites pass: LaunchScreen declared, all four iPad
orientations, no UIRequiresFullScreen opt-out. Portrait-only phone declaration
is deliberately unchanged. These are not visual validation of every screen.

## Verification completed

- 826 mobile tests / 59 suites PASS with --runInBand --detectOpenHandles and
  default timeout. First concurrent run hit one 5-second checkout timeout during
  compilation; isolated 171-test Shop suite and a fresh full run after compilation
  both pass. No timeout or assertion weakened.
- New renderer regressions cover parent-width board/hit geometry and stable
  Rive instances; pane/inset changes with preserved room input, carousel page,
  army slot and dialog email; inset-only side reversal; modal-local provider;
  push/splash clearance. These are renderer tests, not real folding evidence.
- Mobile TypeScript, focused ESLint (no warnings), eight canonical figure
  byte/hash/geometry/timeline/input checks and twelve iOS audio/Firebase bootstrap
  script tests PASS. Preflight shell syntax PASS. Full release/provider preflight
  was not run for this source task.
- Xcode 27.2 / Simulator SDK 27.2 Release BUILD SUCCEEDED for arm64 and x86_64.
  Final JS bundle is newer than final production JS edits. Build subprocesses
  received only normal runtime variables and two public native Privy IDs,
  never private root-env values.

Ignored evidence: files/builds/duo-20261104/build.log and
files/builds/duo-20261104/DerivedData/Build/Products/Release-iphonesimulator/RipsyMobile.app.
No version bump, APK/IPA publication or TestFlight upload; released native
version remains 1.0.0 (74).

## Required before full iPhone Duo signoff

CUA reported the Mac locked with automatic unlock unsuccessful; Xcode MCP
separately requested user approval. No permission auto-approval or lock bypass,
app installation/launch, pose change or device-interaction session occurred.
Read-only enumeration confirms a booted Duo/iOS 27.2, not visual correctness.

After manual unlock / Xcode tool approval, test the actual built app:

1. Closed, fully open, rotated and active partial-fold poses; narrow/wide panes,
   side-inset reversal and Dynamic Type. Home → Army → Shop → Back must work.
2. Local computer lineup/selection and Rive animation across resizing without
   restart/accidental command; ordinary iPhone and iPad regression.
3. Settings, email keyboard, required choices, purchase/recovery dialog and push
   overlay before/during/after folding, without signing or paying.

Important: transparent RN Modals use overFullScreen and may be promoted beyond
the primary arrangement pane. A modal-local safe-area provider fixes edge
insets, not an interior fold. Do not claim half-fold/laptop dialogs verified.
If a dialog straddles the division, a supported modal-local arrangement/geometry
solution is required before all-pose signoff. Physical-device QA is also pending.

No backend/catalog/settings, Redis/Firestore data, credentials/authority,
purchase/signing or on-chain behavior changed. No real payment, mint, production
store submission or new release-channel upload.

## Official references

- [Apple: Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo)
- [Apple: Three steps to make your app shine on iPhone Duo](https://developer.apple.com/iphone-duo/prepare/)
- [Apple: Get ready for iPhone Duo](https://developer.apple.com/iphone-duo/)

Factory hook signatures and arrangement APIs were also checked against installed
React Native sources and iOS 27.2 SDK headers.
