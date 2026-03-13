---
phase: 03-core-claude-integration
plan: "03"
subsystem: api
tags: [anthropic, google-chat, cardsV2, typescript, jest, railway]

# Dependency graph
requires:
  - phase: 03-02
    provides: callClaude function, chatClient singleton, buildReplyCard/buildErrorCard helpers
  - phase: 02-02
    provides: handleChatEvent handler stub with setImmediate async pattern
provides:
  - Full Thinking → callClaude → PATCH lifecycle in chatEvent.ts
  - buildThinkingCard helper in cards.ts
  - Live end-to-end Claude reply visible in Google Chat as cardsV2 card
  - RESP-03 plain-text fallback if card PATCH fails
affects: [04-context-threading]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "setImmediate async lifecycle: POST Thinking card → callClaude → PATCH with reply or error card"
    - "RESP-03 double-PATCH fallback: cardsV2 attempt first, plain-text patch on schema failure"
    - "Anthropic error class discrimination: RateLimitError (429), InternalServerError (529), APIConnectionTimeoutError"

key-files:
  created: []
  modified:
    - src/chat/cards.ts
    - src/handlers/chatEvent.ts

key-decisions:
  - "Thinking card POST wrapped in own try/catch — if it fails, return early with no PATCH attempted"
  - "fallbackText extracted inline from replyBody cardsV2 structure for RESP-03 plain-text fallback"
  - "messageName captured from placeholderRes.data.name so PATCH targets the exact created message"

patterns-established:
  - "Pattern 1: All Claude-triggered async work runs inside setImmediate so 200 flushes before any await"
  - "Pattern 2: cardsV2 PATCH is attempted first; only on throw does plain-text PATCH run (RESP-03)"

requirements-completed: [CLDE-03, RESP-03]

# Metrics
duration: ~15min (continuation from checkpoint)
completed: 2026-03-13
---

# Phase 3 Plan 03: Core Claude Integration — Live End-to-End Summary

**Full Thinking-card → callClaude → cardsV2 PATCH lifecycle with RESP-03 plain-text fallback, verified live in Google Chat with real Claude reply**

## Performance

- **Duration:** ~15 min (continuation agent post-checkpoint)
- **Started:** 2026-03-13 (checkpoint approved)
- **Completed:** 2026-03-13
- **Tasks:** 2 (1 TDD implementation + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- Added `buildThinkingCard()` to `src/chat/cards.ts` — returns cardsV2 card with cardId 'thinking', header 'Claude', subtitle 'Thinking...'
- Expanded the `setImmediate` async stub in `chatEvent.ts` into the full lifecycle: POST Thinking placeholder → `callClaude(argumentText)` → PATCH with `buildReplyCard` or `buildErrorCard`
- Implemented RESP-03 double-PATCH fallback: if cardsV2 PATCH throws, a second PATCH with `updateMask: 'text'` sends plain text
- All 5 `chatEvent.test.ts` behavior tests GREEN (Thinking POST before callClaude, reply PATCH, error PATCH, early-exit on POST failure, RESP-03 fallback)
- Live Railway deploy verified by human: `/claude What is 2 + 2?` produced a "Thinking..." placeholder card immediately, then replaced with a "Claude" header cardsV2 reply card containing Claude's answer

## Task Commits

Each task was committed atomically:

1. **Task 1: Add buildThinkingCard to cards.ts and expand chatEvent.ts async block** - `c7cbd49` (feat)
2. **Task 2: Deploy to Railway and verify live end-to-end Claude reply in Google Chat** - human-verify checkpoint (approved — no code commit)

## Files Created/Modified

- `src/chat/cards.ts` — Added `buildThinkingCard()` export
- `src/handlers/chatEvent.ts` — Replaced async stub with full Thinking → Claude → PATCH lifecycle

## Decisions Made

- Thinking card POST has its own try/catch block: if it fails, log and return early — no PATCH is ever attempted (no message name to target)
- `messageName` captured from `placeholderRes.data.name!` immediately after POST so all subsequent PATCHes reference the exact created message
- RESP-03 fallback extracts text from the cardsV2 structure inline rather than maintaining a separate `fallbackText` variable — keeps replyBody as the single source of truth

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all 5 tests passed on first implementation run; Railway auto-deployed on git push; live verification approved immediately.

## User Setup Required

None - no external service configuration required. Railway environment variables (ANTHROPIC_API_KEY, GOOGLE_SERVICE_ACCOUNT_KEY, BOT_ENDPOINT, ALLOWED_SPACE_IDS) were already in place from prior phases.

## Next Phase Readiness

- Phase 3 complete: real Claude replies are live in Google Chat
- Phase 4 (context threading) can now build on the confirmed PATCH-in-place pattern — PATCHing a bot-created message updates in-place in Google Chat UI (confirmed by live verification)
- Outstanding Phase 4 concern: `spaces.messages.list` thread filter syntax (AIP-160) needs live API verification before implementation

---
*Phase: 03-core-claude-integration*
*Completed: 2026-03-13*
