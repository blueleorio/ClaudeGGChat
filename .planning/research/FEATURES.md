# Feature Landscape

**Domain:** Google Chat slash command bot (AI assistant)
**Project:** ClaudeGGChat
**Researched:** 2026-03-12
**Confidence note:** Web search and WebFetch unavailable. Findings based on training data (cutoff August 2025) covering Google Chat API v1 and Workspace developer platform. Google Chat's core event model and card schema have been stable since 2022. Confidence is MEDIUM across most areas — verify against https://developers.google.com/workspace/chat before implementation.

---

## Table Stakes

Features users expect. Missing = bot is unusable or feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Slash command event handling | Core bot interaction model — without this there is no bot | Low | Google Chat sends a `MESSAGE` event with `slashCommand.commandId` in the payload when a user types `/claude`. Bot must parse this and route correctly. |
| Synchronous HTTP response | Google Chat expects a response within ~30 seconds or it shows an error to the user | Low | Express/Fastify handler must return 200 with a JSON body. If Anthropic API call exceeds timeout, bot must handle it gracefully. |
| Reply in thread | Users expect the response to appear inline in the conversation, not as a new top-level message | Low | Set `thread.name` in the response body to match the originating message's thread. For new threads, Google Chat auto-creates the thread on slash command invocation. |
| Plain text or card response | Bot must post something readable | Low | Can return either `text` or `cardsV2` in the response JSON. Either works; cards are more structured. |
| Error message to user | If Claude fails or access is denied, user needs to know — silent failures erode trust | Low | Return a plain-text or card error message. Never return an empty 200. |
| Access control enforcement | Bot must reject unauthorized spaces before calling Anthropic API | Low | Check `event.space.name` against `ALLOWED_SPACE_IDS`. Respond with a plain-text rejection message if not allowed. |
| Webhook request verification | Without this, anyone who discovers the endpoint can spoof events | Medium | Google Chat signs requests with a Bearer token in the Authorization header. Verify via Google's OAuth2 token introspection or use the `google-auth-library` to verify the token audience matches your bot's service account. |
| Graceful handling of empty prompt | `/claude` with no argument text should return a helpful usage hint | Low | Check `event.message.argumentText` — if blank, reply with usage instructions rather than sending empty prompt to Claude. |
| Rate limit awareness | Claude API has TPM/RPM limits; uncontrolled usage will cause 429 errors | Medium | At minimum, catch 429 responses from Anthropic SDK and return a friendly "try again shortly" message to the user. |

---

## Differentiators

Features that make this bot especially useful. Not expected baseline, but high value-add.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Thread context injection | Claude sees the last N messages before answering — answers are grounded in what the team was discussing | Medium | Requires a second API call: `spaces.messages.list` with the `threadKey` or `parent` space + thread name from the event. Must handle threads with <10 messages. Pass messages as user/assistant turn context to Claude. |
| Google Chat card formatting | Claude's reply is visually distinct from human messages — easy to scan, clearly attributed | Medium | Use `cardsV2` with a `header` (title: "Claude", subtitle: space/thread info) and a `textParagraph` widget for the response body. Cards support basic markdown in `textParagraph`. |
| "Thinking..." indicator | Long Anthropic API calls (2-8s) leave users wondering if anything happened | Medium | Requires a two-step pattern: (1) immediately return a card saying "Thinking...", (2) use the REST API (`spaces.messages.update`) to replace it. This needs a bot service account with the Chat API scope. More complex than a single-response flow. |
| System prompt customization | SEV-specific framing makes Claude more useful for esports/ops context | Low | Already planned — pass the SEV system prompt as the `system` parameter in the Anthropic API call. No extra complexity. |
| Structured error cards | Errors shown as cards with error icon look intentional rather than broken | Low | Minor UX improvement over plain text errors. Use a card with a red header or error icon widget. |
| Usage hint on `/help` or empty invocation | New users immediately know what the bot can do | Low | Check `argumentText` — if blank or "help", return a formatted card explaining the slash command syntax and examples. |

---

## Anti-Features

Features to explicitly NOT build in v1. Either add complexity without proportionate value, or are out of scope per PROJECT.md.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| DM support | Out of scope per PROJECT.md; DMs have different event structure and no space-based access control | Spaces only. Return a plain-text message if invoked in a DM: "This bot only works in authorized spaces." |
| Per-user allowlisting | Requires a persistence layer (database or config file); adds operational complexity; space-level is sufficient for a team bot | Space-level allowlist via `ALLOWED_SPACE_IDS` env var covers the use case |
| Conversation memory across sessions | Requires a database and session management; RAG or embedding lookups add significant complexity | Thread context (last 10 messages in the current thread) is enough for a team assistant |
| Configurable model per space | Multiple models = multiple billing considerations, inconsistent quality, configuration surface area | Fix to `claude-sonnet-4-6` for consistency |
| Webhook registration UI or admin panel | Overkill for a small team bot; Railway env vars suffice | Manage `ALLOWED_SPACE_IDS` via Railway dashboard |
| Streaming responses | Google Chat's synchronous webhook model does not support streaming natively — you'd need a two-step update pattern (post placeholder, then update) which adds significant complexity | Non-streaming Anthropic SDK call, return full response in one shot. If latency is painful, add "Thinking..." card later (v2). |
| Interactive card buttons / dialogs | Google Chat supports interactive cards (button clicks send ACTION events back to the bot) but this requires handling multiple event types and stateful interactions | Slash command only for v1. Cards are display-only. |
| Multi-command routing | Supporting `/claude-summarize`, `/claude-draft`, etc. as separate commands means registering multiple commands in the Google Cloud Console and routing logic | Single `/claude` command with free-form prompt covers the use case |
| Proactive/scheduled messages | Bot could post daily summaries etc., but requires background job infrastructure and Chat REST API write scope | Reactive only (respond to slash commands) in v1 |

---

## Feature Dependencies

```
Webhook request verification
  → must happen before any other processing (blocks malicious requests)

Access control enforcement (ALLOWED_SPACE_IDS check)
  → depends on: webhook request verification (only check authorized requests)
  → must happen before: Anthropic API call (avoid burning tokens on unauthorized spaces)

Thread context injection
  → depends on: a bot service account with spaces.messages.list scope
  → depends on: event payload containing space.name + thread.name
  → feeds into: Anthropic API call (context is part of the messages array)

Anthropic API call
  → depends on: access control passed
  → depends on: thread context (optional but planned)
  → depends on: non-empty argumentText

Card response formatting
  → depends on: Anthropic API response text
  → returns: cardsV2 JSON in HTTP response body

"Thinking..." indicator (v2 only)
  → depends on: bot service account with spaces.messages.create + update scope
  → depends on: async response pattern (breaks simple request/response flow)
```

---

## MVP Recommendation

Prioritize in this order:

1. **Webhook request verification** — security gate, implement first, nothing else matters without it
2. **Slash command event parsing + access control** — `ALLOWED_SPACE_IDS` check before any API call
3. **Graceful empty-prompt handling** — cheap, prevents confusing errors
4. **Anthropic API call with SEV system prompt** — core value, non-streaming
5. **Card response formatting** — `cardsV2` with "Claude" header and response body
6. **Thread context injection** — big value-add, implement as part of v1 per PROJECT.md requirements
7. **Rate limit + error handling** — catch Anthropic 429/500, return user-facing error card

**Defer to v2:**
- "Thinking..." indicator: Adds meaningful UX but requires async update pattern (service account + REST API write). Not worth the complexity for v1.
- Structured error cards: Plain text errors are fine for v1.
- Interactive card elements: Out of scope.

---

## Implementation Notes

### Slash command event payload (key fields)

When a user invokes `/claude some text`, Google Chat POSTs to your webhook:

```json
{
  "type": "MESSAGE",
  "message": {
    "name": "spaces/SPACE_ID/messages/MESSAGE_ID",
    "text": "/claude some text",
    "argumentText": "some text",
    "slashCommand": {
      "commandId": "1"
    },
    "thread": {
      "name": "spaces/SPACE_ID/threads/THREAD_ID"
    }
  },
  "space": {
    "name": "spaces/SPACE_ID",
    "type": "ROOM"
  },
  "user": {
    "name": "users/USER_ID",
    "displayName": "Alice"
  }
}
```

Key fields: `message.argumentText` (the prompt text), `space.name` (for access control), `message.thread.name` (for thread context lookup and reply threading).

### Card response format (cardsV2)

```json
{
  "cardsV2": [{
    "cardId": "claude-response",
    "card": {
      "header": {
        "title": "Claude",
        "subtitle": "claude-sonnet-4-6"
      },
      "sections": [{
        "widgets": [{
          "textParagraph": {
            "text": "Claude's response text here"
          }
        }]
      }]
    }
  }]
}
```

### Thread context fetch

To get the last 10 messages from a thread before calling Claude:

- API: `GET https://chat.googleapis.com/v1/{thread.name}/messages?pageSize=10&orderBy=createTime desc`
- Requires: Google OAuth2 service account with `https://www.googleapis.com/auth/chat.messages.readonly` scope
- The bot must be a member of the space (added via Google Cloud Console when registering the bot)

---

## Sources

- Training data: Google Chat API v1 developer documentation (https://developers.google.com/workspace/chat) — verified stable as of August 2025. **MEDIUM confidence** — verify current endpoint signatures before implementation.
- Training data: Anthropic API SDK (`@anthropic-ai/sdk`) error types and rate limit behavior. **MEDIUM confidence.**
- PROJECT.md requirements for scope decisions (table stakes vs out-of-scope). **HIGH confidence** — source of truth for this project.
