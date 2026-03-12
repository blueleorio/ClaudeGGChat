# Requirements: ClaudeGGChat

**Defined:** 2026-03-12
**Core Value:** Any SEV teammate can query Claude directly from Google Chat, in context, without leaving their workflow.

## v1 Requirements

### Webhook

- [ ] **HOOK-01**: Bot receives and parses `/claude [prompt]` slash command events from Google Chat
- [ ] **HOOK-02**: Bot returns HTTP 200 immediately (within ~3 seconds) and processes the Anthropic call asynchronously
- [ ] **HOOK-03**: Bot returns a usage hint card when `/claude` is invoked with no prompt text

### Security

- [ ] **SEC-01**: Every incoming webhook request is verified against Google's JWT bearer token before any processing
- [ ] **SEC-02**: Requests from spaces not in `ALLOWED_SPACE_IDS` are silently rejected (no Anthropic API call made)

### Context

- [ ] **CONT-01**: Bot fetches the last 10 messages from the current thread before calling Claude
- [ ] **CONT-02**: Bot filters out its own messages from thread context (by `sender.type === 'BOT'`)
- [ ] **CONT-03**: Thread context fetch failure (e.g. 403) is handled gracefully — Claude is called without context rather than failing

### Claude

- [ ] **CLDE-01**: Bot calls `claude-sonnet-4-6` with a SEV team system prompt and the user's prompt
- [ ] **CLDE-02**: Thread context messages are passed to Claude as context preceding the user prompt
- [ ] **CLDE-03**: Bot posts a "Thinking…" placeholder card immediately after receiving the command, then PATCHes it with Claude's reply
- [ ] **CLDE-04**: Anthropic rate limit errors (429/529) result in a user-facing error card rather than a silent failure
- [ ] **CLDE-05**: Anthropic timeout (25s budget) results in a user-facing error card

### Response

- [ ] **RESP-01**: Claude's reply is posted as a `cardsV2` Google Chat card with a "Claude" header
- [ ] **RESP-02**: Error replies (rate limit, timeout, auth failure, empty prompt) are posted as structured error cards
- [ ] **RESP-03**: If card schema fails, bot falls back to posting a plain-text message rather than silently failing

### Infrastructure

- [ ] **INFRA-01**: Server binds to `process.env.PORT` for Railway compatibility
- [ ] **INFRA-02**: `GET /health` endpoint returns HTTP 200 for Railway health checks
- [ ] **INFRA-03**: Startup validation fails loudly (process exits) if required env vars are missing (`ANTHROPIC_API_KEY`, `ALLOWED_SPACE_IDS`, `GOOGLE_SERVICE_ACCOUNT_KEY`)
- [ ] **INFRA-04**: Structured logging includes request ID, space ID, command, and response latency for each invocation

## v2 Requirements

### Enhancements

- **ENH-01**: "Thinking…" indicator updates in-place (configurable async message PATCH UX)
- **ENH-02**: Per-user allowlisting (requires persistence layer)
- **ENH-03**: Conversation memory across sessions (requires database)
- **ENH-04**: Multi-command routing (e.g. `/claude summarize`, `/claude translate`)

### Operations

- **OPS-01**: Cold-start mitigation via UptimeRobot or Railway always-on plan
- **OPS-02**: Admin slash command for bot health status
- **OPS-03**: Usage metrics dashboard

## Out of Scope

| Feature | Reason |
|---------|--------|
| DM support | Spaces-only for v1; simplifies access control |
| Streaming responses | Incompatible with synchronous webhook model without significant complexity |
| OAuth login per user | Service account is sufficient; per-user OAuth adds auth complexity |
| Mobile app / web UI | Google Chat is the UI |
| Conversation persistence | No database in v1 — stateless by design |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| HOOK-01 | Phase 2 | Pending |
| HOOK-02 | Phase 2 | Pending |
| HOOK-03 | Phase 2 | Pending |
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 2 | Pending |
| CLDE-01 | Phase 3 | Pending |
| CLDE-03 | Phase 3 | Pending |
| CLDE-04 | Phase 3 | Pending |
| CLDE-05 | Phase 3 | Pending |
| RESP-01 | Phase 3 | Pending |
| RESP-02 | Phase 3 | Pending |
| RESP-03 | Phase 3 | Pending |
| CONT-01 | Phase 4 | Pending |
| CONT-02 | Phase 4 | Pending |
| CONT-03 | Phase 4 | Pending |
| CLDE-02 | Phase 4 | Pending |
| INFRA-03 | Phase 4 | Pending |
| INFRA-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after roadmap creation*
