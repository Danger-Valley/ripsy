# RIPSY landing page production deployment

Published on 2026-10-12 from committed web source `91996d359d7e247a463b5ebc579b872d68236f99` (`Landing page`). The native Army autosave changes currently in the working tree are excluded from the web upload and remain untouched.

## Deployment

- Vercel project: `danger-valley/ripsy`.
- Deployment ID: `dpl_BQuyitMvfjwGhvfsjXBFkW3cS5QV`.
- Deployment URL: https://ripsy-m8u08o1ko-danger-valley.vercel.app
- Production alias: https://www.ripsy.fun
- State: `READY`; CLI confirmed production alias assignment.
- Before publication, the latest production attempt (`ripsy-kbd8wexrn-danger-valley.vercel.app`) was `ERROR`; the root served the old game UI and `/app` returned 404. The older error's detailed cause was not exposed by CLI inspection. This successful deployment used the existing project and upload configuration without a source-code or domain-settings change.

## Verification

- All 27 web tests and local Next.js production build/TypeScript compilation pass.
- Actual Vercel uploader dry-run verified 165 files, required web inputs present and backend/native files and secret paths excluded.
- Remote install, Next.js build and production deployment completed successfully.
- `https://ripsy.fun/` resolves to the www domain with HTTP 200 and the landing heading `Outthink. Outplay. Capture the flag.`. It links to `/app`, contains no game lobby and serves both referenced stylesheets successfully. A fresh browser tab independently confirms the landing heading, navigation, artwork and legal links.
- `/app` returns HTTP 200 with the game lobby, `Your active games` and `Start a battle`.
- `/terms`, `/privacy` and `/download` return HTTP 200.
- `/download` displays `RIPSY Android 1.0.0 (61)` and links to the existing public `seeker-latest/ripsy-seeker.apk`.

No backend/native deployment, domain reassignment, player action, wallet signing or source-repository push was performed by this web deployment. Existing unrelated working-tree changes remain untouched.
