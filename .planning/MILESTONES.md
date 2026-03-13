# Milestones

## v1.0 MVP (Shipped: 2026-03-13)

**Phases completed:** 4 phases, 10 plans
**LOC:** 413 production TypeScript, 1,178 total (incl. tests)
**Tests:** 48 automated tests, all passing
**Timeline:** 2 days (2026-03-12 → 2026-03-13)

**Key accomplishments:**
- Express/TypeScript server on Railway with OIDC JWT auth and space allowlist — live HTTPS endpoint receiving Google Chat events
- Secure async webhook foundation — 200 acknowledged within 3s, setImmediate pattern prevents Google Chat timeouts
- Full Claude integration — Thinking→reply lifecycle with cardsV2, rate limit/timeout error cards, RESP-03 plain-text fallback
- Thread context injection — AIP-160 filter with client-side fallback, BOT/self-message exclusion, graceful 403 handling
- Startup env validation (process.exit on missing vars) + structured JSON logging per invocation (requestId, spaceId, command, latencyMs)
- End-to-end verified live in Google Chat: `/claude what did I just say?` correctly references prior thread messages

---

