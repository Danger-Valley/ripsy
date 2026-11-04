# iPhone Duo — implementation and native verification

Date: 2026-11-04. Source preparation, local Simulator Release and selected actual
open/active-fold workflows verified. **Not a published release or complete
all-pose/physical-device signoff.**

## Implementation

- On iOS 27.1+, the React Native factory hosts its one React root in the primary
  child of a UIKit `UIArrangementViewController` with an overlay arrangement.
  UIKit can keep interactive content in one continuous region when a division
  is active; the secondary child is a noninteractive brand-color backdrop.
  The primary receives its React view before being installed in the arrangement.
  No resize handler recreates the factory, root, navigation, session, order,
  lineup or animation controller. iOS 17–27.0 retains the superclass hosting
  path. Actual base-screen and local-lineup pose checks are recorded below.
- Home, Army and Battle size from the nearest SafeAreaProvider frame, not an
  assumed physical display. Home keeps the active carousel page when its snap
  distance changes. Room input remains in the same component.
- Army, Shop and Battle reserve independent left/right insets outside their
  capped content boxes. Army card widths use that same available box. Existing
  top/bottom handling remains reactive; backgrounds stay full bleed.
- GameBoard measures its parent. Art, cells, hit targets, movement and combat
  coordinates derive from the same square. Resizing does not rekey Rive pieces.
  Short panes remain scrollable.
- Actual QA found transparent RN Modals extend outside the root arrangement:
  a provider alone did not prevent the collection dialog from crossing a fold.
  ToyDialog now uses its own native geometry probe and a bounded ModalViewport.
  On27.1+ it reads active public division regions in its own current coordinates,
  preferring the bottom/trailing continuous region without adding margins twice.
  If keyboard avoidance removes that region entirely, use the nonempty opposite
  region. If neither exists, remain fail-closed rather than expose fold controls.
  Earlier iOS and Android retain their full-area dialogs. No global window,
  screen-size/device inference, vendor patch or second React root is introduced.
  A weak display-link proxy observes hinge-only changes while the probe is
  attached; unchanged regions emit no event, detach/dealloc invalidate it.
  Content waits for the first native measurement; later updates move the same
  form rather than rekeying/remounting it. The modal-local SafeAreaProvider and
  push overlay live inside the bounded region, with independent inset edges.
  Keyboard avoidance and the dimming scrim remain outside it, covering the full
  modal. Content scroll resets only for the existing flow contentKey, not geometry.
  Push/splash overlays also clear horizontal insets.
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

- 830 mobile tests /60 suites PASS with --runInBand --detectOpenHandles and the
  default timeout after the modal fix. No timeout or assertion weakened.
- New renderer regressions cover parent-width board/hit geometry and stable
  Rive instances; pane/inset changes with preserved room input, carousel page,
  army slot and dialog email; inset-only side reversal; modal-local provider;
  push/splash clearance. Four new unmocked ModalViewport tests additionally cover
  invalid/initial measurements, one retained form across region changes, native
  keyboard/provider nesting and the Android fallback. Other behavior suites mock
  only the UIKit geometry boundary; these are not real folding evidence.
- Mobile TypeScript, focused ESLint (no warnings), eight canonical figure
  byte/hash/geometry/timeline/input checks and thirteen native script checks PASS
  (twelve audio/Firebase guards plus compiling/executing thirteen cases against
  the actual C modal-region helper). The helper covers LTR/RTL, horizontal,
  translated, clipped/outside divisions, keyboard-clipped primary regions and
  no available region. Preflight shell syntax PASS. Full
  release/provider preflight was not run for this source task.
- Xcode 27.2 / Simulator SDK 27.2 Release BUILD SUCCEEDED for arm64 and x86_64.
  Final JS bundle is newer than final production JS edits. Build subprocesses
  received only normal runtime variables and two public native Privy IDs,
  never private root-env values.

Ignored build evidence: files/builds/duo-20261104/build.log,
build-modal-v1.log, build-modal-v2.log, build-modal-adhoc-v2.log,
build-modal-adhoc-v3.log, build-modal-adhoc-v4.log and
files/builds/duo-20261104/DerivedData/Build/Products/Release-iphonesimulator/RipsyMobile.app.
The final Simulator-only ad-hoc v4 artifact is installed/hash-matched:

- Binary SHA256: `15c99e81eb4c38be633b91749e09d11bef50b0139bd8aef71137031f90eeb401`.
- JS SHA256: `827fdfe13ae292e8652be8c75b6e4bb8b0fa03cd2a074f060f1c671d8c344eca`.
- Strict/deep local signature verification PASS. Its generated public native
  app/client IDs are nonempty and exactly match the expected native configuration.

No version bump, APK/IPA publication or TestFlight upload; released native
version remains 1.0.0 (74).

## Actual native Simulator QA

After the user unlocked/approved Xcode access, the exact local Release was
installed without clearing data on the existing Duo/iOS27.2. Installed binary
and JS hashes were checked. Xcode capture/touch initially selected the inactive
outer panel, so that failed tap was not classified as an app defect. Pinned
Callstack agent-device0.21.36 with isolated task-local daemon/state enabled
actual active-panel interactions and hinge readback; independent simctl inner
screenshots were used to cross-check actual renders. No Expo or project/global
test-tool dependency was installed, and no security prompt was auto-approved.

- Home → Army and stable Army slot selection work. The selected slot survives
  Open180° → Closed0° → active half-open~123°. Fresh AX frames and the half-open
  image confirm the primary starts atx495.67 with width455.33 in a951×669 window;
  safe Army content width371.33. Its44-point-minimum slot row scrolls intentionally.
- On baseline c7bbfcd, local computer pre-active lineup keeps all14 own-piece row/column weapon
  labels identically across those three poses, with unchanged process ID and no
  Shuffle, Save or battle command. Half-open board/cards stay in the primary
  pane. The normal unsaved-lineup timer then expires on return; persistence past
  that intended cancellation is not claimed.
- Baseline c7bbfcd collection modal crossed the active division despite the
  correctly bounded Army. Fixed native build emits its first region event and
  keeps the same collection dialog through closed/active-half transitions:
  regionx495.67,width455.33; dialogx529.33,width304.67. Both AX and independent
  inner-display screenshot confirm the entire card/Register/Close stay inside.
  At~132° UIKit had no active base division, so full-window layout there is not
  a fold-safety failure. An earlier ambiguous Home/Shop capture did not reproduce
  as an automatic navigation reset; no fatal React/native log was found.
- Shop open/active-half navigation and actual Seeker preview are verified:
  scene/head/platform remain visible; Open uses the capped612-point card and
  300×300 preview. A preexisting saved checkout was preserved, not canceled,
  paid, transferred or recreated. Register → Shop → Army adds navigation history;
  the existing Army button's Back to home label actually calls goBack.

The first local build disabled signing and hit a required-entitlement error.
Standard Xcode Simulator ad-hoc signing restored the normal application-identifier
section and removed that error; its exact v2 modal containment also passes.
Separately, the local helper passed public Privy IDs only through the environment,
which did not override the project's explicitly empty build settings. This left
the generated Info.plist unconfigured. The helper now mirrors ios-beta.sh's two
explicit public build-setting arguments. The corrected v3 test build exposes
the actual email form and visible native keyboard. In Open, the input at y230.5
and Send button y291..361 stay above the keyboard starting at y449. Settings also
renders correctly in the active right pane; no switch was changed. The same
inert input value survives Open → Closed0° → Half123.3263° in v3, with the same
PID and visible keyboard. The half-open region is x495.67,width455.33,height442;
input y246.83..297.83, Send y307.33..377.33 and Close y71..117 remain above it.

Actual rotation with the keyboard still visible then exposed a second bug:
the window becomes669×951 and the KAV probe height455.6667 ends inside the
horizontal division. The preferred bottom region was empty; the entire dialog
and Close vanished while keyboard y560..898 remained. Settled raw AX and an
independent screenshot confirm this, not a transport or authentication failure.
The v4 empty-preferred-region fallback above fixes this pure geometry case and
all thirteen compiled native geometry cases pass. Exact v4 runtime retest also
PASS: same PID45539 through Open → Closed0° → Half123.3261° → horizontal rotation;
the input value stays intact with the native keyboard visible. On the actual
669×951 horizontal-fold screen, the region moves to the clear upper area
0..455.6667, dialog x122.33,y129.33,width425,height279.33. Close y129..175,
Email y278.17..329.17 and Send y338.67..408.67 are entirely above the fold and
keyboard y560..898, confirmed by AX and independent inner-display screenshot.
The form is never rekeyed/remounted. No Return/Done, code send, login or purchase
was performed; the only typed address is an inert .invalid test value.
In the recovered upper pane, clearing that test value disables Send; the actual
Close button dismisses the dialog and keyboard, and Shop Back returns Home.
Cleanup verified: Open180°/Home restored, test input cleared, keyboard absent;
only the named test session closed and isolated daemon stopped with --clean.
Session close terminates its app, so a normal simctl launch then left the same
installed v4 on settled Home (PID51656), without creating another test session.
The preexisting Duo was not shut down, erased or stripped of saved data.
No production authentication regression, credential/entitlement edit or auth
flow change is implied. No distribution certificate, App Store key or profile
was used for Simulator ad-hoc signing.

## Remaining signoff limits

- Closed hinge and AX state/geometry are verified, but both actual display1/3
  screenshots are entirely black including system chrome. Closed visual PASS is
  not claimed and this is not classified as an app-render failure.
- Physical Duo, ordinary iPhone/iPad regression, Dynamic Type, further fold/
  keyboard variants, required-choice/purchase/recovery and real push-delivery
  matrices remain pending where not explicitly verified above. Renderer tests
  are not substitutes for those checks. No all-pose or store-readiness claim.
- The opposite-region fallback is intentionally limited to an empty preferred
  pane, not a positive but unusably thin sliver. No arbitrary size threshold is
  introduced without native evidence; that broader case remains a QA limit.

No backend/catalog/settings, Redis/Firestore data, credentials/authority,
purchase/signing or on-chain behavior changed. No real payment, mint, production
store submission or new release-channel upload.

## Official references

- [Apple: Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo)
- [Apple: Three steps to make your app shine on iPhone Duo](https://developer.apple.com/iphone-duo/prepare/)
- [Apple: Get ready for iPhone Duo](https://developer.apple.com/iphone-duo/)

Factory hook signatures and arrangement APIs were also checked against installed
React Native sources and iOS 27.2 SDK headers.
