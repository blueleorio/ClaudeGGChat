---
phase: 3
slug: core-claude-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 with ts-jest |
| **Config file** | `package.json` (`"jest": { "preset": "ts-jest", ... }`) |
| **Quick run command** | `npx jest --testPathPattern="(cards\|claude\|chatEvent)"` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern="(cards|claude|chatEvent)"`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | CLDE-01 | unit | `npx jest --testPathPattern=claude` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 0 | CLDE-04, CLDE-05 | unit | `npx jest --testPathPattern=claude` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | RESP-01, RESP-02 | unit | `npx jest --testPathPattern=cards` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | CLDE-03 | unit | `npx jest --testPathPattern=chatEvent` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | RESP-03 | unit | `npx jest --testPathPattern=chatEvent` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/claude.test.ts` — stubs for CLDE-01, CLDE-04, CLDE-05 (mock `@anthropic-ai/sdk`)
- [ ] `src/__tests__/chatEvent.test.ts` — covers CLDE-03, RESP-03 (mock `chatClient` and `callClaude`)
- [ ] `src/__tests__/cards.test.ts` — covers RESP-01, RESP-02 (`buildReplyCard`, `buildErrorCard`)
- [ ] `npm install @anthropic-ai/sdk` — not yet in `package.json`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `updateMask: 'cardsV2'` actually updates the message in Google Chat | CLDE-03 | Requires live Chat API; low-confidence field name casing | Send `/claude test` in authorized space; verify "Thinking..." card is replaced (not stuck) |
| Claude reply posts as cardsV2 with "Claude" header visible in Chat UI | RESP-01 | Live Chat UI rendering can't be automated | Send `/claude hello`; verify card shows "Claude" header in Google Chat |
| Rate limit error card appears in thread (not silent failure) | CLDE-04 | Requires live Anthropic 429 or forced mock | Temporarily set invalid API key; verify error card appears in Chat thread |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
