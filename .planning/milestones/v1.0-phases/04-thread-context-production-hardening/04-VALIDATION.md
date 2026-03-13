---
phase: 4
slug: thread-context-production-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + ts-jest |
| **Config file** | `package.json` (`jest` key) — `preset: ts-jest`, `testMatch: **/__tests__/**/*.test.ts`, `setupFiles: ./src/__tests__/setup.ts` |
| **Quick run command** | `npx jest --testPathPattern=chatEvent\|claude` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=chatEvent|claude`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | CONT-01 | unit | `npx jest --testPathPattern=chatEvent` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 0 | CONT-02 | unit | `npx jest --testPathPattern=chatEvent` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 0 | CONT-03 | unit | `npx jest --testPathPattern=chatEvent` | ❌ W0 | ⬜ pending |
| 4-01-04 | 01 | 0 | CLDE-02 | unit | `npx jest --testPathPattern=claude` | ❌ W0 | ⬜ pending |
| 4-01-05 | 01 | 0 | INFRA-03 | unit | `npx jest --testPathPattern=validateEnv` | ❌ W0 | ⬜ pending |
| 4-01-06 | 01 | 0 | INFRA-04 | unit | `npx jest --testPathPattern=chatEvent` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | CONT-01, CONT-02, CONT-03, CLDE-02 | unit | `npx jest --testPathPattern=chatEvent\|claude` | ✅ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | INFRA-03 | unit | `npx jest --testPathPattern=validateEnv` | ✅ W0 | ⬜ pending |
| 4-02-03 | 02 | 1 | INFRA-04 | unit | `npx jest --testPathPattern=chatEvent` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/chatEvent.test.ts` — add `list: jest.fn()` to chatClient mock + 6 new test stubs for CONT-01, CONT-02, CONT-03, INFRA-04
- [ ] `src/__tests__/claude.test.ts` — add 2 new test stubs for CLDE-02 (context param passed to SDK; default empty context works)
- [ ] `src/__tests__/validateEnv.test.ts` — new test file, stubs for INFRA-03 (missing vars → exit(1); all vars present → no exit)
- [ ] `src/__tests__/setup.ts` — add `ALLOWED_SPACE_IDS` env var stub so INFRA-03 tests start from a known env state

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude's reply incorporates thread context end-to-end | CONT-01, CLDE-02 | Requires live Google Chat + Railway + real Anthropic API | Send a message in authorized space, then `/claude what did I just say?` — verify reply references the prior message |
| 403 on context fetch still produces a Claude reply | CONT-03 | Requires simulating a 403 from Google Chat API in production | Temporarily revoke `chat.bot` scope from service account, invoke `/claude test`, verify reply still appears without context |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
