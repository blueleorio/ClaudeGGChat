# Architecture Patterns

**Domain:** Google Chat slash command bot (Node.js + Anthropic API + Railway)
**Researched:** 2026-03-12
**Confidence:** MEDIUM — based on training data (cutoff Aug 2025). Google Chat API v1 is stable; patterns verified against known SDK behavior. Web tools unavailable for live doc verification.

---

## Recommended Architecture

The bot is a stateless HTTP server. Google Chat sends a POST to the bot's webhook URL on every slash command invocation. The server must respond synchronously within Google Chat's timeout window, or use an async pattern (acknowledge immediately, then update the message via the Chat REST API).

For this project, the Anthropic API call will take 2–10 seconds — well beyond Google Chat's ~3-second synchronous response window. The async pattern is mandatory.

### High-Level Data Flow

```
[Google Chat User]
       |
  /claude [prompt]
       |
       v
[Google Chat Platform]
  - Validates slash command registration
  - Signs request with bot token
  - POSTs event payload to bot webhook URL
       |
       v
[Railway: Bot HTTP Server]  <-- binds to process.env.PORT
  1. Webhook receiver (Express route POST /)
  2. Request verifier (Google bearer token check)
  3. Space allowlist check (ALLOWED_SPACE_IDS)
  4. Slash command dispatcher (routes /claude)
       |
       | responds HTTP 200 with "Thinking..." card  <-- within ~3 seconds
       |
       v
[Async worker (same process, async/await)]
  5. Context fetcher  (Google Chat API: list messages in thread)
  6. Claude caller    (Anthropic SDK: messages.create)
  7. Response poster  (Google Chat API: update the placeholder message)
       |
       v
[Google Chat Platform]
  - Delivers updated card to space thread
       |
       v
[Google Chat User sees Claude's reply]
```

---

## Component Boundaries

| Component | File (suggested) | Responsibility | Communicates With |
|-----------|-----------------|---------------|-------------------|
| HTTP Server | `src/server.js` | Binds to `PORT`, mounts routes, health check at `GET /health` | Express framework |
| Webhook Receiver | `src/routes/webhook.js` | Accepts `POST /`, parses body, delegates to verifier | Request Verifier |
| Request Verifier | `src/middleware/verify.js` | Validates Google's `Authorization: Bearer <token>` header — rejects non-Google requests | Google Chat platform |
| Space Allowlist | `src/middleware/allowlist.js` | Checks `event.space.name` against `ALLOWED_SPACE_IDS` env var | — |
| Slash Command Dispatcher | `src/handlers/dispatcher.js` | Matches `event.message.slashCommand.commandId` (or text), routes to handler | Claude Handler |
| Claude Handler | `src/handlers/claude.js` | Orchestrates the async flow: post placeholder → fetch context → call Claude → update message | Context Fetcher, Claude Caller, Response Poster |
| Context Fetcher | `src/services/contextFetcher.js` | Calls Google Chat REST API `spaces.messages.list` filtered to thread, returns last N messages as formatted text | Google Chat API |
| Claude Caller | `src/services/anthropic.js` | Wraps Anthropic SDK `messages.create`, injects system prompt, formats messages array | Anthropic API |
| Response Poster | `src/services/chatPoster.js` | Calls Google Chat REST API `spaces.messages.patch` to update the placeholder message with the card | Google Chat API |

---

## Data Flow — Detailed

### Phase 1: Synchronous (must complete in ~3 seconds)

1. Google Chat POSTs to `POST /` with a signed JSON payload:
   ```json
   {
     "type": "MESSAGE",
     "message": {
       "name": "spaces/SPACE_ID/messages/MSG_ID",
       "text": "/claude summarize the last standup",
       "slashCommand": { "commandId": 1 },
       "thread": { "name": "spaces/SPACE_ID/threads/THREAD_ID" }
     },
     "space": { "name": "spaces/SPACE_ID", "type": "ROOM" },
     "user": { "name": "users/USER_ID", "displayName": "..." }
   }
   ```

2. Verifier checks `Authorization` header. Google Chat sends a Bearer token (the bot's service account token or a verification token depending on connection type). With HTTP connection type, Google sends a `Authorization: Bearer <Google-signed-JWT>`. Verify the JWT against Google's public keys OR use the simpler verification token approach.

3. Allowlist check: `event.space.name` (e.g., `spaces/AAABBBCCC`) must be in `ALLOWED_SPACE_IDS`.

4. Dispatcher confirms this is the `/claude` command.

5. Handler calls Google Chat API to **create a placeholder message** in the same thread:
   ```
   POST https://chat.googleapis.com/v1/spaces/{spaceId}/messages
   { "text": "Thinking...", "thread": { "name": "..." } }
   ```
   Save the returned `message.name` (e.g., `spaces/X/messages/Y`) for the update step.

6. Return HTTP 200 with empty JSON `{}` or a simple acknowledgment card to Google Chat. This ends the synchronous phase.

### Phase 2: Asynchronous (background, no time limit)

7. Context Fetcher calls:
   ```
   GET https://chat.googleapis.com/v1/{parent}/messages?filter=thread.name="{threadName}"&pageSize=10&orderBy=createTime desc
   ```
   Returns the last 10 messages in that thread. Formats them as:
   ```
   [DisplayName]: message text
   ```
   for inclusion in the Anthropic messages array.

8. Claude Caller builds the messages payload:
   ```javascript
   {
     model: "claude-sonnet-4-6",
     max_tokens: 1024,
     system: "You are a helpful assistant for the SEV team...",
     messages: [
       // thread context messages as user/assistant turns (best-effort mapping)
       // or as a single user message with context block prepended
       { role: "user", content: `Context:\n${threadContext}\n\nRequest: ${userPrompt}` }
     ]
   }
   ```

9. Response Poster calls:
   ```
   PATCH https://chat.googleapis.com/v1/{message.name}
   {
     "cardsV2": [{
       "cardId": "claude-response",
       "card": {
         "header": { "title": "Claude", "subtitle": "claude-sonnet-4-6" },
         "sections": [{ "widgets": [{ "textParagraph": { "text": claudeReplyText } }] }]
       }
     }]
   }
   ```

---

## Google Chat Request/Response Timing Requirements

**CRITICAL — HIGH confidence (stable, documented behavior):**

- Google Chat expects an HTTP 200 response within approximately **3 seconds** for synchronous HTTP endpoint bots.
- If the bot does not respond in time, Google Chat will show the user an error ("Bot is unavailable" or similar).
- Anthropic API calls routinely take 3–15 seconds for non-trivial prompts.
- **Therefore, the async pattern is required:** respond immediately with a placeholder, then update the message asynchronously.

### Two Async Patterns

| Pattern | How | Tradeoff |
|---------|-----|----------|
| **Respond empty + post new message** | Return `{}` to Google, then POST a new message via REST API | Simple. Creates a second message (not in-place update). |
| **Respond with placeholder card + patch it** | Return a "Thinking..." card in the HTTP response body, then PATCH that message later | Cleaner UX — single message that updates in place. Requires knowing the message name before the response. **Cannot PATCH the synchronous response message.** |

**Recommended approach for this project:** Return `{}` (empty) in the synchronous response. In the async phase, POST a new "Thinking..." message immediately, save its `message.name`, then PATCH it after Claude responds. This is the cleanest pattern.

> Note on "return a card": The synchronous HTTP response body can contain a card, but that card **cannot be later updated via PATCH** — it was the response to Google's event, not a created message. To get an updatable message, you must CREATE it via the REST API.

---

## Fetching Thread Context

**Context Fetcher details — MEDIUM confidence:**

The webhook payload does NOT include thread history. You must fetch it separately using the Google Chat REST API.

### Authentication for REST API calls

The bot must authenticate as a service account (not a user) to call the Chat REST API. This requires:
1. A Google Cloud service account with the Chat API enabled.
2. The service account JSON key stored as a Railway env var (base64-encoded or as escaped JSON).
3. Using `google-auth-library` to create a JWT auth client with scope `https://www.googleapis.com/auth/chat.bot`.

### Listing Thread Messages

```
GET https://chat.googleapis.com/v1/{space}/messages
  ?filter=thread.name%3D%22spaces%2FXXX%2Fthreads%2FYYY%22
  &pageSize=10
  &orderBy=createTime+desc
```

The `filter` parameter uses the Google AIP-160 filter syntax. Thread name comes from `event.message.thread.name` in the webhook payload.

**Limitation:** The Chat API returns up to 1000 messages per page, but the `filter` by thread may have ordering quirks. Request `pageSize=10` and reverse the results client-side so oldest-first ordering makes sense for the Claude context window.

---

## Railway-Specific Binding

**HIGH confidence — standard Railway behavior:**

- Railway injects `PORT` as an environment variable. The app must bind to `process.env.PORT`, not a hardcoded port.
- Railway automatically provides HTTPS termination. The bot does NOT need to handle TLS — just listen on HTTP internally.
- Health check: Railway (and Google Cloud prerequisites) expect a route that returns HTTP 200. Expose `GET /health` returning `{ "status": "ok" }`.

```javascript
// server.js
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
```

---

## Patterns to Follow

### Pattern 1: Fire-and-Forget Async Handler

**What:** After sending the synchronous HTTP 200, kick off async work without `await`-ing it in the request handler. Use `.catch()` to log errors so unhandled rejections don't crash the process.

**When:** Every slash command invocation.

```javascript
// webhook.js route handler
app.post('/', (req, res) => {
  const event = req.body;
  // ... verify + allowlist checks ...

  // Respond immediately
  res.status(200).json({});

  // Async work — do NOT await here
  handleClaudeCommand(event).catch(err => {
    console.error('Claude handler failed:', err);
  });
});
```

### Pattern 2: Structured Context Injection

**What:** Prepend thread messages as a context block in the user message rather than trying to reconstruct alternating user/assistant roles.

**Why:** Thread messages are from mixed authors. Mapping them to Claude's alternating role structure is fragile. A single user message with a context preamble is simpler and equally effective.

```javascript
const userMessage = `Here is the recent conversation in this thread:\n\n${threadContext}\n\n---\nUser request: ${userPrompt}`;
```

### Pattern 3: Graceful Error Card

**What:** If Claude call or context fetch fails, PATCH the placeholder message with an error card rather than leaving "Thinking..." forever.

```javascript
} catch (err) {
  await patchMessage(placeholderName, { text: 'Sorry, something went wrong. Please try again.' });
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Awaiting Anthropic in the Request Handler

**What:** `await anthropic.messages.create(...)` inside the Express route handler before calling `res.send()`.

**Why bad:** Anthropic calls take 3–15s. Google Chat will time out and show an error. The response still arrives but users see a failed command.

**Instead:** Respond with `res.json({})` immediately, do Anthropic work in background async.

### Anti-Pattern 2: Hardcoded PORT

**What:** `app.listen(3000)` without reading `process.env.PORT`.

**Why bad:** Railway assigns a dynamic port. The service will start but Google Chat's webhook POST will never reach the correct port.

**Instead:** Always `process.env.PORT || 3000`.

### Anti-Pattern 3: Skipping Request Verification

**What:** Accepting all POSTs to the webhook without verifying the Google JWT.

**Why bad:** Anyone who discovers the webhook URL can invoke the bot, bypassing the space allowlist.

**Instead:** Verify the `Authorization: Bearer <token>` header against Google's public keys (or use the simpler bearer token verification if using the Chat API verification token mode).

### Anti-Pattern 4: Fetching Context in the Synchronous Phase

**What:** Calling `spaces.messages.list` before returning the HTTP 200.

**Why bad:** The REST API call adds latency. Combined with auth setup overhead, this risks hitting the 3-second timeout.

**Instead:** Return 200 first, fetch context in the async phase after the placeholder message is posted.

---

## Suggested Build Order

Build in dependency order — each layer depends on the one before it being solid.

### Layer 1: Infrastructure Shell (no logic)

- Express server that binds to `PORT`
- `GET /health` returns 200
- `POST /` logs the raw body and returns `{}`
- Deploy to Railway — confirm public HTTPS URL works
- Register this URL in Google Cloud Console as the bot's webhook

**Why first:** Everything else depends on having a working Railway deployment with a verified webhook URL.

### Layer 2: Request Verification + Allowlist

- Implement Google JWT verification middleware on `POST /`
- Implement space allowlist check against `ALLOWED_SPACE_IDS`
- Log rejections clearly

**Why second:** Security gating must exist before any real logic. Easier to test with raw payloads when there's no business logic yet.

### Layer 3: Slash Command Parsing + Placeholder Post

- Parse `event.message.slashCommand` and `event.message.argumentText`
- Authenticate as service account (google-auth-library)
- POST "Thinking..." message to the thread via REST API
- Return `{}` synchronously

**Why third:** Validates the Google Auth service account setup and Chat REST API write permissions before adding Anthropic complexity.

### Layer 4: Context Fetcher

- List thread messages via `spaces.messages.list` with thread filter
- Format as context string
- Unit-testable in isolation with mocked API responses

**Why fourth:** Can be developed and tested independently of Anthropic.

### Layer 5: Anthropic Integration

- Wrap `@anthropic-ai/sdk` `messages.create`
- Inject system prompt + thread context + user prompt
- Return text response

**Why fifth:** Pure function — takes strings, returns string. Easy to test with mocked SDK.

### Layer 6: Response Poster (PATCH placeholder)

- PATCH the "Thinking..." message with the Claude card format
- Implement error card fallback

**Why last:** Depends on having a placeholder message name (Layer 3) and Claude response text (Layer 5).

---

## Component Dependency Graph

```
[Layer 1: HTTP Server + Railway binding]
         |
[Layer 2: Verifier + Allowlist]
         |
[Layer 3: Command Parser + Placeholder Poster]
        / \
       /   \
[Layer 4:  [Layer 5:
 Context    Anthropic
 Fetcher]   Caller]
       \   /
        \ /
[Layer 6: Response Poster]
```

---

## Scalability Considerations

| Concern | At current scale (SEV team ~10-30 users) | At 1K users | Notes |
|---------|------------------------------------------|-------------|-------|
| Concurrency | Single Railway instance handles easily | May need multiple instances | Stateless design allows horizontal scaling |
| Anthropic rate limits | Tier 1 limits (60 RPM) far exceed team usage | Monitor RPM | Add queuing if needed |
| Google Chat API quota | 3000 RPD default — sufficient | Request quota increase | Context fetch = 1 read + 1 write per invocation |
| Context window | 10 messages well under claude-sonnet-4-6 limits | No issue | 200K token context window |

---

## Sources

- Google Chat API documentation (training data, cutoff Aug 2025) — MEDIUM confidence
- Anthropic SDK `@anthropic-ai/sdk` documentation (training data, cutoff Aug 2025) — HIGH confidence
- Railway deployment patterns (training data) — HIGH confidence
- Google Auth Library Node.js patterns (training data) — MEDIUM confidence

**Note:** Web fetch tools were unavailable during research. Verify the following against live docs before implementation:
1. Google Chat JWT verification method for HTTP bots (bearer token vs. full JWT verification)
2. Exact `filter` syntax for `spaces.messages.list` by thread name
3. Whether PATCH on a message posted by the bot updates in-place in the Chat UI
