---
phase: 1
slug: gcp-railway-setup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (or supertest for HTTP endpoint testing) |
| **Config file** | jest.config.ts — Wave 0 installs |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | INFRA-01 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | INFRA-02 | integration | `npm test` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | INFRA-01 | manual | Railway deploy check | N/A | ⬜ pending |
| 1-01-04 | 01 | 1 | INFRA-02 | manual | `curl /health` on live URL | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/index.ts` — Express server binding to `process.env.PORT` with `/health` endpoint
- [ ] `src/__tests__/health.test.ts` — supertest tests for INFRA-01 and INFRA-02
- [ ] `jest`, `supertest`, `@types/jest`, `@types/supertest` — install if not present

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Railway deployment is live and returns HTTP 200 | INFRA-01, INFRA-02 | Requires cloud deploy and live URL | Deploy to Railway, run `curl https://<app>.up.railway.app/health` and confirm 200 |
| GCP Chat API enabled and service account key downloaded | INFRA-01 | GCP Console UI interaction | Log into GCP Console, navigate to APIs & Services > Chat API, verify enabled and service account JSON downloaded |
| `/claude` slash command registered in GCP Console | INFRA-02 | GCP Console UI interaction | Navigate to Chat API > Configuration, confirm slash command with Railway URL is registered |
| `/claude test` delivers POST event to Railway log | INFRA-02 | Requires live GCP + Railway integration | Send `/claude test` from authorized Google Chat space, inspect Railway service logs for POST event |
| Railway env vars set (`ANTHROPIC_API_KEY`, `ALLOWED_SPACE_IDS`, `GOOGLE_SERVICE_ACCOUNT_KEY`) | INFRA-01 | Railway dashboard configuration | Open Railway service variables panel and confirm all three vars are present |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
