# Repository agent instructions

- After each completed implementation or release task, commit the task's changes and push the current branch to its configured remote unless the user explicitly requests otherwise. Never include secrets, private keys, local build output or unrelated changes in an automatic task commit. An explicit commit-all request includes accumulated non-sensitive project changes.
- A requested signed Android release build includes publishing the verified APK to the existing `Danger-Valley/ripsy-downloads` `seeker-latest` release used by `https://ripsy.fun/download`, unless the user explicitly requests a local-only build or no publication. Do not set `RIPSY_SKIP_SEEKER_PUBLISH=1` by default. Verify the public APK hash and the Download page's release label after publishing. This standing permission does not authorize backend/catalog changes, store submissions, or other release channels.
- Read `WEB_PARITY_HANDOFF.md` before changing backend gameplay, WebSockets, Redis game state, shared protocol types, lineup behavior, the game board, timers, or Rive animations.
- Update `WEB_PARITY_HANDOFF.md` in the same change whenever backend or mobile behavior affects what the web client implements or must later implement.
- Keep the parity matrix honest: mark web work complete only after inspecting the current web code and adding or running proportional verification.
- Keep entries behavioral and implementation-ready so a future web agent can reproduce the feature without reconstructing chat history.
