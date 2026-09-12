# Repository agent instructions

- Read `WEB_PARITY_HANDOFF.md` before changing backend gameplay, WebSockets, Redis game state, shared protocol types, lineup behavior, the game board, timers, or Rive animations.
- Update `WEB_PARITY_HANDOFF.md` in the same change whenever backend or mobile behavior affects what the web client implements or must later implement.
- Keep the parity matrix honest: mark web work complete only after inspecting the current web code and adding or running proportional verification.
- Keep entries behavioral and implementation-ready so a future web agent can reproduce the feature without reconstructing chat history.
