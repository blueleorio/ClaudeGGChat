# Phase 3: Core Claude Integration - Research

**Researched:** 2026-03-13
**Domain:** Anthropic SDK (TypeScript), Google Chat API message posting/patching via googleapis
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLDE-01 | Bot calls `claude-sonnet-4-6` with a SEV team system prompt and the user's prompt | Anthropic SDK `messages.create` with `model` + `system` fields confirmed |
| CLDE-03 | Bot posts a "Thinking..." placeholder card immediately after receiving the command, then PATCHes it with Claude's reply | Two-step pattern: `spaces.messages.create` → `spaces.messages.patch`, using `message.name` from create response |
| CLDE-04 | Anthropic rate limit errors (429/529) result in a user-facing error card rather than a silent failure | SDK throws `RateLimitError` (429) and `InternalServerError` (529); caught via `instanceof Anthropic.APIError` with `error.status` |
| CLDE-05 | Anthropic timeout (25s budget) results in a user-facing error card | SDK throws `APIConnectionTimeoutError` when `timeout` option exceeded; per-request `{ timeout: 25_000 }` option available |
| RESP-01 | Claude's reply is posted as a `cardsV2` Google Chat card with a "Claude" header | `cardsV2` array field in message body; existing `cards.ts` pattern already established in Phase 2 |
| RESP-02 | Error replies (rate limit, timeout, auth failure, empty prompt) are posted as structured error cards | Same `spaces.messages.patch` flow with error card body; extends existing `buildUsageHintCard` pattern |
| RESP-03 | If card schema fails, bot falls back to posting a plain-text message rather than silently failing | Try cardsV2 POST first; on error catch, retry with `text` field only via another `spaces.messages.create` or `patch` |
</phase_requirements>

---

## Summary

Phase 3 wires the existing async stub in `chatEvent.ts` into a real end-to-end flow: post a "Thinking..." card, call Claude, then PATCH the placeholder with Claude's reply. The codebase already has the `googleapis` dependency, Google Chat `cards.ts` helper, and the async `setImmediate` pattern — Phase 3 fills that stub with real Anthropic SDK calls and Chat API message lifecycle management.

The Anthropic SDK (`@anthropic-ai/sdk`) is not yet installed in this project. It must be added as a production dependency. The Google Chat API client is instantiated from `googleapis` (already a dependency) with the service account JSON parsed from `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable (established in Phase 1). The two-message lifecycle — create placeholder, PATCH with result — is the core pattern this phase introduces.

Error handling is layered: Anthropic SDK errors surface typed classes (`RateLimitError`, `APIConnectionTimeoutError`, `InternalServerError`) for deterministic branching; card posting errors are caught and retried as plain-text fallback per RESP-03.

**Primary recommendation:** Install `@anthropic-ai/sdk`, create a `src/claude/anthropicClient.ts` singleton, create a `src/chat/chatClient.ts` singleton for the Google Chat API client, then expand `chatEvent.ts` async stub to: (1) post Thinking card, (2) call Claude, (3) PATCH with reply or error card.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | latest (`^0.52+`) | Official Anthropic API client — `messages.create`, error classes, timeout config | Official SDK; no alternative |
| `googleapis` | `^171.4.0` (already installed) | Google Chat API client — `spaces.messages.create`, `spaces.messages.patch` | Already a project dependency |
| `google-auth-library` | `^10.6.1` (already installed) | Service account auth — `google.auth.fromJSON()` to build Chat client auth | Already used in `verifyGoogleJwt.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js built-in `AbortController` | N/A | Optional: cancel in-flight Anthropic call | Not needed — SDK `timeout` option is simpler |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/sdk` timeout option | `AbortController` + `Promise.race` | SDK `timeout` option throws `APIConnectionTimeoutError` — cleaner than hand-rolled race |
| `spaces.messages.patch` for updates | Delete + re-create message | PATCH preserves thread position; delete+recreate changes message order |

**Installation:**
```bash
npm install @anthropic-ai/sdk
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── claude/
│   ├── anthropicClient.ts   # module-level Anthropic singleton + callClaude()
│   └── systemPrompt.ts      # SEV team system prompt string (CLDE-01)
├── chat/
│   ├── cards.ts             # extend: buildReplyCard(), buildErrorCard() (already exists)
│   └── chatClient.ts        # module-level Google Chat API singleton
├── handlers/
│   └── chatEvent.ts         # expand async stub: Thinking → Claude → PATCH (CLDE-03)
├── middleware/
│   ├── verifyGoogleJwt.ts   # unchanged
│   └── checkSpaceAllowlist.ts # unchanged
└── index.ts                 # unchanged
```

### Pattern 1: Anthropic Singleton with Typed Error Handling

**What:** Module-level `Anthropic` instance, `callClaude()` function that sets `timeout: 25_000` per-request and catches typed errors.
**When to use:** Single-call, non-streaming, error-boundary function.

```typescript
// src/claude/anthropicClient.ts
import Anthropic from '@anthropic-ai/sdk';
import { SEV_SYSTEM_PROMPT } from './systemPrompt';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function callClaude(prompt: string): Promise<string> {
  const message = await anthropic.messages.create(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SEV_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout: 25_000 }, // 25 second budget per CLDE-05
  );
  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected content type');
  return block.text;
}
```

**Error classes to catch** (source: anthropic-sdk-typescript GitHub src/index.ts):
- `Anthropic.RateLimitError` — HTTP 429 (CLDE-04)
- `Anthropic.InternalServerError` — HTTP 529 overloaded (CLDE-04, `error.status === 529`)
- `Anthropic.APIConnectionTimeoutError` — timeout exceeded (CLDE-05)
- `Anthropic.APIError` — base class; `error.status` for any other HTTP error

### Pattern 2: Google Chat API Client from Env-var Credentials

**What:** Parse `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON string) and build a `google.auth.fromJSON()` client. This avoids file I/O and works on Railway.
**When to use:** Any time Chat API calls are needed; use module-level singleton to avoid re-authenticating per request.

```typescript
// src/chat/chatClient.ts
// Source: googleapis/google-api-nodejs-client Issue #2419 + google-auth-library docs
import { google } from 'googleapis';

export function getChatClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  const key = JSON.parse(keyJson);
  const auth = google.auth.fromJSON(key);
  // fromJSON returns JWT or UserRefreshClient; JWT needs scopes set manually
  (auth as any).scopes = ['https://www.googleapis.com/auth/chat.bot'];
  return google.chat({ version: 'v1', auth });
}

// Module-level singleton
export const chatClient = getChatClient();
```

### Pattern 3: Thinking → Claude → PATCH Lifecycle (CLDE-03)

**What:** The two-step message lifecycle. Post a placeholder, capture `message.name` from the response, call Claude, then PATCH the placeholder.
**When to use:** All non-empty `/claude [prompt]` invocations.

```typescript
// Inside the async setImmediate block in chatEvent.ts
// Step 1: Post "Thinking..." placeholder card
const placeholderRes = await chatClient.spaces.messages.create({
  parent: spaceName,                   // e.g. "spaces/AAAA8WYwwy4"
  messageReplyOption: 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD',
  requestBody: {
    thread: { name: threadName },      // replies in the correct thread
    cardsV2: [buildThinkingCard()],
  },
});
const messageName = placeholderRes.data.name!; // "spaces/.../messages/..."

// Step 2: Call Claude (with error handling)
let replyCardBody: object;
try {
  const reply = await callClaude(argumentText);
  replyCardBody = buildReplyCard(reply);
} catch (err) {
  replyCardBody = buildErrorCard(err);
}

// Step 3: PATCH placeholder with result
await chatClient.spaces.messages.patch({
  name: messageName,
  updateMask: 'cardsV2',
  requestBody: replyCardBody,
});
```

### Pattern 4: Card Schema Fallback (RESP-03)

**What:** If the PATCH with `cardsV2` fails (schema validation error from Chat API), catch the error and retry with plain text.

```typescript
try {
  await chatClient.spaces.messages.patch({
    name: messageName,
    updateMask: 'cardsV2',
    requestBody: buildReplyCard(reply),
  });
} catch {
  // RESP-03: card schema failed — fall back to plain text
  try {
    await chatClient.spaces.messages.patch({
      name: messageName,
      updateMask: 'text',
      requestBody: { text: reply },
    });
  } catch {
    // Both failed — log and move on; message remains as "Thinking..."
    console.error('[async] Failed to post both card and plain-text reply');
  }
}
```

### Anti-Patterns to Avoid

- **Instantiating `Anthropic` or `chatClient` inside the request handler:** Re-authenticates on every request; wipes JWKS cache equivalent. Use module-level singletons.
- **Forgetting `updateMask` on PATCH:** The Chat API requires `updateMask` to specify which fields to replace. Without it, no fields are updated.
- **Swallowing Anthropic errors before posting an error card:** If error handling throws, the "Thinking..." card stays forever. Always wrap the error card post in its own try/catch.
- **Using `messageReplyOption: 'REPLY_MESSAGE_OR_FAIL'` for Thinking card:** If the thread name is stale or missing, this returns an error; `REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD` is safer.
- **Setting `max_tokens` too high:** Token quotas contribute to 429s. 1024 is appropriate for concise team-assistant answers.
- **Using `await` at top level in `setImmediate` without a void wrapper:** Already handled in Phase 2 with `void (async () => { ... })()` — maintain this pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anthropic rate limit detection | Parse `error.message` strings for "429" | `instanceof Anthropic.RateLimitError` or `error.status === 429` | SDK provides typed error classes; string parsing is fragile |
| Timeout enforcement | `Promise.race` with `setTimeout` reject | SDK `{ timeout: 25_000 }` per-request option | SDK option throws `APIConnectionTimeoutError`; race pattern leaves promises dangling |
| Chat API auth from JSON string | Manual JWT signing | `google.auth.fromJSON(parsed)` + `scopes` | `google-auth-library` handles token refresh, expiry, retry automatically |
| `cardsV2` widget builder | One-off inline objects in chatEvent.ts | Functions in `src/chat/cards.ts` | Phase 2 established this pattern; maintains testability |

**Key insight:** The Anthropic SDK's typed error hierarchy makes error branching deterministic. Never inspect raw `error.message` text.

---

## Common Pitfalls

### Pitfall 1: `updateMask` field name format

**What goes wrong:** Passing `updateMask: 'cardsV2'` when the API expects the proto field name `cards_v2`.
**Why it happens:** The REST API uses camelCase in JSON bodies but snake_case in `updateMask` paths (proto field names).
**How to avoid:** Use `updateMask: 'cardsV2'` — the Node.js googleapis client translates camelCase to the correct proto field name automatically. Verify in the official REST reference if update is silent (no error but no change).
**Warning signs:** PATCH returns 200 but the message in Chat still shows "Thinking..." card unchanged.

### Pitfall 2: `message.name` is null if placeholder POST fails

**What goes wrong:** If `spaces.messages.create` throws (e.g., bot not in space, 403), `messageName` is undefined and the subsequent PATCH throws a different error, masking the root cause.
**Why it happens:** The placeholder POST is not wrapped in its own error handler separate from the Claude call.
**How to avoid:** Wrap the placeholder creation in its own try/catch. If it fails, log and return early — there is no message to PATCH.

### Pitfall 3: HTTP 529 is not RateLimitError

**What goes wrong:** Anthropic's overload status (529) is thrown as `InternalServerError` not `RateLimitError` (which is 429 only).
**Why it happens:** SDK maps 429 → `RateLimitError`, >=500 → `InternalServerError` by HTTP range.
**How to avoid:** Check `instanceof Anthropic.RateLimitError || (err instanceof Anthropic.InternalServerError && err.status === 529)` for the combined rate-limit/overload case per CLDE-04.

### Pitfall 4: Google Chat API `googleapis` Chat client scope

**What goes wrong:** `google.auth.fromJSON` returns an auth object without scopes set; API calls return 403 "Request had insufficient authentication scopes".
**Why it happens:** `fromJSON` parses the key but does not know which scopes this service requires.
**How to avoid:** After `fromJSON`, manually set `(auth as any).scopes = ['https://www.googleapis.com/auth/chat.bot']` before constructing the client.

### Pitfall 5: Thread reply option and thread name format

**What goes wrong:** Passing `thread: { name: threadName }` from the incoming webhook body but using `REPLY_MESSAGE_OR_FAIL` causes errors if the thread was just created.
**Why it happens:** A slash command in a new thread may have a thread name that isn't fully persisted when the bot responds.
**How to avoid:** Use `REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`; this creates a new thread if the specified thread isn't found.

### Pitfall 6: ANTHROPIC_API_KEY not validated at startup

**What goes wrong:** If `ANTHROPIC_API_KEY` is missing, the first `/claude` command fails silently in the async block.
**Why it happens:** The Anthropic client constructor does not throw if the key is missing until the first API call.
**How to avoid:** Phase 3 should defensively check `process.env.ANTHROPIC_API_KEY` at module load time in `anthropicClient.ts` and throw early (full startup validation is Phase 4 INFRA-03, but early failure in the module is better than async silent failure).

---

## Code Examples

Verified patterns from official sources:

### Anthropic messages.create with system prompt and per-request timeout

```typescript
// Source: anthropic-sdk-typescript README.md (github.com/anthropics/anthropic-sdk-typescript)
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const message = await anthropic.messages.create(
  {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a helpful SEV team assistant.',
    messages: [{ role: 'user', content: 'Summarize the last incident.' }],
  },
  { timeout: 25_000 },
);
// message.content[0].type === 'text'
// message.content[0].text === '...'
```

### Anthropic error handling — rate limit and timeout

```typescript
// Source: anthropic-sdk-typescript GitHub src/index.ts (error class exports)
import Anthropic from '@anthropic-ai/sdk';

try {
  const reply = await callClaude(prompt);
  // ...
} catch (err) {
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    // CLDE-05: timeout
  } else if (
    err instanceof Anthropic.RateLimitError ||
    (err instanceof Anthropic.InternalServerError && err.status === 529)
  ) {
    // CLDE-04: rate limit / overload
  } else {
    // other API error
  }
}
```

### Google Chat: create message with cardsV2 in thread

```typescript
// Source: developers.google.com/workspace/chat/create-messages
const res = await chatClient.spaces.messages.create({
  parent: 'spaces/AAAA8WYwwy4',
  messageReplyOption: 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD',
  requestBody: {
    thread: { name: 'spaces/AAAA8WYwwy4/threads/t1' },
    cardsV2: [
      {
        cardId: 'thinking',
        card: {
          header: { title: 'Claude', subtitle: 'Thinking...' },
          sections: [],
        },
      },
    ],
  },
});
const messageName = res.data.name; // "spaces/.../messages/abc123"
```

### Google Chat: PATCH message to replace cardsV2

```typescript
// Source: developers.google.com/workspace/chat/update-messages
await chatClient.spaces.messages.patch({
  name: messageName,           // "spaces/.../messages/abc123"
  updateMask: 'cardsV2',
  requestBody: {
    cardsV2: [/* updated card */],
  },
});
```

### Google Chat: service account auth from env var JSON

```typescript
// Source: googleapis/google-api-nodejs-client Issue #2419
import { google } from 'googleapis';

const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
const auth = google.auth.fromJSON(key);
(auth as any).scopes = ['https://www.googleapis.com/auth/chat.bot'];
const chatClient = google.chat({ version: 'v1', auth });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `AbortController` + `Promise.race` for timeout | SDK `{ timeout: ms }` per-request option | SDK ~v0.20+ | Simpler; throws typed `APIConnectionTimeoutError` |
| `keyFilename` file path for service account | `google.auth.fromJSON(parsedEnvVar)` | google-auth-library v5+ | Required for Railway (no filesystem key files) |
| `cardsV1` / `cards` field | `cardsV2` | Google Chat API 2022+ | Phase 2 already uses cardsV2 — no action needed |

**Deprecated/outdated:**
- `cards` (v1): replaced by `cardsV2`; the project already uses `cardsV2` in `cards.ts`
- `keyFilename` approach: works but requires a file on disk — not viable in Railway's stateless containers

---

## Open Questions

1. **`updateMask` exact string for cardsV2 in Node.js googleapis client**
   - What we know: REST reference uses proto field names (`cards_v2`); Node.js client may auto-translate camelCase
   - What's unclear: Whether to pass `'cardsV2'` or `'cards_v2'` to `updateMask` in the googleapis Node.js client
   - Recommendation: Try `'cardsV2'` first (Node.js convention); if PATCH is silent, switch to `'cards_v2'`; add a live verification test in the human checkpoint plan

2. **`claude-sonnet-4-6` model ID exact string**
   - What we know: REQUIREMENTS.md specifies `claude-sonnet-4-6` as the model name; the Anthropic SDK README shows `claude-sonnet-4-5-20250929` as a dated variant
   - What's unclear: Whether the project intends the undated alias `claude-sonnet-4-6` or a specific dated snapshot
   - Recommendation: Use `claude-sonnet-4-6` as specified in REQUIREMENTS.md (CLDE-01); the Anthropic API supports undated model aliases that resolve to the latest minor version

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 with ts-jest |
| Config file | `package.json` (`"jest": { "preset": "ts-jest", ... }`) |
| Quick run command | `npx jest --testPathPattern=claude` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLDE-01 | `callClaude()` passes `system` prompt and `model: claude-sonnet-4-6` | unit | `npx jest --testPathPattern=claude` | Wave 0 |
| CLDE-03 | `handleChatEvent` async block posts Thinking card then PATCHes with reply | unit (mock Chat client) | `npx jest --testPathPattern=chatEvent` | Wave 0 (extend existing) |
| CLDE-04 | `RateLimitError` + 529 `InternalServerError` → error card posted | unit | `npx jest --testPathPattern=claude` | Wave 0 |
| CLDE-05 | `APIConnectionTimeoutError` → timeout error card posted | unit | `npx jest --testPathPattern=claude` | Wave 0 |
| RESP-01 | Reply card has `cardsV2` array with "Claude" header | unit | `npx jest --testPathPattern=cards` | Wave 0 (extend existing) |
| RESP-02 | Error card has `cardsV2` with error message text | unit | `npx jest --testPathPattern=cards` | Wave 0 (extend existing) |
| RESP-03 | Card schema failure triggers plain-text fallback PATCH | unit (mock Chat client) | `npx jest --testPathPattern=chatEvent` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx jest --testPathPattern="(cards|claude|chatEvent)"`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/claude.test.ts` — covers CLDE-01, CLDE-04, CLDE-05 (mock `@anthropic-ai/sdk`)
- [ ] `src/__tests__/chatEvent.test.ts` (extend existing `webhook.test.ts` or create dedicated) — covers CLDE-03, RESP-03 (mock `chatClient` and `callClaude`)
- [ ] `src/__tests__/cards.test.ts` (extend existing) — covers RESP-01, RESP-02 (`buildReplyCard`, `buildErrorCard`)
- [ ] `npm install @anthropic-ai/sdk` — not yet in `package.json`

---

## Sources

### Primary (HIGH confidence)

- `github.com/anthropics/anthropic-sdk-typescript` — error class exports, timeout option, `messages.create` parameters, per-request option API
- `developers.google.com/workspace/chat/create-messages` — `spaces.messages.create` request body, `messageReplyOption`, threading fields, response `name` field
- `developers.google.com/workspace/chat/update-messages` — `spaces.messages.patch` parameters, `updateMask` usage, Node.js example
- `developers.google.com/workspace/chat/api/reference/rest/v1/spaces.messages/create` — full request/response schema including `thread.name`, `cardsV2`, `messageReplyOption` enum

### Secondary (MEDIUM confidence)

- `googleapis/google-api-nodejs-client Issue #2419` — `google.auth.fromJSON()` pattern for env-var credentials (multiple community confirmations)
- npm search results for `@anthropic-ai/sdk` — confirmed current version range, Node.js >=20 requirement

### Tertiary (LOW confidence)

- WebSearch result for `updateMask` field name casing in Node.js googleapis client — contradictory signals; needs live verification in human checkpoint

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@anthropic-ai/sdk` is the official SDK; `googleapis` already installed; auth pattern from official issue tracker
- Architecture: HIGH — two-step Create+PATCH pattern confirmed in official Chat API docs; Anthropic error classes confirmed from SDK source
- Pitfalls: MEDIUM — `updateMask` casing is LOW; all other pitfalls are HIGH (derived from official docs and SDK source)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable APIs; Anthropic model alias policy could change)
