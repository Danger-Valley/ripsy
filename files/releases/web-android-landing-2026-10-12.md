# Android-only landing page actions

Published 2026-10-12 from source commit `51fa67dad4589aecf3e9b3cc720f0b2fd5669e05` at the user's request to postpone the web launch.

- Removed the navigation Play now link, hero Play RIPSY action and lower Enter the playground action.
- Navigation and primary hero/lower actions link to `/download`.
- Replaced the available-web-play claim with `Free to play on Android · Web version coming later`.
- This change removes landing-page entry points; existing direct game URLs remain present.

Vercel deployment `dpl_3zQAjrHubJGTzb5WjHXAFauUoHT8`, https://ripsy-lo14dmsxv-danger-valley.vercel.app, is READY and aliased to https://www.ripsy.fun.

The deployment used a clean isolated archive of the source commit. Pending checkout changes in the shared/mobile working tree were excluded. The actual uploader verified 163 files and excluded backend/native/secrets. Local and remote production builds/TypeScript compilation pass. Fresh browser inspection and HTTP checks confirm no landing links to `/app`, no Play buttons, exactly three Android download links, the updated launch note and HTTP 200 for the landing/download page. Existing brand styles provide the primary download buttons, focus states and touch targets.
