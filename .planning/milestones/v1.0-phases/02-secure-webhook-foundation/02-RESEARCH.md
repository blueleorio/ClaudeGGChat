# Phase 2: Secure Webhook Foundation - Research

**Researched:** 2026-03-12
**Domain:** Google Chat HTTP Bot — JWT verification, slash command event parsing, async response pattern, space allowlisting
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOOK-01 | Bot receives and parses `/claude [prompt]` slash command events from Google Chat | `req.body.message.argumentText` contains prompt text; `req.body.message.slashCommand.commandId` identifies slash command; `req.body.type === 'MESSAGE'` guards handler |
| HOOK-02 | Bot returns HTTP 200 immediately (within ~3 seconds) and processes the Anthropic call asynchronously | Respond with `res.status(200).json({})` before doing any slow work; use `setImmediate` or unguarded async to continue processing after response |
| HOOK-03 | Bot returns a usage hint card when `/claude` is invoked with no prompt text | Check `!argumentText.trim()`; return synchronous `cardsV2` response body — no async needed for Phase 2 (Phase 3 adds real async calls) |
| SEC-01 | Every incoming webhook request is verified against Google's JWT bearer token before any processing | Use `google-auth-library` `OAuth2Client.verifyIdToken()` with audience = `GOOGLE_CLOUD_PROJECT_NUMBER`; or `jsonwebtoken` + `jwks-rsa`; reject with HTTP 401 before any handler body runs |
| SEC-02 | Requests from spaces not in `ALLOWED_SPACE_IDS` are silently rejected (no Anthropic API call made) | Parse `req.body.space.name` (format: `spaces/XXXXXXXXX`); compare against comma-split `ALLOWED_SPACE_IDS` env var; return HTTP 200 with empty body on rejection (silent = no error card shown to user) |
</phase_requirements>

---

## Summary

Phase 2 wires up the Express POST `/` route with two mandatory gates — JWT verification and space allowlist — then implements the async acknowledgment pattern and usage hint response. No Anthropic API call is made in this phase; the async pattern is proven by returning HTTP 200 immediately and logging what *would* be processed.

Google Chat sends every bot request with an OIDC bearer token in the `Authorization` header, signed by `chat@system.gserviceaccount.com`. The GCP project was configured in Phase 1 with "Project Number" as the authentication audience, which means the token audience is the numeric project number stored in `GOOGLE_CLOUD_PROJECT_NUMBER`. Verification uses `google-auth-library`'s `OAuth2Client.verifyIdToken()` — this is preferred over the `jsonwebtoken` + `jwks-rsa` approach because it is the official Google-maintained library and handles JWKS caching, certificate rotation, and expiry automatically.

The slash command payload arrives as `req.body` with `type: 'MESSAGE'`, the user's argument text in `req.body.message.argumentText`, the space identifier in `req.body.space.name`, and the thread path in `req.body.message.thread.name`. All of this is known from the event that Phase 1 already confirmed is being delivered to the Railway endpoint. Space allowlist checking compares `req.body.space.name` against a comma-split `ALLOWED_SPACE_IDS` env var and silently returns 200 (no body) if the space is not listed.

**Primary recommendation:** Add `google-auth-library` as a dependency. Implement a `verifyGoogleChatToken` middleware that rejects unauthorized requests with HTTP 401. Follow it with a `checkSpaceAllowlist` middleware that returns HTTP 200 (empty) for unauthorized spaces. Parse `argumentText` in the handler and return a `cardsV2` usage hint card if empty; otherwise return HTTP 200 with `{}` to acknowledge, then hand off to an async stub that logs the prompt.

---

## Standard Stack

### Core (Phase 2 additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| google-auth-library | ^10.6.1 | Google OIDC JWT verification for incoming Chat requests | Official Google-maintained library; handles JWKS caching, RS256, token expiry automatically |
| googleapis | ^171.x | Google Chat REST API client (needed Phase 3+; install now to avoid double-PR) | Official generated client with TypeScript types; used by `chat.spaces.messages.create` in Phase 3 |

### Already Installed (from Phase 1)

| Library | Version | Purpose |
|---------|---------|---------|
| express | ^4.21 | HTTP server |
| typescript | ^5.x | Type safety |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| google-auth-library | jsonwebtoken + jwks-rsa | `jsonwebtoken`/`jwks-rsa` works but is not Google-maintained; requires manual JWKS URI wiring for Chat; `google-auth-library` is the canonical approach shown in official Google Chat docs |
| googleapis (full) | @googleapis/chat (scoped) | `@googleapis/chat` is a lighter scoped package; `googleapis` is larger but used across all phases; since Phase 3 needs it anyway, install once |

**Installation (Phase 2 additions):**
```bash
npm install google-auth-library googleapis
npm install -D @types/node
```

---

## Architecture Patterns

### Recommended Project Structure (after Phase 2)

```
src/
├── index.ts            # Express app entry, mounts middleware and routes
├── middleware/
│   ├── verifyGoogleJwt.ts   # JWT verification middleware (SEC-01)
│   └── checkSpaceAllowlist.ts  # Space allowlist middleware (SEC-02)
├── handlers/
│   └── chatEvent.ts    # POST / handler — parses event, dispatches to processAsync stub
├── chat/
│   └── cards.ts        # cardsV2 builder helpers (usage hint card for HOOK-03)
└── __tests__/
    ├── health.test.ts   # Existing Phase 1 tests
    └── webhook.test.ts  # Phase 2 tests (JWT, allowlist, argument parsing, usage hint)
```

### Pattern 1: JWT Verification Middleware (SEC-01)

**What:** Express middleware that extracts the bearer token, calls `OAuth2Client.verifyIdToken`, and rejects with HTTP 401 if verification fails.
**When to use:** Must run BEFORE all other POST `/` processing — no handler body should execute on an unverified request.

```typescript
// Source: https://developers.google.com/workspace/chat/verify-requests-from-chat
import { OAuth2Client } from 'google-auth-library';
import { Request, Response, NextFunction } from 'express';

const CHAT_ISSUER = 'chat@system.gserviceaccount.com';
const client = new OAuth2Client();

export async function verifyGoogleJwt(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLOUD_PROJECT_NUMBER,
    });
    const payload = ticket.getPayload();
    if (!payload?.email_verified || payload.email !== CHAT_ISSUER) {
      res.status(401).json({ error: 'Invalid token issuer' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token verification failed' });
  }
}
```

**Important note on audience:** `GOOGLE_CLOUD_PROJECT_NUMBER` is a numeric string (e.g. `"490009"`). It was stored as a Railway env var in Phase 1 (confirmed in STATE.md). Pass it as a string to `audience` — the library accepts string.

### Pattern 2: Space Allowlist Middleware (SEC-02)

**What:** Checks `req.body.space.name` against `ALLOWED_SPACE_IDS` env var.
**When to use:** Runs AFTER JWT verification, BEFORE handler. Silent rejection — return HTTP 200 empty body so Google Chat shows no error to the user in the unauthorized space.

```typescript
import { Request, Response, NextFunction } from 'express';

export function checkSpaceAllowlist(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const allowedSpaces = (process.env.ALLOWED_SPACE_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const spaceName: string = req.body?.space?.name ?? '';
  if (!allowedSpaces.includes(spaceName)) {
    // Silent rejection — no response body, no error card shown
    res.status(200).json({});
    return;
  }
  next();
}
```

**ALLOWED_SPACE_IDS format:** Comma-separated `space.name` values, e.g. `spaces/AAAA8WYwwy4,spaces/BBBB1234`. The test space ID from Phase 1 is `spaces/AAAA8WYwwy4`.

### Pattern 3: Slash Command Event Parsing (HOOK-01)

**What:** The body of the Google Chat POST event. Access the user's prompt via `argumentText`.
**Full payload shape** (verified from official docs + community sources):

```typescript
// req.body shape when user types "/claude hello world"
{
  type: 'MESSAGE',
  message: {
    name: 'spaces/AAAA8WYwwy4/messages/...',
    sender: { name: 'users/12345', displayName: 'Alice', type: 'HUMAN' },
    text: '/claude hello world',
    argumentText: ' hello world',        // text AFTER the command (may have leading space)
    slashCommand: { commandId: '1' },    // commandId matches your GCP slash command ID
    thread: { name: 'spaces/AAAA8WYwwy4/threads/...' },
    space: { name: 'spaces/AAAA8WYwwy4' }
  },
  space: { name: 'spaces/AAAA8WYwwy4', type: 'ROOM' },
  user: { name: 'users/12345', displayName: 'Alice', type: 'HUMAN' }
}
```

Key access patterns:
- Prompt text: `req.body.message.argumentText.trim()` — may have a leading space
- Space name: `req.body.space.name` — used for allowlist check
- Thread name: `req.body.message.thread.name` — needed for Phase 3 threaded replies
- Empty prompt: `!req.body.message.argumentText?.trim()` — triggers usage hint card (HOOK-03)

### Pattern 4: Async Response Pattern (HOOK-02)

**What:** Return HTTP 200 immediately, then continue processing.
**Why:** Google Chat expects a response within 30 seconds (official limit). The project success criteria targets 3 seconds to avoid any UX degradation. Phase 2 proves the pattern; Phase 3 fills in the real async work.

```typescript
import { Request, Response } from 'express';

export async function handleChatEvent(req: Request, res: Response): Promise<void> {
  const argumentText = (req.body.message?.argumentText ?? '').trim();

  // HOOK-03: Empty prompt — respond synchronously with usage hint card
  if (!argumentText) {
    res.status(200).json(buildUsageHintCard());
    return;
  }

  // HOOK-02: Non-empty prompt — acknowledge immediately, process async
  res.status(200).json({});

  // Async stub: Phase 3 will replace this with real Anthropic + Chat API call
  setImmediate(async () => {
    const spaceName = req.body.space.name;
    const threadName = req.body.message.thread.name;
    console.log(`[async] Space: ${spaceName}, Thread: ${threadName}, Prompt: "${argumentText}"`);
    // Phase 3: call Anthropic API and post card via googleapis
  });
}
```

**Why `setImmediate` instead of unguarded `async`:** `setImmediate` defers execution to after the current I/O event loop tick, ensuring `res.json({})` completes before any async work begins. This is the correct pattern for fire-and-forget in Express.

### Pattern 5: Usage Hint Card (HOOK-03)

**What:** A `cardsV2` card returned synchronously when the user types `/claude` with no arguments.
**When to use:** `argumentText.trim()` is empty after the slash command.

```typescript
// cardsV2 response — returned directly as the HTTP response body
// Source: https://developers.google.com/workspace/chat/api/reference/rest/v1/cards
function buildUsageHintCard() {
  return {
    cardsV2: [
      {
        cardId: 'usage-hint',
        card: {
          header: {
            title: 'Claude',
            subtitle: 'Usage hint',
          },
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: 'To ask Claude a question, type:<br><b>/claude [your question]</b><br><br>Example: <i>/claude Summarize the last SEV incident</i>',
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}
```

### Anti-Patterns to Avoid

- **Verifying JWT after other logic runs:** JWT middleware must be the first middleware on the POST `/` route. Any processing before verification leaks data/cycles.
- **Returning HTTP 4xx for unauthorized spaces:** The requirement specifies silent rejection. A 4xx response causes Google Chat to show an error card to users in unauthorized spaces — revealing the bot exists there.
- **Awaiting async work before responding:** Calling `await doAnthropicStuff()` before `res.json({})` will cause Google Chat to time out if the Anthropic call takes > 30 seconds. Always respond first.
- **Checking `req.body.message.text` instead of `argumentText`:** `text` includes the slash command prefix (`/claude hello`); `argumentText` contains only the user-supplied arguments (` hello`). Use `argumentText.trim()` for the prompt.
- **Comparing against space ID instead of space name:** The env var `ALLOWED_SPACE_IDS` should contain `space.name` values (`spaces/AAAA8WYwwy4`), not raw IDs (`AAAA8WYwwy4`). The payload field is `req.body.space.name` which includes the `spaces/` prefix.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Google OIDC JWT verification | Custom RS256 JWKS fetcher + verifier | `google-auth-library` `OAuth2Client.verifyIdToken` | Certificate rotation, caching, expiry checking, issuer/audience validation — all handled; hand-rolled version misses edge cases |
| cardsV2 card builder | Custom class/schema | Inline JSON literal or thin helper function | cardsV2 schema is JSON-over-HTTP; a builder class adds no value for the few card types used in this project |
| Environment variable parsing | Custom config loader | Direct `process.env` access with early validation | Startup validation (INFRA-03) is a Phase 4 concern; in Phase 2, read env vars inline |

**Key insight:** JWT verification for Google services involves RS256 asymmetric keys from a JWKS endpoint that rotates periodically. The `google-auth-library` handles the full verification pipeline including caching the certificates between requests.

---

## Common Pitfalls

### Pitfall 1: Wrong Audience Value

**What goes wrong:** Passing the GCP project ID (string like `"claudebot-490009"`) as the `audience` instead of the project number (`"490009"`).
**Why it happens:** Project ID and project number are different GCP concepts; the JWT payload `aud` field contains the number, not the ID.
**How to avoid:** Use `GOOGLE_CLOUD_PROJECT_NUMBER` (numeric string from Railway env var). If `verifyIdToken` throws with an audience mismatch error in tests or live, this is the first thing to check.
**Warning signs:** `verifyIdToken` throws `"Wrong recipient"` or `"Invalid token"` despite the token being real.

### Pitfall 2: Testing JWT Verification with Real Tokens

**What goes wrong:** Unit tests fail because they cannot generate real Google-signed tokens; integration tests that bypass verification give false confidence.
**Why it happens:** JWT verification is tied to Google's JWKS endpoint; tests can't call that endpoint without a live Google service.
**How to avoid:** In unit tests, **mock `OAuth2Client.verifyIdToken`** at the module level. Have passing mock return a valid payload; have failing mock throw an error. Do NOT skip verification in tests — test the middleware directly with a mock.
**Warning signs:** Tests pass only when an `AUTH_SKIP` env flag is set; real endpoint rejects all requests.

### Pitfall 3: `argumentText` Has a Leading Space

**What goes wrong:** `argumentText === ' hello'` is truthy, so no usage hint is shown, but `argumentText === ''` when the user types just `/claude ` (with trailing space) is also truthy — it's `' '`.
**Why it happens:** Google Chat does not trim `argumentText`.
**How to avoid:** Always call `.trim()` before checking or passing to downstream logic. Empty-prompt check: `!req.body.message.argumentText?.trim()`.
**Warning signs:** Usage hint never appears even when `/claude` is typed with no arguments.

### Pitfall 4: Silent Rejection Returns No Body vs Empty Object

**What goes wrong:** Returning `res.status(200).send()` (no body) causes Express to send a 200 with no Content-Type. Google Chat may log a parsing warning in some contexts.
**Why it happens:** Express `send()` with no argument produces an empty response body with `Content-Type: text/plain`.
**How to avoid:** Use `res.status(200).json({})` — returns a valid JSON empty object with `Content-Type: application/json`. Google Chat ignores the empty body.
**Warning signs:** Railway logs show 200s from unauthorized spaces but Google Chat logs show a content-type warning.

### Pitfall 5: google-auth-library Not Listed as a Runtime Dependency

**What goes wrong:** `google-auth-library` installed as `devDependency` works locally but Railway production build fails because `npm install --production` omits it.
**Why it happens:** Mistyping `npm install -D google-auth-library`.
**How to avoid:** `npm install google-auth-library googleapis` (no `-D` flag).
**Warning signs:** Railway deployment succeeds but crashes at startup with `Cannot find module 'google-auth-library'`.

---

## Code Examples

### Express App Wiring (src/index.ts additions)

```typescript
// Source: Pattern derived from https://developers.google.com/workspace/chat/verify-requests-from-chat
import express from 'express';
import { verifyGoogleJwt } from './middleware/verifyGoogleJwt';
import { checkSpaceAllowlist } from './middleware/checkSpaceAllowlist';
import { handleChatEvent } from './handlers/chatEvent';

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Chain: JWT verify → space allowlist → event handler
app.post('/', verifyGoogleJwt, checkSpaceAllowlist, handleChatEvent);

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}
```

### Test Pattern: Mocking JWT Verification

```typescript
// src/__tests__/webhook.test.ts
import request from 'supertest';
import { OAuth2Client } from 'google-auth-library';
import { app } from '../index';

// Mock the entire google-auth-library module
jest.mock('google-auth-library');
const MockOAuth2Client = OAuth2Client as jest.MockedClass<typeof OAuth2Client>;

describe('POST / — JWT verification (SEC-01)', () => {
  beforeEach(() => {
    MockOAuth2Client.prototype.verifyIdToken = jest.fn().mockResolvedValue({
      getPayload: () => ({
        email_verified: true,
        email: 'chat@system.gserviceaccount.com',
      }),
    });
    process.env.ALLOWED_SPACE_IDS = 'spaces/AAAA8WYwwy4';
    process.env.GOOGLE_CLOUD_PROJECT_NUMBER = '490009';
  });

  it('returns 401 when no Authorization header', async () => {
    const res = await request(app).post('/').send({ type: 'MESSAGE' });
    expect(res.status).toBe(401);
  });

  it('returns 200 for a verified request from allowed space', async () => {
    const body = {
      type: 'MESSAGE',
      message: { argumentText: ' hello', slashCommand: { commandId: '1' }, thread: { name: 'spaces/AAAA8WYwwy4/threads/t1' } },
      space: { name: 'spaces/AAAA8WYwwy4' },
    };
    const res = await request(app).post('/')
      .set('Authorization', 'Bearer fake.jwt.token')
      .send(body);
    expect(res.status).toBe(200);
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `jsonwebtoken` + `jwks-rsa` for Chat JWT | `google-auth-library` `OAuth2Client.verifyIdToken` | 2022-2024 (gradual) | Official library handles caching and rotation; `jwks-rsa` still works but requires manual wiring |
| Synchronous bot responses only | Async pattern (respond 200, call Chat API separately) | Always supported; now standard | Enables calls to slow APIs like Anthropic without hitting Google's 30-second timeout |
| Hangouts Chat API naming | Google Chat API | 2023 | Same API, renamed; old tutorials still work but use legacy terminology |

**Deprecated/outdated:**
- Checking `event.token` for verification (old undocumented field): Not a valid verification method. Use the `Authorization: Bearer` header JWT.
- Replying to slash commands via outgoing webhook (simple webhook mode): Only the Chat App / HTTP bot model supports JWT-verified requests. Outgoing webhooks are for notification bots, not interactive slash commands.

---

## Open Questions

1. **`setImmediate` vs `Promise` for async fire-and-forget**
   - What we know: `setImmediate` defers to the next event loop iteration; unguarded `async` after `res.json()` also works but is less explicit
   - What's unclear: Whether Railway's Node.js runtime has any process-lifecycle quirks with unresolved promises on Railway free/hobby tier
   - Recommendation: Use `setImmediate(() => { void processAsync(...) })` — the `void` operator suppresses unhandled-promise warnings while `setImmediate` ensures response is sent first

2. **`argumentText` presence for non-slash-command MESSAGE events**
   - What we know: `argumentText` is set when a slash command is invoked; regular `@mention` messages have `text` but may not have `argumentText`
   - What's unclear: Whether Phase 2 should handle `@mention` events or only slash command events
   - Recommendation: In Phase 2, guard on `req.body.message.slashCommand` being present before reading `argumentText`; other event types can return `{}` silently

3. **`GOOGLE_CLOUD_PROJECT_NUMBER` string vs number in Railway**
   - What we know: Railway env vars are always strings; `verifyIdToken`'s `audience` parameter accepts string or string array
   - What's unclear: Whether the JWT `aud` claim is a string or number internally
   - Recommendation: Store and pass as string `"490009"` — `google-auth-library` coerces correctly; confirmed working pattern from official docs

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest (already installed from Phase 1) |
| Config file | `package.json` `jest` key (already configured) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | JWT absent → 401 | unit | `npm test -- --testPathPattern=webhook` | Wave 0 (create `__tests__/webhook.test.ts`) |
| SEC-01 | JWT invalid (mock throws) → 401 | unit | `npm test -- --testPathPattern=webhook` | Wave 0 |
| SEC-01 | JWT valid → proceeds to next middleware | unit | `npm test -- --testPathPattern=webhook` | Wave 0 |
| SEC-02 | Space not in allowlist → 200 empty body, no processing | unit | `npm test -- --testPathPattern=webhook` | Wave 0 |
| SEC-02 | Space in allowlist → proceeds to handler | unit | `npm test -- --testPathPattern=webhook` | Wave 0 |
| HOOK-01 | `argumentText` extracted correctly from payload | unit | `npm test -- --testPathPattern=webhook` | Wave 0 |
| HOOK-02 | Valid request with prompt → 200 returned before async | unit | `npm test -- --testPathPattern=webhook` | Wave 0 |
| HOOK-03 | Empty `argumentText` → 200 with cardsV2 usage hint | unit | `npm test -- --testPathPattern=webhook` | Wave 0 |

Note: Live end-to-end validation (typing `/claude hello` in actual Google Chat) is **manual-only** — requires live Railway deployment and real JWT from Google.

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Manual smoke test — type `/claude hello` in authorized space, verify HTTP 200 in Railway logs within 3 seconds; type `/claude` with no args and verify usage hint card appears in thread

### Wave 0 Gaps

- [ ] `src/__tests__/webhook.test.ts` — covers SEC-01, SEC-02, HOOK-01, HOOK-02, HOOK-03

None — Jest, ts-jest, and supertest already installed. No new test infrastructure setup needed.

---

## Sources

### Primary (HIGH confidence)

- https://developers.google.com/workspace/chat/verify-requests-from-chat — JWT verification method, `OAuth2Client.verifyIdToken`, audience = project number, issuer = `chat@system.gserviceaccount.com`
- https://developers.google.com/workspace/chat/receive-respond-interactions — 30-second sync response limit; async pattern recommendation
- https://developers.google.com/workspace/chat/api/reference/rest/v1/cards — cardsV2 JSON structure: `cardsV2`, `cardId`, `card.header`, `card.sections.widgets.textParagraph`
- https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces.messages — `argumentText` field description: "Plain-text body of the message with all Chat app mentions stripped out"; `slashCommand.commandId`; `thread.name` format

### Secondary (MEDIUM confidence)

- https://dev.to/foga/verifying-google-chat-request-in-nodejs-36i — Complete `jsonwebtoken` + `jwks-rsa` verification implementation (alternative to `google-auth-library`; consistent with official docs)
- npm registry: `google-auth-library@10.6.1`, `googleapis@171.4.0`, `jsonwebtoken@9.0.3`, `jwks-rsa@4.0.1` — current versions verified via `npm show`

### Tertiary (LOW confidence)

- WebSearch aggregated: `req.body.message.argumentText.trim()` pattern for extracting slash command arguments — consistent across multiple community sources; exact field name confirmed in official Message API reference

---

## Metadata

**Confidence breakdown:**
- JWT verification approach: HIGH — verified directly against official Google Chat docs; `OAuth2Client.verifyIdToken` with audience = project number confirmed
- Event payload schema (`argumentText`, `space.name`, `thread.name`): HIGH — confirmed from official Message API reference
- Async response pattern (setImmediate + 200): HIGH — 30-second limit confirmed from official docs; setImmediate pattern is standard Node.js
- cardsV2 usage hint card: HIGH — cardsV2 schema verified from official API reference
- Space allowlist implementation: HIGH — no external library needed; pure env var parsing

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (Google Chat API event schema and JWT verification are stable; cardsV2 format changes infrequently)
