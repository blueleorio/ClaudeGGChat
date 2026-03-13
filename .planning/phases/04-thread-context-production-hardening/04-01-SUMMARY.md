---
phase: 04-thread-context-production-hardening
plan: 01
subsystem: testing
tags: [jest, tdd, typescript, red-green]

# Dependency graph
requires:
  - phase: 03-core-claude-integration
    provides: chatEvent handler, callClaude function, chatClient mock patterns established in Phase 3
provides:
  - TDD RED gate for Phase 4: all new behavior expressed as failing tests before implementation
  - validateEnv.test.ts with 4 stubs covering INFRA-03 (process.exit on missing vars)
  - chatEvent.test.ts with 5 new stubs covering CONT-01, CONT-02, CONT-03, CLDE-02 wiring, INFRA-04
  - claude.test.ts with 1 new failing stub for CLDE-02 (context param ordering)
  - setup.ts ALLOWED_SPACE_IDS stub so validateEnv tests start from known env state
affects:
  - 04-02 (implementation plan that turns these RED tests GREEN)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@ts-expect-error used on new test calls that reference not-yet-extended signatures, allowing compile while keeping RED"
    - "jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error }) prevents Jest process termination in validateEnv tests"
    - "mockList default in beforeEach (mockResolvedValue with empty messages) prevents test bleed between stubs"

key-files:
  created:
    - src/__tests__/validateEnv.test.ts
  modified:
    - src/__tests__/setup.ts
    - src/__tests__/chatEvent.test.ts
    - src/__tests__/claude.test.ts

key-decisions:
  - "@ts-expect-error on callClaude('prompt', context) call allows existing 7 tests to compile+run while new CLDE-02 test stays RED at runtime"
  - "CONT-03 test asserts callClaude called with empty array [] on list rejection — tests graceful degradation not hard failure"
  - "INFRA-04 test uses consoleSpy to find JSON log line by parsing call args — robust to other console.log calls in handler"

patterns-established:
  - "Wave 0 TDD gate: all Phase 4 behavior expressed as failing tests before any production module is written"
  - "mockList.mockResolvedValue default in beforeEach prevents state leakage between list-related tests"

requirements-completed: [CONT-01, CONT-02, CONT-03, CLDE-02, INFRA-03, INFRA-04]

# Metrics
duration: 18min
completed: 2026-03-13
---

# Phase 4 Plan 01: Phase 4 Failing Test Scaffold (Wave 0 TDD Gate) Summary

**Failing test stubs for thread context (CONT-01/02/03), Claude context param (CLDE-02), structured logging (INFRA-04), and startup env validation (INFRA-03) establish RED gate before any implementation exists**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-03-13T08:10:00Z
- **Completed:** 2026-03-13T08:28:00Z
- **Tasks:** 1 (all file changes committed atomically as single Wave 0 commit)
- **Files modified:** 4

## Accomplishments

- Created `validateEnv.test.ts` with 4 failing stubs covering INFRA-03 — suite fails to compile because `../utils/validateEnv` does not exist yet (expected RED)
- Updated `chatEvent.test.ts`: added `list: jest.fn()` to mock factory, `mockList` reference, default `mockResolvedValue({data:{messages:[]}})` in `beforeEach`, `message.name` in `makeMockReq`, and 5 new failing stubs; existing 5 tests remain GREEN
- Updated `claude.test.ts`: added 1 failing stub for CLDE-02 (context ordering) using `@ts-expect-error` to preserve compile; existing 7 tests remain GREEN; backward-compat test passes immediately
- Updated `setup.ts`: added `ALLOWED_SPACE_IDS = 'spaces/X'` stub so validateEnv tests start from known env state

## Task Commits

1. **Wave 0 failing stubs (all files)** - `3c81e2f` (test)

## Files Created/Modified

- `src/__tests__/validateEnv.test.ts` — 4 failing stubs for INFRA-03 startup env validation; imports non-existent `../utils/validateEnv`
- `src/__tests__/chatEvent.test.ts` — added list mock + 5 new failing stubs (CONT-01, CONT-02, CONT-03, CLDE-02 wiring, INFRA-04)
- `src/__tests__/claude.test.ts` — added 1 failing stub (CLDE-02 context ordering), 1 immediately-passing backward-compat stub
- `src/__tests__/setup.ts` — added `ALLOWED_SPACE_IDS` env stub

## Decisions Made

- Used `@ts-expect-error` on the `callClaude('prompt', context)` call in claude.test.ts so TypeScript does not block the entire test suite from running — existing 7 tests must remain GREEN while the new test stays RED at runtime assertion level
- CONT-03 test checks `callClaude` called with empty `[]` context on list rejection — confirms graceful degradation not silent failure
- INFRA-04 test uses `consoleSpy.mock.calls.find(call => JSON.parse(call[0]))` pattern — robust to any other console.log calls the handler may emit

## Deviations from Plan

None — plan executed exactly as written. The `@ts-expect-error` approach for the CLDE-02 test call was implied by the plan's note that "existing tests must still pass after signature extension" and is consistent with TDD RED-only phase intent.

## Issues Encountered

The TypeScript compile error (`TS2554: Expected 1 arguments, but got 2`) on the new CLDE-02 test call would have caused the entire claude.test.ts suite to fail to run (blocking existing GREEN tests). Added `@ts-expect-error` directive to allow compile while keeping the test RED at runtime assertion level — resolved within the task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RED state confirmed: `npx jest` exits non-zero (6 new test failures, validateEnv suite won't compile)
- Existing 38 tests remain GREEN — no regressions
- Plan 02 can now implement the production modules to turn these tests GREEN: `src/utils/validateEnv.ts`, updated `chatEvent.ts` (list call + context filtering + logging), updated `anthropicClient.ts` (context param)

---
*Phase: 04-thread-context-production-hardening*
*Completed: 2026-03-13*
