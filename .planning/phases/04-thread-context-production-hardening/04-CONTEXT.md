# Phase 4: Thread Context + Production Hardening - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Inject the last 10 thread messages as conversation history into Claude's context before answering, harden startup validation so missing env vars cause immediate process exit, and add structured per-invocation logging. Delivering thread context is the primary user-visible value; validation and logging are production hardening.

</domain>

<decisions>
## Implementation Decisions

### Thread context format
- Use conversation history format: prior messages become user/assistant turns in the `messages` array (not prepended to system prompt)
- All non-bot human messages map to `role: 'user'` — no sender name prefix, no per-sender identity tracking
- Include all text message types (plain text, other slash commands) — no filtering by message type beyond bot/triggering-command exclusions
- `callClaude()` signature extended to `callClaude(prompt: string, context?: Array<{role: 'user'|'assistant', content: string}>)` — optional context param, backwards compatible

### Message filtering scope
- Filter out bot messages (`sender.type === 'BOT'`) per CONT-02
- Also exclude the triggering `/claude` command message (by matching `m.name !== triggeringMsgName` where `triggeringMsgName = req.body?.chat?.appCommandPayload?.message?.name`) — avoids duplicating the prompt in context
- For thread context fetch: try AIP-160 filter (`thread.name=<threadName>`) first; fall back to listing all space messages and filtering client-side by `threadName` if filter returns empty or fails
- In all cases (fetch success, filter fallback, or 403): call Claude — context is best-effort (CONT-03)

### Structured logging
- Plain JSON `console.log(JSON.stringify({...}))` — no logging library, zero new dependencies
- Log emitted at async completion in `chatEvent.ts` (after PATCH), not in middleware — captures true end-to-end latency
- Required fields per invocation: `requestId`, `spaceId`, `command`, `latencyMs`, `status` ('ok' | 'error')
- `requestId` generated via `crypto.randomUUID()` (Node built-in, no dependency)
- Latency measured from `setImmediate` start to PATCH completion

### Claude's Discretion
- Startup validation (INFRA-03): centralized `validateEnv()` call in `index.ts` that checks all 3 required vars (`ANTHROPIC_API_KEY`, `ALLOWED_SPACE_IDS`, `GOOGLE_SERVICE_ACCOUNT_KEY`) at startup — extend existing pattern from `anthropicClient.ts` into a single validation step
- Exact log field names and order
- Error log structure (what fields to include on failure vs. success paths)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `chatClient` (src/chat/chatClient.ts): Already an authenticated googleapis client — `chatClient.spaces.messages.list()` is available on the same instance, no new auth setup needed
- `callClaude()` (src/claude/anthropicClient.ts): Takes `(prompt: string)`, will be extended with optional `context` param — existing tests use the current signature, need updates
- `buildErrorCard()` / `buildReplyCard()` (src/chat/cards.ts): Reusable for any error path including context fetch failure
- `setImmediate` async block in `chatEvent.ts`: Step 1 expands from "post thinking card" to "fetch context + post thinking card"; latency timer starts here

### Established Patterns
- Module-level singletons: `chatClient` and `anthropicClient` are both instantiated at module load — `validateEnv()` follows the same pattern (runs at startup)
- Env var guard at import time: `anthropicClient.ts` throws if `ANTHROPIC_API_KEY` missing — `validateEnv()` in `index.ts` centralizes this for all 3 required vars
- Error handling: callers handle Anthropic error classes (not `callClaude`); same pattern applies to context fetch — `chatEvent.ts` owns the try/catch

### Integration Points
- `chatEvent.ts` async block is where thread context fetch slots in (before the Thinking card POST, or concurrently)
- `callClaude(prompt)` call in chatEvent.ts becomes `callClaude(prompt, contextMessages)` after signature update
- `index.ts` gets a `validateEnv()` call before `app.listen()` (or at module load after middleware setup)

</code_context>

<specifics>
## Specific Ideas

- STATE.md blocker: `spaces.messages.list` thread filter syntax (AIP-160) needs live API verification — plan should include a Wave 0 spike or note that filter + client-side fallback pattern handles this uncertainty at runtime (chosen approach)
- "Thinking..." card and context fetch can potentially run concurrently (post thinking while fetching context), but sequencing is Claude's discretion

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-thread-context-production-hardening*
*Context gathered: 2026-03-13*
