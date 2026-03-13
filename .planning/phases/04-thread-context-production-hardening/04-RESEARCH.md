# Phase 4: Thread Context + Production Hardening - Research

**Researched:** 2026-03-13
**Domain:** Google Chat API (thread message listing), Anthropic SDK (multi-turn messages), Node.js (crypto, process.exit), TypeScript
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Thread context format:**
- Use conversation history format: prior messages become user/assistant turns in the `messages` array (not prepended to system prompt)
- All non-bot human messages map to `role: 'user'` — no sender name prefix, no per-sender identity tracking
- Include all text message types (plain text, other slash commands) — no filtering by message type beyond bot/triggering-command exclusions
- `callClaude()` signature extended to `callClaude(prompt: string, context?: Array<{role: 'user'|'assistant', content: string}>)` — optional context param, backwards compatible

**Message filtering scope:**
- Filter out bot messages (`sender.type === 'BOT'`) per CONT-02
- Also exclude the triggering `/claude` command message (by matching `m.name !== triggeringMsgName` where `triggeringMsgName = req.body?.chat?.appCommandPayload?.message?.name`) — avoids duplicating the prompt in context
- For thread context fetch: try AIP-160 filter (`thread.name=<threadName>`) first; fall back to listing all space messages and filtering client-side by `threadName` if filter returns empty or fails
- In all cases (fetch success, filter fallback, or 403): call Claude — context is best-effort (CONT-03)

**Structured logging:**
- Plain JSON `console.log(JSON.stringify({...}))` — no logging library, zero new dependencies
- Log emitted at async completion in `chatEvent.ts` (after PATCH), not in middleware — captures true end-to-end latency
- Required fields per invocation: `requestId`, `spaceId`, `command`, `latencyMs`, `status` ('ok' | 'error')
- `requestId` generated via `crypto.randomUUID()` (Node built-in, no dependency)
- Latency measured from `setImmediate` start to PATCH completion

### Claude's Discretion
- Startup validation (INFRA-03): centralized `validateEnv()` call in `index.ts` that checks all 3 required vars (`ANTHROPIC_API_KEY`, `ALLOWED_SPACE_IDS`, `GOOGLE_SERVICE_ACCOUNT_KEY`) at startup — extend existing pattern from `anthropicClient.ts` into a single validation step
- Exact log field names and order
- Error log structure (what fields to include on failure vs. success paths)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONT-01 | Bot fetches the last 10 messages from the current thread before calling Claude | `spaces.messages.list` with `thread.name` filter + `pageSize=10` confirmed working; see Architecture Patterns section |
| CONT-02 | Bot filters out its own messages from thread context (by `sender.type === 'BOT'`) | `sender.type` field confirmed present on Message objects; filter by `sender.type !== 'BOT'` |
| CONT-03 | Thread context fetch failure (e.g. 403) is handled gracefully — Claude is called without context rather than failing | try/catch pattern in chatEvent.ts async block; context fetch failure → `contextMessages = []` → proceed |
| CLDE-02 | Thread context messages are passed to Claude as context preceding the user prompt | Anthropic SDK `messages` array supports alternating user/assistant turns; confirmed multi-turn format |
| INFRA-03 | Startup validation fails loudly (process exits) if required env vars are missing | `validateEnv()` using `process.exit(1)` before `app.listen()` in `index.ts` |
| INFRA-04 | Structured logging includes request ID, space ID, command, and response latency for each invocation | `crypto.randomUUID()` (Node built-in), `Date.now()` for latency; `JSON.stringify` log at async completion |
</phase_requirements>

## Summary

Phase 4 adds three capabilities to a fully-working Phase 3 bot: thread context injection, startup validation, and structured logging. All three are incremental changes to existing files — no new modules are strictly required, though a `validateEnv` utility function should be extracted for testability.

The core thread context work centers on two API contracts: (1) Google Chat's `spaces.messages.list` with a `thread.name` filter, and (2) the Anthropic SDK's multi-turn `messages` array format. Both are confirmed working and well-documented. The AIP-160 thread filter (`thread.name = spaces/.../threads/...`) is officially supported with `pageSize` up to 1000. The fallback to client-side filtering is a defensive measure for environments where the filter might not behave as expected, not a primary path.

The production hardening items (INFRA-03, INFRA-04) are straightforward Node.js patterns with zero new dependencies. `validateEnv()` uses `process.exit(1)`, and logging uses `crypto.randomUUID()` plus `JSON.stringify`. The main implementation complexity is correctly wiring latency timing around the full async lifecycle in `chatEvent.ts` and ensuring the test mock for `chatClient.spaces.messages.list` is added consistently.

**Primary recommendation:** Implement in two waves — Wave 0 writes all failing tests first (adding `list` to the chatClient mock and updating `callClaude` mock signature), Wave 1 makes them green. This preserves the established TDD pattern from Phase 3.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| googleapis | ^171.4.0 (already installed) | `chatClient.spaces.messages.list()` for thread fetch | Already authenticated singleton; no new auth setup |
| @anthropic-ai/sdk | ^0.78.0 (already installed) | Multi-turn `messages` array with context | Existing SDK; just extend `callClaude` signature |
| Node.js crypto | built-in | `crypto.randomUUID()` for request IDs | No dependency; UUID v4 format, cryptographically random |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | — | — | Phase 4 adds zero new runtime dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `crypto.randomUUID()` | `uuid` npm package | uuid adds a dependency for something Node 14.17+ already provides; use built-in |
| Plain `JSON.stringify` logging | `pino`, `winston` | Library logging adds complexity and a dependency; plain JSON is sufficient for Railway log drain |
| `process.exit(1)` in `validateEnv` | Throw an error | Throwing at module load can be swallowed; `process.exit` guarantees the process actually stops |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

No new files strictly required. The changes land in:
```
src/
├── claude/
│   └── anthropicClient.ts      # extend callClaude signature (context param)
├── handlers/
│   └── chatEvent.ts            # thread fetch, logging, pass context to callClaude
├── index.ts                    # validateEnv() call before app.listen
└── __tests__/
    ├── chatEvent.test.ts       # add list mock, new context/logging tests
    └── claude.test.ts          # add context param tests
```

Optional extraction for testability:
```
src/
└── utils/
    └── validateEnv.ts          # standalone validateEnv() — easier to unit test
```

### Pattern 1: Google Chat Thread Message Fetch

**What:** Call `chatClient.spaces.messages.list` with a `thread.name` filter to get the last N messages in the current thread.

**When to use:** At the start of the async block in `chatEvent.ts`, before posting the Thinking card OR concurrently (Claude's discretion).

**API Details (HIGH confidence — verified from official docs):**
- Endpoint: `spaces.messages.list`
- Filter syntax: `thread.name = spaces/{space}/threads/{thread}`
- Only one thread per filter query allowed
- `pageSize` default: 25, max: 1000
- `orderBy`: `createTime ASC` (default) or `createTime DESC`
- To get the 10 MOST RECENT: use `orderBy: 'createTime DESC'` and `pageSize: 10`, then reverse the result array before passing to Claude (so Claude sees oldest-first)

```typescript
// Source: https://developers.google.com/workspace/chat/reference/rest/v1/spaces.messages/list
const listRes = await chatClient.spaces.messages.list({
  parent: spaceName,
  pageSize: 10,
  orderBy: 'createTime DESC',
  filter: `thread.name = "${threadName}"`,
});
const messages = (listRes.data.messages ?? []).reverse();
```

**Fallback if filter returns empty or errors:**
```typescript
// Client-side filter fallback
const listRes = await chatClient.spaces.messages.list({
  parent: spaceName,
  pageSize: 50,  // fetch more to account for cross-thread messages
  orderBy: 'createTime DESC',
});
const messages = (listRes.data.messages ?? [])
  .filter(m => m.thread?.name === threadName)
  .slice(0, 10)
  .reverse();
```

### Pattern 2: Bot/Trigger Message Filtering

**What:** Filter the raw message list to exclude bot messages and the triggering command message.

**When to use:** After fetching, before mapping to Claude context format.

```typescript
// Source: CONTEXT.md locked decisions + Google Chat Message object (sender.type field confirmed)
const triggeringMsgName: string =
  req.body?.chat?.appCommandPayload?.message?.name;

const filteredMessages = messages.filter(
  m => m.sender?.type !== 'BOT' && m.name !== triggeringMsgName
);
```

### Pattern 3: Map to Anthropic Context Format

**What:** Convert Google Chat Message objects into Anthropic `MessageParam` objects.

**When to use:** After filtering, before calling `callClaude`.

```typescript
// Source: https://platform.claude.com/docs/en/api/messages (multi-turn format confirmed)
type ContextMessage = { role: 'user' | 'assistant'; content: string };

const contextMessages: ContextMessage[] = filteredMessages
  .filter(m => m.text)                      // only messages with text content
  .map(m => ({ role: 'user' as const, content: m.text! }));
```

Note: All non-bot human messages map to `role: 'user'` per locked decision. The messages array passed to Anthropic will be all-user turns followed by the current prompt — this is valid per the SDK (consecutive same-role turns are merged, not rejected).

### Pattern 4: Extended callClaude Signature

**What:** Add optional `context` parameter to `callClaude` — backwards compatible.

**When to use:** Extend anthropicClient.ts, update all callers.

```typescript
// Source: CONTEXT.md locked decision + Anthropic SDK MessageParam type
type ContextMessage = { role: 'user' | 'assistant'; content: string };

export async function callClaude(
  prompt: string,
  context: ContextMessage[] = []
): Promise<string> {
  const messages = [
    ...context,
    { role: 'user' as const, content: prompt },
  ];
  const message = await anthropic.messages.create(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SEV_SYSTEM_PROMPT,
      messages,
    },
    { timeout: 25_000 },
  );
  // ... existing extraction logic unchanged
}
```

### Pattern 5: Structured Logging

**What:** Emit a single JSON log line per invocation capturing key observability fields.

**When to use:** At the end of the async block in `chatEvent.ts` (after PATCH), in both success and error paths.

```typescript
// Source: CONTEXT.md locked decisions
const startTime = Date.now();  // set at top of setImmediate block
const requestId = crypto.randomUUID();

// ... (async work) ...

console.log(JSON.stringify({
  requestId,
  spaceId: spaceName,
  command: argumentText,
  latencyMs: Date.now() - startTime,
  status: 'ok',  // or 'error'
}));
```

**Note on import:** `crypto.randomUUID()` requires `import { randomUUID } from 'crypto'` or `import crypto from 'crypto'` at top of file. Available in Node 14.17+ without any install.

### Pattern 6: Startup Validation (validateEnv)

**What:** Check all required env vars at startup and `process.exit(1)` with a clear message if any are missing.

**When to use:** Called in `index.ts` inside the `if (require.main === module)` block, before `app.listen`.

```typescript
// Recommended: extractable to src/utils/validateEnv.ts for unit testability
export function validateEnv(): void {
  const required = [
    'ANTHROPIC_API_KEY',
    'ALLOWED_SPACE_IDS',
    'GOOGLE_SERVICE_ACCOUNT_KEY',
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `[startup] Missing required environment variables: ${missing.join(', ')}`
    );
    process.exit(1);
  }
}
```

In `index.ts`:
```typescript
if (require.main === module) {
  validateEnv();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}
```

**Testing consideration:** `process.exit` in tests causes Jest to abort the test process. The function must be extracted so tests can mock `process.exit` or test the missing-vars detection logic independently. Use `jest.spyOn(process, 'exit').mockImplementation(...)` pattern.

### Pattern 7: CONT-03 Graceful Fallback

**What:** Any error in the thread context fetch (including 403) silently continues without context.

**When to use:** Wrap the entire context fetch in try/catch; default `contextMessages` to `[]`.

```typescript
let contextMessages: ContextMessage[] = [];
try {
  // ... fetch and filter logic
  contextMessages = mappedMessages;
} catch {
  // CONT-03: best-effort — proceed without context
}
const replyText = await callClaude(argumentText, contextMessages);
```

### Anti-Patterns to Avoid

- **Awaiting context fetch before posting Thinking card (sequentially):** Adds perceptible latency before the user sees any feedback. Consider concurrent fetch + Thinking post using `Promise.all` or post Thinking first then fetch context.
- **Prepending context to system prompt:** Locked decision specifies conversation history format in `messages` array — not system prompt modification.
- **Throwing on context fetch failure:** CONT-03 requires graceful degradation; never let context fetch errors propagate to the user.
- **Using `process.exit` inside exported module code (non-index):** `validateEnv` should only `process.exit` when called from the entry point path — or use the extractable utility pattern so test code can spy on it.
- **Logging before PATCH completes:** Latency must include the PATCH round-trip; log only after the PATCH await resolves (or in the catch block).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unique request IDs | Custom timestamp/random string | `crypto.randomUUID()` | UUID v4 is a standard; already in Node stdlib |
| Thread message pagination | Custom cursor logic | Single `pageSize=10` with `orderBy DESC` | 10 messages = well within single-page limit; no pagination needed |
| Message ordering | Manual sort | Use `orderBy: 'createTime DESC'` + `.reverse()` | API-side sort is reliable; `.reverse()` is a one-liner |
| JSON log formatting | Custom serializer | `JSON.stringify({...})` | Sufficient for structured log drain; no need for log library |

**Key insight:** This phase deliberately avoids new dependencies. Every capability needed (UUID, env validation, JSON logging) is available in Node stdlib or already-installed packages.

## Common Pitfalls

### Pitfall 1: Messages Array Role Alternation

**What goes wrong:** Anthropic SDK documentation states messages must alternate between `user` and `assistant` roles. When all thread context messages map to `role: 'user'`, consecutive user turns are passed. The SDK merges consecutive same-role turns rather than rejecting them, so this works — but the behavior should be understood and tested explicitly.

**Why it happens:** Locked decision maps all non-bot messages to `role: 'user'`; bot messages are filtered out so no `role: 'assistant'` turn exists in context.

**How to avoid:** Understand the SDK merges consecutive user turns (confirmed behavior). The final prompt is also `role: 'user'`, appended after context. Test that `callClaude` passes all context messages + the prompt to `anthropic.messages.create`.

**Warning signs:** If Claude appears to not see context, verify the `messages` array in the API call includes context before the user prompt.

### Pitfall 2: process.exit in Jest

**What goes wrong:** If `validateEnv` calls `process.exit(1)` and is called during test module loading or directly in a test, Jest aborts the entire test process — not just the failing test.

**Why it happens:** `process.exit` is not a thrown error; it terminates the process immediately.

**How to avoid:**
1. Extract `validateEnv` to a separate module
2. In tests, `jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); })`
3. Never call `validateEnv()` at module load time in index.ts when imported by tests (`require.main === module` guard handles this)

**Warning signs:** Jest runner exits with code 1 in the middle of a test suite.

### Pitfall 3: Thread Filter Returns Empty (Not an Error)

**What goes wrong:** `spaces.messages.list` with a `thread.name` filter may return an empty `messages` array (not an error/exception) if the thread is new or the filter isn't recognized. The fallback path would then produce no context either.

**Why it happens:** API returns valid empty responses for new threads or when filter syntax has subtle issues (spaces in filter string, quoting).

**How to avoid:** After the filtered fetch, check if `messages` array is empty. If empty AND this is not a new conversation (i.e., the event has a valid `threadName`), attempt the client-side fallback before giving up. Alternatively, treat empty-but-valid as an acceptable "no prior context" case (simplest approach).

**Warning signs:** Context never appears in Claude responses even when thread has prior messages.

### Pitfall 4: Triggering Message Name Extraction

**What goes wrong:** The triggering message's `name` field comes from `req.body?.chat?.appCommandPayload?.message?.name`, which may be undefined on some event shapes. If undefined, `m.name !== undefined` is always true and no message is excluded.

**Why it happens:** Google Chat event payloads can vary; `message.name` may not always be present.

**How to avoid:** Use optional chaining and check truthiness: only exclude if `triggeringMsgName` is truthy and matches. If undefined, skip the exclusion (no message will accidentally match).

### Pitfall 5: Latency Timer Placement

**What goes wrong:** Starting the timer after the Thinking card POST means the measured latency does not include the Thinking card round-trip. Starting it before `setImmediate` means it includes the HTTP response flush time.

**Why it happens:** Multiple steps have network I/O; choosing the wrong anchor inflates or deflates latency metrics.

**How to avoid:** Start timer at the top of the `setImmediate` callback (first line of the async IIFE) — this captures the full async work duration from when processing begins to when PATCH completes.

### Pitfall 6: chatClient Mock Missing `list`

**What goes wrong:** Existing `chatEvent.test.ts` mocks `chatClient.spaces.messages` with only `create` and `patch`. Wave 0 test additions that call `list` will fail with "mockCreate.list is not a function."

**Why it happens:** Jest manual mocks are explicit — only mocked methods exist on the mock object.

**How to avoid:** Wave 0 must update the `chatClient` mock factory in `chatEvent.test.ts` to add `list: jest.fn()` alongside `create` and `patch`.

## Code Examples

Verified patterns from official sources:

### Thread Filter Query
```typescript
// Source: https://developers.google.com/workspace/chat/reference/rest/v1/spaces.messages/list
// thread.name filter confirmed, pageSize max 1000, orderBy ASC/DESC supported
const listRes = await chatClient.spaces.messages.list({
  parent: spaceName,                                  // e.g. 'spaces/AAAABBBB'
  pageSize: 10,
  orderBy: 'createTime DESC',
  filter: `thread.name = "${threadName}"`,            // AIP-160 filter
});
const rawMessages = (listRes.data.messages ?? []).reverse();  // oldest-first for Claude
```

### Multi-Turn Anthropic Messages Array
```typescript
// Source: https://platform.claude.com/docs/en/api/messages
// Confirmed: messages array alternates user/assistant; consecutive user turns are merged
const result = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: SEV_SYSTEM_PROMPT,
  messages: [
    { role: 'user', content: 'What is a SEV incident?' },   // context[0]
    { role: 'user', content: 'What did I just ask?' },      // current prompt
    // SDK merges consecutive user turns before sending
  ],
}, { timeout: 25_000 });
```

### crypto.randomUUID (Node built-in)
```typescript
// Source: Node.js docs — available since Node 14.17.0, no import needed in Node 18+
// For Node 14.x compatibility, use: import { randomUUID } from 'crypto';
import { randomUUID } from 'crypto';
const requestId = randomUUID();  // e.g. '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
```

### process.exit Spy in Jest
```typescript
// Source: Jest docs — spy on process.exit to prevent Jest process termination in tests
const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`process.exit(${code})`);
});
// ...test assertions...
exitSpy.mockRestore();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| System prompt stuffing for context | `messages` array multi-turn format | Anthropic API v1 design | Cleaner separation; context tokens count normally |
| Custom UUID generation | `crypto.randomUUID()` | Node 14.17 (2021) | Zero-dependency UUID v4 |
| Silent env var failures at runtime | `process.exit(1)` at startup | Best practice (always) | Immediate failure vs. mysterious runtime crash |

**Deprecated/outdated:**
- Prepending context to system prompt: Works but conflates instruction context with conversational context — use `messages` array instead.

## Open Questions

1. **Thread filter quoting sensitivity**
   - What we know: Official docs show filter as `thread.name = spaces/X/threads/Y` (no quotes around the value in examples)
   - What's unclear: Whether the `googleapis` SDK requires the value to be quoted (double quotes around thread name string). Some AIP-160 implementations are strict about string literals being quoted.
   - Recommendation: Use quoted form `filter: \`thread.name = "${threadName}"\`` as it matches RFC standards for string literals. The fallback handles the case if filter returns empty.

2. **Concurrent vs. sequential: Thinking card POST and context fetch**
   - What we know: Claude's discretion per CONTEXT.md. Both approaches are valid.
   - What's unclear: Whether concurrent execution (`Promise.all`) is worth the added complexity vs. sequential (post Thinking first, then fetch).
   - Recommendation: Sequential is simpler and testable. Post Thinking card first (user sees immediate feedback), then fetch context. The context fetch adds ~100-300ms latency before Claude is called — acceptable.

3. **Message `text` field presence**
   - What we know: Google Chat `Message.text` field contains plain text body. Rich messages (cards, attachments) may have empty/undefined `text`.
   - What's unclear: Whether slash command messages in the thread have their `argumentText` in `text` or only in `appCommandPayload`.
   - Recommendation: Filter context to `m.text && m.text.trim() !== ''` — skip messages with no text content. This is conservative and safe.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest (latest) |
| Config file | `package.json` (`jest` key) — `preset: ts-jest`, `testMatch: **/__tests__/**/*.test.ts`, `setupFiles: ./src/__tests__/setup.ts` |
| Quick run command | `npx jest --testPathPattern=chatEvent\|claude` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONT-01 | `chatClient.spaces.messages.list` called with `thread.name` filter and `pageSize: 10` | unit | `npx jest --testPathPattern=chatEvent` | ❌ Wave 0 |
| CONT-02 | Bot messages (`sender.type === 'BOT'`) excluded from context passed to `callClaude` | unit | `npx jest --testPathPattern=chatEvent` | ❌ Wave 0 |
| CONT-03 | When `spaces.messages.list` rejects (simulated 403), `callClaude` is still called and reply is posted | unit | `npx jest --testPathPattern=chatEvent` | ❌ Wave 0 |
| CLDE-02 | `callClaude` receives non-empty context array when messages exist; `anthropic.messages.create` called with context + prompt | unit | `npx jest --testPathPattern=claude` | ❌ Wave 0 |
| INFRA-03 | `validateEnv()` calls `process.exit(1)` when any required var is missing; does not exit when all vars present | unit | `npx jest --testPathPattern=validateEnv` | ❌ Wave 0 |
| INFRA-04 | Log line emitted after PATCH containing `requestId`, `spaceId`, `command`, `latencyMs`, `status` | unit | `npx jest --testPathPattern=chatEvent` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=chatEvent\|claude`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/chatEvent.test.ts` — update chatClient mock to add `list: jest.fn()` and add 6 new test cases for CONT-01, CONT-02, CONT-03, INFRA-04
- [ ] `src/__tests__/claude.test.ts` — add 2 new test cases for CLDE-02 (context param passed to SDK, default empty context works)
- [ ] `src/__tests__/validateEnv.test.ts` — new test file covering INFRA-03 (missing vars → exit, all vars present → no exit)
- [ ] `src/__tests__/setup.ts` — add `ALLOWED_SPACE_IDS` env var (currently only ANTHROPIC_API_KEY and GOOGLE_SERVICE_ACCOUNT_KEY are set; INFRA-03 tests need a clean env state)

## Sources

### Primary (HIGH confidence)
- Google Chat REST API — `spaces.messages.list` query parameters: https://developers.google.com/workspace/chat/reference/rest/v1/spaces.messages/list — verified thread.name filter, pageSize, orderBy
- Google Chat REST API — `Message` object: https://developers.google.com/workspace/chat/reference/rest/v1/spaces.messages — confirmed sender.type field, name field, text field, thread.name field
- Anthropic Messages API: https://platform.claude.com/docs/en/api/messages — confirmed multi-turn MessageParam format, consecutive user turn merging behavior

### Secondary (MEDIUM confidence)
- Existing codebase (`chatClient.ts`, `anthropicClient.ts`, `chatEvent.ts`, `__tests__/`) — direct code reading, HIGH confidence for current state
- `package.json` — confirmed dependencies, no new packages needed

### Tertiary (LOW confidence)
- None — all critical claims verified from official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, Node built-ins confirmed
- Architecture: HIGH — API filter syntax verified from official docs, Anthropic multi-turn format verified
- Pitfalls: HIGH (process.exit in Jest, mock gaps) / MEDIUM (thread filter quoting, message.text presence)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (Google Chat API is stable; Anthropic SDK minor versions may update)
