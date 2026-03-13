---
phase: 03-core-claude-integration
plan: 01
subsystem: testing
tags: [jest, tdd, anthropic-sdk, wave-0, test-scaffold]

# Dependency graph
requires:
  - phase: 02-secure-webhook-foundation
    provides: handleChatEvent async stub, cards helper, chatClient integration surface
provides:
  - Wave 0 TDD gate: 17 failing test stubs across 3 test files establishing verification contract for Phase 3
  - @anthropic-ai/sdk installed in package.json
affects: [03-02, 03-03]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk ^0.78.0"]
  patterns: ["Wave 0 TDD: write failing tests before implementation modules exist", "jest.mock for SDK isolation in unit tests"]

key-files:
  created:
    - src/__tests__/claude.test.ts
    - src/__tests__/chatEvent.test.ts
  modified:
    - src/__tests__/cards.test.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Wave 0 TDD gate established: all Phase 3 test stubs written before any implementation module exists"
  - "claude.test.ts mocks @anthropic-ai/sdk via jest.mock to isolate unit tests from real API calls"
  - "chatEvent.test.ts uses setImmediate(resolve) to let async block run before asserting on mock calls"

patterns-established:
  - "TDD Wave 0: import non-existent modules deliberately to create RED state before implementation"
  - "SDK error class testing: instantiate Anthropic.RateLimitError / InternalServerError / APIConnectionTimeoutError directly in tests"
  - "Async chatEvent testing: await new Promise(resolve => setImmediate(resolve)) after handleChatEvent call"

requirements-completed: [CLDE-01, CLDE-03, CLDE-04, CLDE-05, RESP-01, RESP-02, RESP-03]

# Metrics
duration: 8min
completed: 2026-03-13
---

# Phase 03 Plan 01: TDD Wave 0 Scaffold Summary

**@anthropic-ai/sdk installed and 17 failing test stubs across 3 files establish the verification contract before any implementation module exists**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-13T02:50:38Z
- **Completed:** 2026-03-13T02:58:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed @anthropic-ai/sdk ^0.78.0 in package.json dependencies
- Created claude.test.ts with 7 stubs: model selection, system prompt, timeout option, return value, RateLimitError, InternalServerError (529), APIConnectionTimeoutError
- Extended cards.test.ts with 6 stubs for buildReplyCard and buildErrorCard
- Created chatEvent.test.ts with 4 stubs: Thinking card create, reply patch, error card patch, text fallback patch
- All 3 new test files fail RED; existing health.test.ts and webhook.test.ts remain GREEN (14 tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @anthropic-ai/sdk and create claude.test.ts scaffold** - `66871c5` (test)
2. **Task 2: Extend cards.test.ts and create chatEvent.test.ts scaffold** - `2fc8841` (test)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `src/__tests__/claude.test.ts` - 7 failing stubs for callClaude (model, system prompt, timeout, return, error types)
- `src/__tests__/chatEvent.test.ts` - 4 failing stubs for handleChatEvent async lifecycle
- `src/__tests__/cards.test.ts` - Extended with buildReplyCard (3 stubs) and buildErrorCard (3 stubs)
- `package.json` - Added @anthropic-ai/sdk ^0.78.0 to dependencies
- `package-lock.json` - Updated lock file

## Decisions Made
- Wave 0 TDD: deliberately import non-existent modules so tests fail RED before implementation begins — this is the correct state for Plans 02 and 03 to target
- Used `jest.MockedClass<typeof Anthropic>` pattern to mock SDK constructor and access `prototype.messages`
- chatEvent.test.ts uses `await new Promise(resolve => setImmediate(resolve))` to flush the async block inside handleChatEvent before asserting mock calls

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wave 0 gate in place: Plans 02 and 03 can implement their targets and watch tests turn GREEN
- anthropicClient.ts (Plan 02 target) must export `callClaude(prompt: string): Promise<string>`
- chatClient.ts (Plan 02 or 03 target) must export `{ chatClient: { spaces: { messages: { create, patch } } } }`
- cards.ts (Plan 02 or 03 target) must export `buildReplyCard(text: string)` and `buildErrorCard(msg: string)`

---
*Phase: 03-core-claude-integration*
*Completed: 2026-03-13*
