---
phase: 2
slug: secure-webhook-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + ts-jest (already installed from Phase 1) |
| **Config file** | `package.json` `jest` key (already configured) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | SEC-01 | unit | `npm test -- --testPathPattern=webhook` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 0 | SEC-01 | unit | `npm test -- --testPathPattern=webhook` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | SEC-01 | unit | `npm test -- --testPathPattern=webhook` | ❌ W0 | ⬜ pending |
| 2-01-04 | 01 | 1 | SEC-02 | unit | `npm test -- --testPathPattern=webhook` | ❌ W0 | ⬜ pending |
| 2-01-05 | 01 | 1 | SEC-02 | unit | `npm test -- --testPathPattern=webhook` | ❌ W0 | ⬜ pending |
| 2-01-06 | 01 | 1 | HOOK-01 | unit | `npm test -- --testPathPattern=webhook` | ❌ W0 | ⬜ pending |
| 2-01-07 | 01 | 1 | HOOK-02 | unit | `npm test -- --testPathPattern=webhook` | ❌ W0 | ⬜ pending |
| 2-01-08 | 01 | 1 | HOOK-03 | unit | `npm test -- --testPathPattern=webhook` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/webhook.test.ts` — stubs for SEC-01, SEC-02, HOOK-01, HOOK-02, HOOK-03

*Note: Jest 29, ts-jest, and supertest are already installed. No new framework installation needed. Only the test file itself must be created in Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/claude hello` in authorized space returns 200 within 3s | HOOK-01, HOOK-02 | Requires live Railway deployment + real Google JWT | Deploy to Railway, type `/claude hello` in test space, check Railway logs for HTTP 200 within 3 seconds |
| Unauthorized space produces no response | SEC-02 | Requires live deployment + real Chat event from non-listed space | Send event from space not in `ALLOWED_SPACE_IDS`, verify no response appears and no Anthropic call logged |
| `/claude` with no args shows usage hint card in thread | HOOK-03 | Requires live Chat UI to verify card rendering | Type `/claude` in authorized space, verify usage hint card appears in thread |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
