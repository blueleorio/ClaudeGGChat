---
phase: 03-core-claude-integration
plan: 02
subsystem: api
tags: [anthropic, claude, google-chat, googleapis, typescript]

# Dependency graph
requires:
  - phase: 03-01
    provides: Wave 0 test stubs for anthropicClient, cards, and chatEvent (RED state)
  - phase: 02-secure-webhook-foundation
    provides: express app with JWT-verified webhook endpoint and chatEvent handler

provides:
  - callClaude() function calling claude-sonnet-4-6 with SEV_SYSTEM_PROMPT and 25s timeout
  - SEV_SYSTEM_PROMPT string constant
  - chatClient Google Chat API singleton with chat.bot scope
  - buildReplyCard() and buildErrorCard() card builder functions

affects:
  - 03-03-chatEvent-integration
  - any module importing from src/claude or src/chat

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk ^0.78.0"]
  patterns:
    - Module-level singleton initialization (anthropicClient, chatClient)
    - Module-level env guard (throw at import time if required env var missing)
    - No try/catch in callClaude — error propagation to callers
    - cardsV2 response shape with cardId, header, sections/widgets structure

key-files:
  created:
    - src/claude/anthropicClient.ts
    - src/claude/systemPrompt.ts
    - src/chat/chatClient.ts
  modified:
    - src/chat/cards.ts

key-decisions:
  - "callClaude does NOT catch SDK errors — callers (chatEvent.ts) handle Anthropic error classes"
  - "chatClient singleton calls getChatClient() at module load time; tests mock the module so real GOOGLE_SERVICE_ACCOUNT_KEY is never needed in test env"
  - "ANTHROPIC_API_KEY guard throws at import time so misconfigured deployments fail loudly on startup"

patterns-established:
  - "Module-level singleton pattern: instantiate at module scope, export the instance"
  - "Env var guard pattern: throw at load time if required env var is missing"

requirements-completed: [CLDE-01, CLDE-04, CLDE-05, RESP-01, RESP-02]

# Metrics
duration: 6min
completed: 2026-03-13
---

# Phase 3 Plan 02: Core Module Implementation Summary

**Anthropic client singleton (claude-sonnet-4-6, SEV_SYSTEM_PROMPT, 25s timeout), Google Chat API singleton (chat.bot scope), and extended cards helper (buildReplyCard + buildErrorCard) — all four modules GREEN**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-13T02:51:18Z
- **Completed:** 2026-03-13T02:57:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created callClaude() calling claude-sonnet-4-6 model with SEV_SYSTEM_PROMPT and 25-second per-request timeout
- Created chatClient singleton built from GOOGLE_SERVICE_ACCOUNT_KEY with chat.bot scope
- Extended cards.ts with buildReplyCard() and buildErrorCard() returning properly structured cardsV2 bodies
- claude.test.ts (7 tests) and cards.test.ts (all 3 describe blocks) are now GREEN

## Task Commits

1. **Task 1: Create anthropicClient.ts and systemPrompt.ts** - `0ce36ce` (feat)
2. **Task 2: Create chatClient.ts and extend cards.ts** - `c05ea5a` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `src/claude/systemPrompt.ts` - SEV_SYSTEM_PROMPT string constant
- `src/claude/anthropicClient.ts` - callClaude() function with Anthropic singleton
- `src/chat/chatClient.ts` - Google Chat API singleton with chat.bot scope
- `src/chat/cards.ts` - Extended with buildReplyCard() and buildErrorCard()

## Decisions Made

- callClaude does NOT catch SDK errors — all error handling delegated to callers (chatEvent.ts)
- chatClient singleton is instantiated at module load time; tests mock the entire module
- ANTHROPIC_API_KEY guard is module-level — missing key causes import-time failure (fail loudly)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All modules needed by Plan 03-03 are now available
- chatEvent.ts can now import callClaude, chatClient, buildReplyCard, buildErrorCard
- chatEvent.test.ts (4 tests) remains RED awaiting Plan 03-03 implementation

---
*Phase: 03-core-claude-integration*
*Completed: 2026-03-13*
