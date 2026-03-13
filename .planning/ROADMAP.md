# Roadmap: ClaudeGGChat

## Overview

ClaudeGGChat is built in four coarse phases that follow a hard dependency chain: infrastructure must exist before code can be tested, security must be correct before the Anthropic key is wired in, core bot value ships before thread context is added, and production hardening closes the v1. Each phase ends with a state that can be verified by a human using Google Chat.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: GCP & Railway Setup** - Provision infrastructure, register the bot, and confirm a live HTTPS endpoint before writing application code
- [x] **Phase 2: Secure Webhook Foundation** - Express server with JWT verification, space allowlist, async response pattern, and empty-prompt handling (completed 2026-03-13)
- [ ] **Phase 3: Core Claude Integration** - Full end-to-end bot: Thinking... placeholder, Anthropic API call, cardsV2 reply, and error handling
- [ ] **Phase 4: Thread Context + Production Hardening** - Thread context injection, startup validation, structured logging, and Railway health check

## Phase Details

### Phase 1: GCP & Railway Setup
**Goal**: A live public HTTPS endpoint exists on Railway, the Google Chat bot is registered in GCP, and a slash command pointing at that URL is verified to deliver events — all before any application logic is written
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. Railway deployment is live and `GET /health` returns HTTP 200 from a public URL
  2. GCP project has the Chat API enabled and a service account with a downloaded JSON key
  3. The `/claude` slash command is registered in Google Cloud Console pointing at the Railway HTTPS URL
  4. Sending `/claude test` in the authorized test space delivers a POST event to the Railway log (bot is reachable)
  5. Required environment variables (`ANTHROPIC_API_KEY`, `ALLOWED_SPACE_IDS`, `GOOGLE_SERVICE_ACCOUNT_KEY`) are set in Railway
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffold: Express server, health endpoint, tests, railway.json (autonomous)
- [x] 01-02-PLAN.md — Deploy to Railway, GCP Chat API setup, slash command registration, live event verification (human checkpoint)

### Phase 2: Secure Webhook Foundation
**Goal**: Users in authorized spaces who type `/claude [prompt]` receive an immediate acknowledgment, unauthorized spaces are silently rejected, and the async response pattern is proven before any slow API calls are added
**Depends on**: Phase 1
**Requirements**: HOOK-01, HOOK-02, HOOK-03, SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. Typing `/claude hello` in the authorized test space returns HTTP 200 within 3 seconds (visible in Railway logs, no Google Chat timeout error)
  2. Sending a `/claude` event from a space not in `ALLOWED_SPACE_IDS` produces no response and no Anthropic API call
  3. A request without a valid Google JWT bearer token is rejected before any handler runs
  4. Typing `/claude` with no prompt text returns a usage hint card in the thread
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Security middleware: JWT verification + space allowlist + test scaffold (autonomous)
- [x] 02-02-PLAN.md — Event handler: cards helper, chatEvent handler, index.ts wiring, Railway deploy + live verification (human checkpoint)

### Phase 3: Core Claude Integration
**Goal**: Any SEV teammate in an authorized space can type `/claude [prompt]` and receive Claude's reply posted as a Google Chat card — the full user-visible value delivered end-to-end without thread context
**Depends on**: Phase 2
**Requirements**: CLDE-01, CLDE-03, CLDE-04, CLDE-05, RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. Typing `/claude [prompt]` posts a "Thinking..." placeholder card in the thread immediately, then replaces it with Claude's reply as a cardsV2 card with a "Claude" header
  2. Claude's reply uses the SEV team system prompt (response is concise and team-assistant-appropriate)
  3. Triggering an Anthropic rate limit (429/529) results in a visible error card in the thread rather than a silent failure
  4. If the Anthropic call exceeds 25 seconds, a timeout error card appears in the thread
  5. If the card schema fails to post, the bot falls back to a plain-text message rather than disappearing silently
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Wave 0: install @anthropic-ai/sdk and create failing test scaffolds for all Phase 3 requirements (autonomous)
- [ ] 03-02-PLAN.md — Wave 1: anthropicClient.ts, systemPrompt.ts, chatClient.ts, and cards.ts extensions — makes tests GREEN (autonomous)
- [ ] 03-03-PLAN.md — Wave 2: expand chatEvent.ts async stub into full Thinking→Claude→PATCH lifecycle, Railway deploy, live verification (human checkpoint)

### Phase 4: Thread Context + Production Hardening
**Goal**: Claude receives the last 10 messages from the current thread as context before answering, the server fails loudly on bad configuration rather than silently misbehaving, and every invocation produces a structured log entry
**Depends on**: Phase 3
**Requirements**: CONT-01, CONT-02, CONT-03, CLDE-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. Claude's reply demonstrably incorporates thread context — asking "what did I just said?" after a previous message returns an accurate answer
  2. Bot's own previous messages are excluded from thread context (no self-referential noise)
  3. If the thread context fetch returns 403, the bot still calls Claude and posts a reply (without context) rather than failing
  4. Starting the server with a missing required env var causes an immediate process exit with a clear error message — not a runtime crash later
  5. Each invocation produces a log line containing request ID, space ID, command text, and response latency
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. GCP & Railway Setup | 2/2 | Complete    | 2026-03-12 |
| 2. Secure Webhook Foundation | 2/2 | Complete    | 2026-03-13 |
| 3. Core Claude Integration | 2/3 | In Progress|  |
| 4. Thread Context + Production Hardening | 0/TBD | Not started | - |
