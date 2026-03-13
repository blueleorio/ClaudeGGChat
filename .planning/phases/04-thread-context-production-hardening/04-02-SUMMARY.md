---
phase: 04-thread-context-production-hardening
plan: 02
subsystem: api
tags: [anthropic, google-chat, thread-context, structured-logging, env-validation]

# Dependency graph
requires:
  - phase: 04-01
    provides: Wave 0 failing test stubs for INFRA-03, CONT-01/02/03, CLDE-02, INFRA-04
provides:
  - validateEnv() startup validation — exits 1 on missing ANTHROPIC_API_KEY, ALLOWED_SPACE_IDS, or GOOGLE_SERVICE_ACCOUNT_KEY
  - callClaude(prompt, context?) — optional ContextMessage[] parameter spreads prior messages before user prompt
  - chatEvent thread context fetch with AIP-160 filter, BOT/self-message exclusion, and graceful 403 fallback
  - JSON structured log line per request with requestId, spaceId, command, latencyMs, status
affects:
  - 04-03 (integration/e2e verification plan)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Best-effort context fetch inside setImmediate async block with silent catch (CONT-03)
    - ContextMessage type exported from anthropicClient for cross-module contract
    - randomUUID from node:crypto for request correlation IDs (no dependency)
    - JSON.stringify structured logging after PATCH completes to include full latency

key-files:
  created:
    - src/utils/validateEnv.ts
  modified:
    - src/claude/anthropicClient.ts
    - src/handlers/chatEvent.ts
    - src/index.ts
    - src/__tests__/claude.test.ts

key-decisions:
  - "validateEnv() in require.main guard only — not at module-load level — to avoid breaking supertest imports"
  - "ContextMessage type exported from anthropicClient.ts so chatEvent.ts can import without circular deps"
  - "Thread context fetch is Step 0 inside setImmediate block — not before setImmediate — to not block the 200 ACK"
  - "Structured log emits in both success path (after cardsV2 or text fallback PATCH) and error path (both PATCHes fail)"
  - "Triggering command message excluded by message.name match — prevents Claude seeing its own invocation as context"

patterns-established:
  - "Step 0 before Thinking card: always fetch context before any mutation so context is fresh"
  - "Best-effort pattern: wrap external fetch in try/catch with empty fallback; never propagate context errors"
  - "Latency measured from top of async block to after PATCH completes — includes full roundtrip"

requirements-completed: [CONT-01, CONT-02, CONT-03, CLDE-02, INFRA-03, INFRA-04]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 4 Plan 02: Thread Context + Production Hardening — Implementation Summary

**Thread context injection, startup env validation, and per-request JSON structured logging using only Node.js built-ins (crypto.randomUUID)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-13T08:29:07Z
- **Completed:** 2026-03-13T08:35:10Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- validateEnv() created and wired: exits process on any of 3 missing required env vars, safely guarded behind require.main so tests don't break
- callClaude extended with optional context parameter: ContextMessage[] spreads before user prompt, backward compatible, all 9 tests pass
- chatEvent async block fully expanded: AIP-160 thread filter → client-side fallback → BOT exclusion → callClaude with context → PATCH → JSON log with latency

## Task Commits

Each task was committed atomically:

1. **Task 1: Create validateEnv.ts and wire into index.ts** - `a3c21fb` (feat)
2. **Task 2: Extend callClaude with optional context parameter** - `d13dacf` (feat)
3. **Task 3: Expand chatEvent.ts async block** - `2f2dd54` (feat)

## Files Created/Modified

- `src/utils/validateEnv.ts` - Startup env validation, process.exit(1) on missing vars (INFRA-03)
- `src/claude/anthropicClient.ts` - ContextMessage type export, callClaude context param (CLDE-02)
- `src/handlers/chatEvent.ts` - Thread context fetch, context filtering, callClaude wiring, structured log (CONT-01/02/03, CLDE-02, INFRA-04)
- `src/index.ts` - validateEnv() call in require.main guard before app.listen
- `src/__tests__/claude.test.ts` - Removed now-invalid @ts-expect-error directive

## Decisions Made

- Used `import type { ContextMessage }` in chatEvent.ts to avoid any circular dependency risk
- Structured log emits in BOTH cardsV2-success and text-fallback-success paths (both count as `status: 'ok'`), only `status: 'error'` when both PATCHes fail
- Client-side fallback list fetch only triggered when AIP-160 filter returns empty AND threadName exists — avoids unnecessary API calls

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed stale @ts-expect-error directive in claude.test.ts**
- **Found during:** Task 2 (extend callClaude with context parameter)
- **Issue:** The test file had `@ts-expect-error: callClaude does not accept context yet` which became invalid once the context param was added — TypeScript treats unused @ts-expect-error as a compile error
- **Fix:** Removed the single-line comment directive; the line below it was already correctly typed
- **Files modified:** src/__tests__/claude.test.ts
- **Verification:** npx jest --testPathPattern=claude passes all 9 tests; npx tsc --noEmit exits 0
- **Committed in:** d13dacf (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test file)
**Impact on plan:** Necessary fix — stale directive would block TypeScript compilation. No scope creep.

## Issues Encountered

None — plan executed cleanly. The @ts-expect-error removal was anticipated by the plan comments ("RED test, Plan 02 adds the param").

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 6 requirements (CONT-01, CONT-02, CONT-03, CLDE-02, INFRA-03, INFRA-04) delivered
- Full test suite: 48 tests passing across 6 suites
- TypeScript: clean compile (npx tsc --noEmit exits 0)
- Phase 4 Plan 03 (deployment verification / e2e test on Railway) can proceed

---
*Phase: 04-thread-context-production-hardening*
*Completed: 2026-03-13*

## Self-Check: PASSED

- src/utils/validateEnv.ts: FOUND
- src/claude/anthropicClient.ts: FOUND
- src/handlers/chatEvent.ts: FOUND
- src/index.ts: FOUND
- Commit a3c21fb (Task 1): FOUND
- Commit d13dacf (Task 2): FOUND
- Commit 2f2dd54 (Task 3): FOUND
