---
phase: 02-secure-webhook-foundation
plan: "02"
subsystem: api
tags: [express, google-chat, cardsv2, jwt, railway, async-acknowledge]

# Dependency graph
requires:
  - phase: 02-01
    provides: verifyGoogleJwt and checkSpaceAllowlist middleware (JWT + space allowlist)
provides:
  - cardsV2 usage-hint card builder (src/chat/cards.ts)
  - Chat event handler with async-acknowledge pattern (src/handlers/chatEvent.ts)
  - Full Express middleware chain wired in index.ts
  - Live Railway deployment with Phase 2 behavior verified in Google Chat
affects:
  - 03-core-claude-integration (replaces setImmediate async stub with Anthropic API call)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - async-acknowledge pattern (res.json({}) before setImmediate for async work)
    - cardsV2 card builder returning typed object literal
    - slash command guard (check message.slashCommand presence before processing)

key-files:
  created:
    - src/chat/cards.ts
    - src/handlers/chatEvent.ts
  modified:
    - src/index.ts
    - src/middleware/verifyGoogleJwt.ts

key-decisions:
  - "JWT audience must be BOT_ENDPOINT (Railway URL) not GOOGLE_CLOUD_PROJECT_NUMBER — app is a Google Workspace Add-on, not a native Chat App"
  - "Issuer check relaxed to .endsWith('gserviceaccount.com') — Add-on service account format is service-{number}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com"
  - "setImmediate used (not process.nextTick or Promise) to guarantee res.json({}) flushes to Google Chat before any async work starts"
  - "void (async () => { ... })() inside setImmediate suppresses unhandled-promise lint warnings while keeping the fire-and-forget pattern"

patterns-established:
  - "Async-acknowledge: return 200 immediately, then fire-and-forget heavy work via setImmediate"
  - "Slash command guard: check req.body.message.slashCommand before any handler logic"
  - "Card builder: pure function returning typed object literal, no side effects"

requirements-completed: [HOOK-01, HOOK-02, HOOK-03]

# Metrics
duration: ~45min
completed: 2026-03-13
---

# Phase 2 Plan 02: Secure Webhook Foundation (Event Handler) Summary

**cardsV2 usage-hint card, async-acknowledge chat event handler, full Express middleware chain wired and live-verified on Railway — Phase 2 complete**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-12T~14:45Z (estimated)
- **Completed:** 2026-03-13
- **Tasks:** 3 (Tasks 1-2 automated, Task 3 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments

- Implemented `buildUsageHintCard()` in `src/chat/cards.ts` — returns cardsV2 object with cardId `usage-hint`, header title `Claude`, subtitle `Usage hint`, and example text
- Implemented `handleChatEvent` in `src/handlers/chatEvent.ts` with slash command guard, empty-prompt → usage hint card branch, and non-empty prompt → immediate 200 + setImmediate async stub
- Wired full middleware chain in `src/index.ts`: `app.post('/', verifyGoogleJwt, checkSpaceAllowlist, handleChatEvent)`
- Diagnosed and fixed JWT audience mismatch (BOT_ENDPOINT vs GOOGLE_CLOUD_PROJECT_NUMBER) for Google Workspace Add-on issuer
- All 19 tests pass; live Railway deployment confirmed by user in Google Chat

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement cards helper and chat event handler** - `4c88fc6` (test/RED), `2a73580` (feat/GREEN)
2. **Task 2: Wire middleware chain and deploy to Railway** - pushed to main (ee2c362 includes verifyGoogleJwt audience fix)
3. **Task 3: Live Google Chat verification** - CONFIRM (human checkpoint approved)

## Files Created/Modified

- `src/chat/cards.ts` - cardsV2 builder helper exporting `buildUsageHintCard()`
- `src/handlers/chatEvent.ts` - Chat event handler with async-acknowledge pattern and usage hint card
- `src/index.ts` - Full middleware chain wired: verifyGoogleJwt → checkSpaceAllowlist → handleChatEvent
- `src/middleware/verifyGoogleJwt.ts` - JWT audience updated to `BOT_ENDPOINT`; issuer check relaxed to `.endsWith('gserviceaccount.com')`

## Decisions Made

1. **JWT audience = BOT_ENDPOINT (Railway URL), not GOOGLE_CLOUD_PROJECT_NUMBER.** The app is configured as a Google Workspace Add-on, which issues OIDC tokens with the bot's HTTPS endpoint as the audience — not the project number. This is different from native Google Chat Apps. Required updating the Railway `BOT_ENDPOINT` env var and changing `verifyGoogleJwt.ts` accordingly.

2. **Issuer check relaxed to `.endsWith('gserviceaccount.com')`.** The Add-on service account issuer format is `service-{number}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`, not the generic Chat API format. Exact-match check rejected live events; suffix check handles both.

3. **`setImmediate` chosen over `Promise` for async stub.** Guarantees `res.json({})` is fully written to the socket before any async work begins, meeting Google Chat's 3-second timeout requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JWT audience mismatch for Google Workspace Add-on**
- **Found during:** Task 2 (live Railway deployment debugging)
- **Issue:** Plan specified audience = `GOOGLE_CLOUD_PROJECT_NUMBER` (numeric project ID), but live Google Chat events have audience = `BOT_ENDPOINT` (Railway HTTPS URL). App is a Workspace Add-on, not a native Chat App — different auth flow.
- **Fix:** Updated `verifyGoogleJwt.ts` to use `process.env.BOT_ENDPOINT` as audience. Added `BOT_ENDPOINT` env var to Railway (`https://claudeggchat-production.up.railway.app`). Relaxed issuer check from exact email match to `.endsWith('gserviceaccount.com')`.
- **Files modified:** `src/middleware/verifyGoogleJwt.ts`
- **Verification:** 19 tests still pass; live Google Chat events accepted and 200 returned within 3s
- **Committed in:** ee2c362 (part of Task 2 debug commits)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug: wrong JWT audience for Add-on auth flow)
**Impact on plan:** Essential fix for correctness — without it no live events would pass JWT verification. No scope creep.

## Issues Encountered

- Several iterative debug commits (`6f02871`, `8d1f800`, `2e560ff`, `a758ca9`, `672074a`, `ee2c362`) were made during live debugging of the JWT audience issue. These are in git history with informal messages. The underlying fix was identifying the Workspace Add-on vs. native Chat App distinction.

## User Setup Required

None — all Railway env vars (`BOT_ENDPOINT`, `GOOGLE_CLOUD_PROJECT_NUMBER`, `ALLOWED_SPACE_IDS`) were set during debugging. No additional manual steps required.

## Next Phase Readiness

Phase 3 can begin immediately:
- Full middleware chain is live and working: JWT verify → space allowlist → event handler
- `setImmediate` async stub in `handleChatEvent.ts` is the exact insertion point for Phase 3's Anthropic API call
- 19 tests provide regression coverage for all Phase 2 behaviors
- Railway deployment is stable at `https://claudeggchat-production.up.railway.app`

Carry-forward context for Phase 3:
- BOT_ENDPOINT Railway env var = `https://claudeggchat-production.up.railway.app` (used for JWT audience)
- ANTHROPIC_API_KEY env var already set in Railway (Phase 1)
- The async stub logs `Space: ..., Thread: ..., Prompt: "..."` — Phase 3 replaces this with Anthropic API call + cardsV2 reply post

---
*Phase: 02-secure-webhook-foundation*
*Completed: 2026-03-13*
