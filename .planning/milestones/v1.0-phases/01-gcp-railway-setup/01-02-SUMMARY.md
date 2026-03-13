---
phase: 01-gcp-railway-setup
plan: "02"
subsystem: infra
tags: [railway, gcp, google-chat, express, nodejs]

# Dependency graph
requires:
  - phase: 01-gcp-railway-setup/01-01
    provides: Express server with /health endpoint and POST placeholder, compiled to dist/index.js, railway.json config

provides:
  - Live HTTPS Railway deployment at https://claudeggchat-production.up.railway.app
  - GCP project with Google Chat API enabled
  - Service account (claudeggchat-bot) with JSON key stored in Railway
  - /claude slash command registered (command ID 1) pointing at Railway URL
  - All 4 required env vars set in Railway (ANTHROPIC_API_KEY, ALLOWED_SPACE_IDS, GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_CLOUD_PROJECT_NUMBER)
  - Confirmed end-to-end: Google Chat delivers POST events to Railway, visible in logs

affects:
  - 02-bot-response (needs Railway URL, GCP project number for JWT verification)
  - all future phases (infrastructure is the base)

# Tech tracking
tech-stack:
  added: [Railway (Node.js hosting), GCP Google Chat API, GCP Service Accounts]
  patterns: [Railway deploy-from-GitHub with railway.json, GCP Authentication Audience = Project Number for JWT verification]

key-files:
  created: []
  modified: [.gitignore (hardened with *.env, .env*, *.json.key patterns)]

key-decisions:
  - "Authentication Audience in GCP Chat config set to Project Number (numeric) — required for Phase 2 OIDC JWT verification; audience value will be GOOGLE_CLOUD_PROJECT_NUMBER env var"
  - "Service account JSON key stored entirely as GOOGLE_SERVICE_ACCOUNT_KEY Railway env var (no file on disk)"
  - "Railway HTTPS domain generated via Railway dashboard Networking > Generate Domain"
  - "Bot installed in test space spaces/AAAA8WYwwy4 for integration verification"

patterns-established:
  - "GCP auth pattern: Google Chat sends JWT with audience = numeric project number; Phase 2 must verify against GOOGLE_CLOUD_PROJECT_NUMBER"
  - "Railway env vars as secret store: all credentials (Anthropic key, GCP key JSON, space allowlist) injected at runtime, never committed"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: ~2h (manual GCP + Railway dashboard steps)
completed: 2026-03-12
---

# Phase 1 Plan 02: GCP & Railway Deployment Summary

**Railway Express server live at HTTPS with Google Chat /claude slash command delivering POST events end-to-end — infrastructure chain verified**

## Performance

- **Duration:** ~2 hours (manual dashboard steps — GCP Console + Railway UI)
- **Started:** 2026-03-12
- **Completed:** 2026-03-12
- **Tasks:** 4 of 4
- **Files modified:** 1 (.gitignore hardened)

## Accomplishments

- Railway service deployed and serving HTTPS — `GET /health` returns HTTP 200 from `https://claudeggchat-production.up.railway.app`
- GCP project configured with Google Chat API enabled, service account created, JSON key stored as Railway env var
- `/claude` slash command registered (ID 1) pointing at the Railway HTTPS URL with Authentication Audience = Project Number
- Full integration verified: user typed "Hello" in Google Chat test space, Railway logs showed the full POST event body including message text
- All 4 required env vars confirmed present in Railway Variables panel

## Task Commits

Tasks 2-4 were human-action checkpoints (Railway + GCP Console + live verification). Task 1 was automated.

1. **Task 1: Initialize git repo and push to GitHub** - `5826054` (chore: .gitignore hardened)
2. **Task 2: Deploy to Railway** - Human action (Railway dashboard)
3. **Task 3: GCP project setup** - Human action (GCP Console + Railway Variables)
4. **Task 4: Live integration verification** - Human verified (Google Chat event in Railway logs)

## Infrastructure Details

- **Railway URL:** https://claudeggchat-production.up.railway.app
- **GCP project number:** stored as `GOOGLE_CLOUD_PROJECT_NUMBER` Railway env var (numeric)
- **Authentication Audience:** Project Number (NOT HTTP endpoint URL — critical for Phase 2 JWT)
- **Test space ID:** spaces/AAAA8WYwwy4
- **Bot installed in:** authorized Google Chat test space

## Env Vars Confirmed in Railway

| Variable | Status |
|----------|--------|
| `ANTHROPIC_API_KEY` | Set |
| `ALLOWED_SPACE_IDS` | Set (includes spaces/AAAA8WYwwy4) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Set (full JSON contents) |
| `GOOGLE_CLOUD_PROJECT_NUMBER` | Set (numeric project number) |

## Decisions Made

- **Authentication Audience = Project Number:** GCP Chat API configuration uses numeric project number as the JWT audience. Phase 2 OIDC verification must use `GOOGLE_CLOUD_PROJECT_NUMBER` as the expected audience value. This resolves the Phase 1 blocker about JWT verification method.
- **Service account key as Railway env var:** JSON key file was immediately stored in Railway Variables and the local file discarded — no secrets ever committed to git.
- **Test space ID spaces/AAAA8WYwwy4:** The authorized space for live testing. `ALLOWED_SPACE_IDS` includes this value.

## Deviations from Plan

None — plan executed exactly as written. All human-action checkpoints completed successfully on first attempt.

## Issues Encountered

None. Railway deployment succeeded on first push. GCP Chat API configuration accepted. Live event delivery confirmed without debugging.

## Next Phase Readiness

Phase 2 (bot response — Anthropic integration + JWT verification) can start immediately.

**Critical context for Phase 2:**
- JWT verification audience = value of `GOOGLE_CLOUD_PROJECT_NUMBER` (numeric project number, not string project ID)
- Google Chat sends bearer token in `Authorization` header; Phase 2 must verify this OIDC JWT before processing any event
- `ALLOWED_SPACE_IDS` is already set — Phase 2 space authorization check has its data
- `ANTHROPIC_API_KEY` is already set — Anthropic client can be initialized in Phase 2
- Current POST handler returns `{"text":"OK"}` placeholder; Phase 2 replaces this with real Claude responses

---
*Phase: 01-gcp-railway-setup*
*Completed: 2026-03-12*
