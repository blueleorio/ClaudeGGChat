# Project Research Summary

**Project:** ClaudeGGChat — Google Chat slash command bot powered by Anthropic API
**Domain:** Google Workspace bot / AI assistant integration
**Researched:** 2026-03-12
**Confidence:** MEDIUM

## Executive Summary

ClaudeGGChat is a stateless Node.js HTTP server that receives Google Chat slash command events, fetches thread context via the Google Chat REST API, queries Claude via the Anthropic SDK, and posts a formatted card reply back to the thread. The domain is well-understood: Google Chat HTTP bots have a documented event model and stable card schema, and the Anthropic SDK is straightforward to use. The recommended stack is Node.js 20 LTS + TypeScript + Express, deployed on Railway with a service account for Google auth. The codebase will be small — six to eight modules — and the architecture is more about sequencing than complexity.

The single most important architectural decision in this project is the async response pattern. Google Chat enforces a hard ~3-second synchronous response deadline, but Anthropic API calls routinely take 5–20 seconds. The correct pattern is: respond immediately with HTTP 200 (posting a "Thinking..." placeholder via the Chat REST API), then fetch thread context and call Claude asynchronously, and finally PATCH the placeholder message with Claude's reply. Every other design decision follows from this constraint. Attempting to respond synchronously is the most common first-attempt failure and requires an architectural rewrite to fix.

The key risks are external-facing: Google Cloud Platform setup is consistently underestimated (budget 2–4 hours), JWT webhook verification is easy to skip and critical not to, and the Railway free tier's cold-start behavior can push total latency past the 30-second outer deadline. All three risks are preventable with upfront attention. The features are well-scoped per PROJECT.md: a single `/claude` command with thread context, a card-formatted reply, and space-level access control. No database, no streaming, no multi-command routing — keep it small.

---

## Key Findings

### Recommended Stack

The stack is minimal and deliberate. Node.js 20 LTS with TypeScript provides the right balance of ecosystem support and Railway compatibility. Express 4.x handles the single webhook route with no framework overhead. The `googleapis` package (not the newer `@google-cloud/chat`) is preferred for thread context fetching due to broader documentation coverage for slash command bots. The `google-auth-library` handles both incoming JWT verification and outgoing service account auth for REST API calls. The Anthropic SDK (`@anthropic-ai/sdk`) wraps API calls with proper TypeScript types and built-in error classification. Module system is CommonJS (not ESM) to avoid Railway nixpacks path resolution edge cases.

**Core technologies:**
- Node.js 20 LTS: runtime — LTS branch, Railway nixpacks default
- TypeScript 5.x: type safety — catches Google Chat event shape mismatches at compile time
- Express 4.x: HTTP server — single route, zero setup tax, maximal community examples
- `googleapis` ^144.x: Google Chat REST API client — thread message listing and message posting/patching
- `google-auth-library` ^9.x: dual-purpose — verify incoming Google JWT on webhook, authenticate outgoing REST API calls as service account
- `@anthropic-ai/sdk` ^0.39.x: Anthropic API — official SDK with typed errors and built-in retry
- `dotenv`: local development env loading — Railway injects vars natively in production

**Version caveat:** `@anthropic-ai/sdk` and `googleapis` version numbers are from training data. Run `npm view @anthropic-ai/sdk version` and `npm view googleapis version` before pinning.

### Expected Features

The feature set is small and well-defined. Thread context injection (fetching the last 10 messages before calling Claude) is the primary differentiator and is in scope for v1 per PROJECT.md.

**Must have (table stakes):**
- Slash command event handling — without this, no bot
- Async HTTP response (HTTP 200 immediately, async work after) — Google Chat 3-second deadline makes this mandatory
- Webhook JWT verification — security gate, no exceptions
- Space allowlist enforcement (`ALLOWED_SPACE_IDS`) — prevents unauthorized Anthropic spend
- Claude API call with SEV system prompt — core value delivery
- Card-formatted reply (`cardsV2`) — structured, attributed response in thread
- Error message to user on failure — silent failures erode trust
- Graceful empty-prompt handling — usage hint if `/claude` invoked with no arguments
- Rate limit handling — catch Anthropic 429/529, post user-facing error card

**Should have (differentiators for v1):**
- Thread context injection — fetches last 10 messages, passes as context to Claude; big quality improvement
- Structured error cards — visually intentional rather than broken-looking

**Defer to v2+:**
- "Thinking..." indicator via async message update — meaningful UX but requires async update pattern complexity
- Per-user allowlisting — needs persistence layer
- Interactive card buttons/dialogs — full event-loop rewrite
- Multi-command routing — single `/claude` covers the use case
- Conversation memory across sessions — requires database
- Streaming responses — not compatible with synchronous webhook model without significant complexity

### Architecture Approach

The bot is a stateless HTTP server running a two-phase request lifecycle. Phase 1 (synchronous, must complete in ~3 seconds): verify JWT, check space allowlist, parse slash command, POST a "Thinking..." placeholder message to the thread via REST API, return HTTP 200 with empty body. Phase 2 (async, no time limit): fetch thread context via `spaces.messages.list`, call Claude with system prompt + thread context + user prompt, PATCH the placeholder message with the Claude card response. Both phases share a single Railway process with no inter-process communication needed.

**Major components:**
1. HTTP Server (`src/server.ts`) — binds to `process.env.PORT`, mounts routes, health check at `GET /health`
2. Request Verifier middleware (`src/middleware/verify.ts`) — validates Google Bearer JWT before any other processing
3. Space Allowlist middleware (`src/middleware/allowlist.ts`) — checks `event.space.name` against `ALLOWED_SPACE_IDS`
4. Slash Command Dispatcher (`src/handlers/dispatcher.ts`) — routes on `slashCommand.commandId`, handles empty-prompt case
5. Claude Handler (`src/handlers/claude.ts`) — orchestrates async flow: placeholder post, context fetch, Claude call, response patch
6. Context Fetcher (`src/services/contextFetcher.ts`) — calls `spaces.messages.list` with thread filter, filters bot's own messages, returns formatted context string
7. Claude Caller (`src/services/anthropic.ts`) — wraps `messages.create` with system prompt, timeout (25s), error classification
8. Response Poster (`src/services/chatPoster.ts`) — PATCHes placeholder message with card; falls back to plain-text error on card schema failure

**Key pattern:** Fire-and-forget async handler — after `res.json({})`, kick off `handleClaudeCommand(event).catch(err => console.error(...))`. Never `await` the Anthropic call inside the request handler.

### Critical Pitfalls

1. **Synchronous Anthropic call (3-second timeout violation)** — Respond HTTP 200 immediately, do all async work after. This is architectural; retrofitting is painful. Implement async-first from day one.
2. **Missing webhook JWT verification** — Add `google-auth-library` JWT middleware before any handler logic. Skipping it leaves the endpoint open to arbitrary Anthropic API calls at your cost.
3. **Thread context auth misconfiguration (403 from Chat API)** — The bot's service account can list messages in spaces it's a member of without domain-wide delegation. Use service account credentials directly with `chat.messages.readonly` scope. Handle 403 gracefully: skip context, still call Claude.
4. **Railway cold starts near timeout limit** — Use Railway's always-on/paid tier or keep the service alive with a lightweight uptime pinger (UptimeRobot free tier, every 5 minutes to `GET /health`).
5. **Railway port binding mismatch** — Always `app.listen(process.env.PORT || 3000)`. Hard-coded port 3000 produces a deployed-but-502 failure that is confusing to debug.
6. **GCP setup complexity underestimated** — Budget 2–4 hours for first-time Google Chat bot registration (GCP project, Chat API enable, service account, slash command registration, bot URL). Do this before writing code.

---

## Implications for Roadmap

Based on the dependency graph from ARCHITECTURE.md and the pitfall phase warnings, a 4-phase structure is recommended. The architecture research explicitly proposes a 6-layer build order; these map naturally to phases grouped by testability and external dependency milestones.

### Phase 0: GCP and Railway Setup (Infrastructure)

**Rationale:** Everything else is blocked on having a live HTTPS endpoint registered with Google Chat. GCP setup is the highest time-risk item (2–4 hours, opaque failure modes). Do this before writing any application code.
**Delivers:** Working Railway deployment with public HTTPS URL, GCP project with Chat API enabled, service account with key, slash command `/claude` registered in Google Cloud Console pointing at Railway URL, bot added to an authorized test space.
**Addresses:** No features yet — this is the runway for all subsequent phases.
**Avoids:** Pitfall 9 (GCP complexity), Pitfall 5 (Railway port binding — verify at this step), Pitfall 12 (env vars set before first deploy).

### Phase 1: Secure Webhook Foundation

**Rationale:** Security gating and the async response pattern must be correct from the first real request. These are not things to add later — they are architectural. Establishing them first means all subsequent phases build on a solid, secure base.
**Delivers:** Express server that receives Google Chat slash command events, verifies JWT, checks space allowlist, returns HTTP 200 immediately (empty body), logs event shape. No Anthropic call yet — just a proven, secure webhook that responds within deadline.
**Uses:** Express 4.x, `google-auth-library`, `dotenv`, Railway `process.env.PORT`.
**Implements:** HTTP Server, Request Verifier middleware, Space Allowlist middleware, Slash Command Dispatcher (parse only, no routing logic yet).
**Avoids:** Pitfall 1 (30-second deadline — async pattern established), Pitfall 2 (JWT verification — wired in), Pitfall 7 (ALLOWED_SPACE_IDS applied before any work), Pitfall 5 (port binding).

### Phase 2: Core Claude Integration (Minimum Viable Bot)

**Rationale:** With a secure, working webhook, wire in the Anthropic API call. This phase delivers the first end-to-end user value: a user types `/claude [prompt]` and gets a Claude card reply. No thread context yet — that keeps the Anthropic integration isolated and testable.
**Delivers:** Full async handler: respond HTTP 200, POST "Thinking..." placeholder to thread via Chat REST API, call Claude with SEV system prompt and user prompt, PATCH placeholder with card response. Error handling for Anthropic 429/529 and timeout. Empty-prompt usage hint.
**Uses:** `@anthropic-ai/sdk` (25-second timeout configured), `googleapis` (for `spaces.messages.create` and `spaces.messages.patch`), `google-auth-library` (service account auth for outgoing REST calls).
**Implements:** Claude Handler, Claude Caller, Response Poster.
**Avoids:** Pitfall 6 (rate limit handling — wired in from start), Pitfall 10 (Anthropic timeout — set to 25s), Pitfall 11 (card format errors — simple TextParagraph widget), Pitfall 13 (service account JSON parsing at startup).

### Phase 3: Thread Context

**Rationale:** With the core bot working end-to-end, add the primary differentiator: thread context injection. This phase is isolated by design — the Context Fetcher is a pure service module that can be developed and tested with mocked API responses before integration.
**Delivers:** Context Fetcher that lists the last 10 messages from the current thread, filters out the bot's own messages (by `sender.type === 'BOT'`), formats them as a context preamble, and passes the enriched message to Claude. Falls back gracefully to no-context on 403 from Chat API.
**Uses:** `googleapis` `spaces.messages.list` with thread filter, `google-auth-library` with `chat.messages.readonly` scope.
**Implements:** Context Fetcher, updates Claude Handler to inject context.
**Avoids:** Pitfall 3 (service account auth for thread fetch — tested against real space early), Pitfall 8 (bot's own messages in context — filtered by sender type).

### Phase 4: Polish and Production Hardening

**Rationale:** Once all features work, address operational concerns before calling it production-ready. This phase has no new user-facing features but significantly improves reliability and debuggability.
**Delivers:** Structured startup validation (fail loudly if required env vars missing), structured logging (request ID, space ID, latency), Railway always-on plan or UptimeRobot pinger configured, card format fallback (if card PATCH fails, retry with plain text), health check endpoint verified, `railway.toml` committed for explicit build/start commands.
**Avoids:** Pitfall 4 (Railway cold starts), Pitfall 12 (env var validation at startup).

### Phase Ordering Rationale

- Phase 0 before Phase 1: The webhook URL must exist before JWT verification can be tested against real Google Chat events. GCP setup also produces the service account key needed for Phase 1.
- Phase 1 before Phase 2: Security must be correct before the Anthropic API key is wired in. The async response pattern must be established before any slow operations are added.
- Phase 2 before Phase 3: Core Claude integration should be proven end-to-end before adding the complexity of thread context fetching. A second Google Chat REST API call (context fetch) is easier to add to a working bot than to debug alongside a broken one.
- Phase 4 last: Hardening is additive. It improves a working system — it does not create one.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 0:** Google Cloud Console UI changes frequently. Verify current slash command registration flow against live Workspace developer docs before the setup session. The JWT verification method for HTTP bots (bearer token vs. full JWT) should also be confirmed against current docs.
- **Phase 3:** The exact `filter` syntax for `spaces.messages.list` by thread name (AIP-160 format) and whether PATCH on a bot-posted message updates in-place in the Chat UI should be verified against live Google Chat API docs before implementation.

Phases with standard patterns (skip research-phase):
- **Phase 1:** JWT verification with `google-auth-library` and Express middleware patterns are well-documented and stable.
- **Phase 2:** Anthropic SDK `messages.create` non-streaming call is the canonical usage pattern. Railway PORT binding is a one-liner.
- **Phase 4:** Standard Node.js startup validation and Railway health check patterns require no additional research.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core technologies (Node, Express, Anthropic SDK) are HIGH confidence. Package versions (`googleapis` ^144.x, `@anthropic-ai/sdk` ^0.39.x) are MEDIUM — verify with `npm view` before pinning. Railway nixpacks TypeScript handling is MEDIUM — verify with test deploy. |
| Features | HIGH | Feature set is tightly scoped by PROJECT.md (source of truth). Google Chat event model and card schema are stable since 2022. Feature decisions (what to defer) are clear and well-reasoned. |
| Architecture | MEDIUM | The async response pattern and component boundaries are HIGH confidence. The exact `spaces.messages.list` filter syntax and PATCH in-place behavior are MEDIUM — need live verification. |
| Pitfalls | HIGH | Most critical pitfalls (30-second deadline, JWT verification, Railway PORT, rate limits) are HIGH confidence from official documentation. Cold start and card format pitfalls are MEDIUM. |

**Overall confidence:** MEDIUM-HIGH — the critical decisions are well-founded; the gaps are specific API details that can be verified during Phase 3 planning.

### Gaps to Address

- **JWT verification method for HTTP bots:** Research cites two approaches (bearer token verification vs. full OIDC JWT via JWKS). Verify which Google currently requires for HTTP endpoint bots before Phase 1 implementation. Use `google-auth-library` `verifyIdToken` as the safe default.
- **`spaces.messages.list` thread filter syntax:** The AIP-160 filter `thread.name="spaces/X/threads/Y"` needs live verification before Phase 3. Also verify that `orderBy=createTime desc` with `pageSize=10` returns the correct 10 most recent messages.
- **PATCH message in-place behavior:** Confirm that PATCHing a message the bot created (not the synchronous HTTP response) updates it in-place in the Google Chat UI, rather than creating a new message. This determines whether the "Thinking..." placeholder UX works as expected.
- **Package versions:** Run `npm view @anthropic-ai/sdk version` and `npm view googleapis version` before the first install. Do not pin versions from research documents.
- **Railway nixpacks TypeScript:** Do a smoke-deploy in Phase 0 to confirm nixpacks detects and compiles TypeScript correctly. If it does not, commit a `railway.toml` with explicit build/start commands (template provided in STACK.md).

---

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — project scope, requirements, technology constraints (source of truth)
- Google Chat API v1 documentation (training data, cutoff Aug 2025) — event payload structure, card schema, slash command registration
- Railway deployment documentation (training data) — PORT injection, nixpacks Node.js detection, health check behavior
- Anthropic SDK documentation (training data) — `messages.create` API shape, error types (`RateLimitError`, `APIConnectionTimeoutError`)

### Secondary (MEDIUM confidence)
- Training data: `google-auth-library` JWT verification patterns for HTTP bots
- Training data: `googleapis` `spaces.messages.list` filter syntax and ordering behavior
- Training data: Railway nixpacks TypeScript compilation behavior
- Training data: Google Chat card V2 schema strictness and character escaping requirements

### Tertiary (LOW confidence — verify before use)
- `@anthropic-ai/sdk` version ^0.39.x — run `npm view @anthropic-ai/sdk version` to confirm
- `googleapis` version ^144.x — run `npm view googleapis version` to confirm
- Railway cold-start duration estimates (5–15 seconds) — plan-dependent, verify against current Railway docs

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
