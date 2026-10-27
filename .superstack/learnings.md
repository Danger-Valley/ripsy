# Project Learnings

> Managed by `/learn`. Append-only — latest entry wins on conflicts.

## Patterns

## Pitfalls

## Preferences

### publish-android-release-apk-to-download
- **Insight:** A requested signed Android release build should also publish its verified APK to the existing ripsy-downloads/seeker-latest release used by ripsy.fun/download, unless the user explicitly requests local-only output or no publication; verify the public APK hash and page label, without expanding this permission to backend/catalog or store submissions.
- **Confidence:** 10/10
- **Source:** manual
- **Files:** AGENTS.md, frontend/apps/mobile/scripts/build-prod-seeker.sh, frontend/apps/mobile/scripts/publish-seeker-apk.mjs, frontend/apps/web/app/download/page.tsx
- **Date:** 2026-10-27

## Architecture

## Tools
