# Three Backbone Implementations — Progress

## Status
- **Project:** Three Backbone Implementations: OpenClaw, Claude Code CLI, NemoClaw
- **Started:** 2026-04-04
- **Features:** 26 / 26 completed ✓
- **Last session:** 2026-04-04
- **Current blocker:** none — ALL COMPLETE

## Key Decisions
- Claude Code adapter: uses local `claude` CLI subprocess (`--print` flag), NOT HTTP API. No API key needed.
- NemoClaw: NVIDIA NeMo Microservice format — OpenAI-compatible HTTP REST on port 8000
- OpenClaw: WebSocket protocol already implemented, needs end-to-end validation
- UI testing: AppleScript + System Events (not Playwright) per user requirement

## Phases
1. OpenClaw validation (F101-F104) — 4 features
2. Claude Code CLI adapter (F201-F206) — 6 features
3. NemoClaw adapter (F301-F305) — 5 features
4. Integration + routing (F401-F404) — 4 features
5. UI end-to-end (F501-F505) — 5 features

## Session Log

### 2026-04-04 — Launch
- Created features.json with 24 features
- Launching 3 parallel sub-agents + 1 UI agent
