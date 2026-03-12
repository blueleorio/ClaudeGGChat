# Domain Pitfalls

**Domain:** Google Chat slash command bot — Anthropic API + Railway deployment
**Researched:** 2026-03-12
**Confidence note:** Web search and WebFetch tools were unavailable. All findings are from training knowledge (cutoff August 2025). Where official documentation behaviour is well-established (e.g., the 30s deadline), confidence is HIGH. Where behaviour is version-specific or less-documented, confidence is noted per-pitfall.

---

## Critical Pitfalls

Mistakes that cause rewrites, silent failures, or security incidents.

---

### Pitfall 1: Violating the 30-Second Synchronous Response Deadline

**Confidence:** HIGH — This is a hard platform constraint documented by Google.

**What goes wrong:** Google Chat requires a synchronous HTTP response within 30 seconds of receiving a webhook event. If the server returns a non-2xx status or times out, Google Chat displays an error to the user ("The app encountered an error"). Anthropic API calls, especially with thread context attached, routinely take 5–20+ seconds. If the bot tries to fetch thread messages AND call the Anthropic API synchronously before responding, it will frequently exceed the deadline.

**Why it happens:** Developers treat the Google Chat webhook like a normal REST API: receive request, do work, return result. This works in local testing with short prompts but breaks under real load or longer completions.

**Consequences:** Users see error messages instead of Claude's reply. The failure is non-obvious in logs because the server itself succeeded — only Google's side timed out.

**Prevention:**
- Respond to Google Chat with HTTP 200 immediately (even an empty body or a "thinking..." acknowledgement card).
- Do the Anthropic API call asynchronously AFTER acknowledging.
- Post the final reply via the Google Chat REST API (`spaces.messages.create` or `spaces.messages.patch`) using the `threadKey` or `thread.name` from the original event.
- Use `setImmediate` or a detached async function to avoid blocking the response.

**Warning signs:**
- Works in development but users report errors in production.
- Logs show successful Anthropic responses but Google Chat shows "app encountered an error".
- Latency of responses is close to or over 25 seconds.

**Phase:** Address in Phase 1 (core webhook handler). This is architectural — retrofitting it later is painful.

---

### Pitfall 2: Missing or Incorrect Webhook Request Verification

**Confidence:** HIGH — Google documents this; skipping it is a real security hole.

**What goes wrong:** Google Chat sends webhook events to your public HTTPS endpoint. Without verification, any actor who discovers your URL can send arbitrary slash command events, bypass ALLOWED_SPACE_IDS checks, and invoke the Anthropic API at your cost.

**Why it happens:** During development, developers skip verification to move fast. It never gets added.

**Consequences:** Open relay for arbitrary Anthropic API calls. Potential prompt injection from external actors. Cost exposure.

**Prevention:**
- Google Chat HTTP bots: verify the `Authorization: Bearer <token>` header. The token is a Google-signed JWT. Validate it using Google's public keys (via `google-auth-library` or manual JWKS verification). The audience claim must match your bot's service account email.
- Do NOT rely on ALLOWED_SPACE_IDS alone — that check happens after the request body is parsed, which is too late.
- Reject any request that fails JWT verification with HTTP 401 before touching the body.

**Warning signs:**
- No JWT validation code in the request handler.
- ALLOWED_SPACE_IDS is the only guard.
- Verification is TODO'd or "will add later".

**Phase:** Address in Phase 1, alongside the webhook handler. It is a single middleware function — no reason to defer.

---

### Pitfall 3: Thread Message Fetching Auth Misconfiguration

**Confidence:** HIGH — Service account domain-wide delegation is a common stumbling block.

**What goes wrong:** Reading thread history requires calling the Google Chat REST API (`spaces.messages.list`). This API call must be authenticated. The bot runs as a service account, but service accounts cannot impersonate users to read messages in a space unless domain-wide delegation (DWD) is configured — and DWD requires Google Workspace admin access. Without it, the API returns 403.

**Why it happens:** Developers assume a service account with Chat API access can read any space it's been added to. The permission model is more nuanced: bots can read messages in spaces they are members of, but only as themselves (the bot identity), not as a user.

**Consequences:** Thread context fetch silently fails or throws. Bot either crashes or falls back to no context (degraded quality).

**Prevention:**
- Use the service account's own credentials (not DWD) with `googleapis` or `google-auth-library`. The bot's service account IS a member of authorized spaces — it can list messages in those spaces without DWD.
- Authenticate with `auth.getClient()` scoped to `https://www.googleapis.com/auth/chat.messages.readonly`.
- Test the `spaces.messages.list` call against a real space (not a mock) early in development.
- Handle 403 gracefully: log, skip context, still call Anthropic with just the user prompt.

**Warning signs:**
- 403 errors from `chat.googleapis.com` in logs.
- Thread context always empty.
- Code tries to impersonate a user email instead of using the service account directly.

**Phase:** Address in Phase 1 or Phase 2 (when thread context is added). Do not leave auth untested.

---

### Pitfall 4: Railway Cold Starts Causing First-Request Timeouts

**Confidence:** MEDIUM — Railway's sleep-on-inactivity behaviour is well-known but varies by plan.

**What goes wrong:** Railway's free/hobby tier sleeps inactive services after a period of inactivity. The first request after sleep incurs a cold start (container spin-up). This startup time can be 5–15 seconds. Combined with the Anthropic API call, the total easily exceeds Google Chat's 30-second deadline.

**Why it happens:** Developers test on an active service during development. The cold-start problem only manifests in production after idle periods.

**Consequences:** First user command after idle always fails. Creates a confusing "it works sometimes" failure mode.

**Prevention:**
- Use Railway's always-on / paid tier for production bots (no sleep).
- Alternatively, implement a lightweight health check endpoint (`GET /health` returning 200) and use an external uptime monitor (e.g., UptimeRobot free tier) to ping every 5 minutes, preventing sleep.
- Keep the Node.js startup path minimal — avoid heavy initialization at module load time.

**Warning signs:**
- Bot fails on first invocation after being idle for > 30 minutes.
- Subsequent requests in the same session succeed.
- Railway logs show container starting immediately before a failed request.

**Phase:** Address before or during Phase 1 deployment. The async-first response pattern (Pitfall 1) partially mitigates this, but cold start + async still needs the bot to come up fast enough to return HTTP 200.

---

### Pitfall 5: Port Binding Mismatch on Railway

**Confidence:** HIGH — This is Railway's single most common deployment error.

**What goes wrong:** Railway injects the `PORT` environment variable at runtime. If the Express/Node server hardcodes port 3000 (or any other port), Railway's proxy cannot route traffic to it, and the deployment appears to hang or return 502.

**Why it happens:** Tutorials hardcode ports. Developers copy local config.

**Consequences:** Deployment succeeds (Railway shows "deployed") but all requests return 502. Very confusing because logs look clean.

**Prevention:**
- Always bind to `process.env.PORT`: `app.listen(process.env.PORT || 3000)`.
- Test that `PORT` is read at startup — log it at boot.

**Warning signs:**
- Railway shows service as deployed but webhook returns 502.
- Server logs show it listening on port 3000 while Railway assigns a different port.

**Phase:** Phase 1. One line of code; no excuse to get this wrong.

---

## Moderate Pitfalls

---

### Pitfall 6: Anthropic API Rate Limits Not Handled

**Confidence:** HIGH — Anthropic's SDK throws specific error types for rate limit (429) and overload (529) responses.

**What goes wrong:** If multiple users trigger `/claude` simultaneously, or if the Anthropic API is under load, requests return 429 (rate limit) or 529 (API overload). Unhandled, these throw exceptions that crash the async handler silently (since it runs after the HTTP 200 response). The user gets no reply and no error message.

**Prevention:**
- Wrap all Anthropic API calls in try/catch.
- On rate limit or overload, post an error card to the thread via the Chat API: "Claude is currently busy, please try again in a moment."
- Use `@anthropic-ai/sdk`'s built-in error types: `Anthropic.RateLimitError`, `Anthropic.APIError`.
- Consider exponential backoff with a single retry before giving up.

**Warning signs:**
- Async handler has no try/catch around the Anthropic call.
- User reports no response with no error message (silent failure).

**Phase:** Phase 1 (wire in from the start).

---

### Pitfall 7: ALLOWED_SPACE_IDS Check Applied Too Late or Incorrectly

**Confidence:** HIGH.

**What goes wrong:** The space ID check is implemented incorrectly (wrong field, wrong format) or applied after expensive operations (thread fetch, Anthropic call). Result: unauthorized spaces get responses, or the check throws on unexpected event shapes.

**Prevention:**
- Apply the space ID check immediately after JWT verification, before any other work.
- Google Chat event body: space ID is at `event.space.name` (format: `spaces/XXXXXXXXX`), NOT `event.space.spaceId`. Verify which field your API version provides.
- Parse `ALLOWED_SPACE_IDS` from env var as a comma-separated list and normalize both sides before comparison.
- Return HTTP 200 (not 403) for unauthorized spaces — returning errors causes Google Chat to retry and can flood your logs. Just silently ignore.

**Warning signs:**
- Access control never tested with a non-authorized space ID.
- Field name used is not verified against actual event payload.

**Phase:** Phase 1.

---

### Pitfall 8: Thread Context Fetch Includes Bot's Own Messages (Infinite Loop Risk)

**Confidence:** MEDIUM.

**What goes wrong:** When fetching the last 10 messages for thread context, the bot's own previous replies are included. If the context is naively passed to Claude without filtering, Claude sees its own prior outputs as "human" messages, which degrades response quality and can create confusing self-referential loops.

**Prevention:**
- Filter messages by sender: exclude messages where `message.sender.type === 'BOT'` or where `message.sender.name` matches the bot's own service account name.
- Alternatively, label bot messages clearly in the context: prepend "[Bot]" to distinguish them, and include in the system prompt that "[Bot]" messages are prior Claude responses.
- Test with a thread that has multiple bot responses in history.

**Warning signs:**
- Thread context includes messages with `sender.type: "BOT"`.
- Claude's responses reference its own prior messages oddly or repeat content.

**Phase:** Phase 2 (when thread context fetching is implemented).

---

### Pitfall 9: Google Cloud Project Setup Complexity Underestimated

**Confidence:** HIGH — This is consistently the biggest time sink for first-time Google Chat bot builders.

**What goes wrong:** Setting up a Google Chat bot requires: creating a GCP project, enabling the Chat API, creating a service account, granting the service account the correct IAM roles, configuring the bot in the Google Chat API console (app name, avatar, slash commands registration), and adding the bot to spaces. Each step has its own UI and each failure mode is opaque (generic "permission denied" or "app not found" errors).

**Prevention:**
- Budget 2–4 hours for GCP setup on first attempt, not 30 minutes.
- Document every step as you do it (GCP project ID, service account email, key file location) — you will need these values repeatedly.
- Enable APIs explicitly: `chat.googleapis.com` AND `admin.googleapis.com` if using any admin features.
- The slash command must be registered in the Google Chat API console with the exact command string (e.g., `/claude`) and the correct bot configuration URL pointing to your Railway endpoint.
- After changing the bot URL in the console, wait 1–2 minutes for propagation before testing.

**Warning signs:**
- "App not configured" or "App encountered an error" with no server-side logs (event never reached your server — the URL is wrong or not saved).
- JWT verification fails immediately — service account key file format is wrong or wrong account used.

**Phase:** Phase 0 / setup. Block out dedicated time; do not interleave with coding.

---

### Pitfall 10: Anthropic API Timeout Not Configured

**Confidence:** MEDIUM.

**What goes wrong:** By default, the Anthropic SDK uses a generous timeout (600 seconds). If the API hangs due to network issues or a stuck request, your async handler will wait indefinitely. The user sees no reply. The Railway container holds an open connection until Railway's own timeout kills it.

**Prevention:**
- Set an explicit timeout on the Anthropic client: `new Anthropic({ timeout: 25000 })` (25 seconds).
- This leaves ~5 seconds of buffer within the async flow after the initial 200 response.
- Catch timeout errors (`Anthropic.APIConnectionTimeoutError`) and post an error card to the thread.

**Warning signs:**
- No `timeout` parameter on the Anthropic client.
- Async handlers run indefinitely with no circuit breaker.

**Phase:** Phase 1.

---

## Minor Pitfalls

---

### Pitfall 11: Card Format Errors Cause Silent Message Failures

**Confidence:** MEDIUM.

**What goes wrong:** Google Chat card JSON has a strict schema (Card V2 format). Invalid card JSON causes the API call to fail with a 400 error. The user sees nothing. Newlines, special characters, and markdown in Claude's response can break card text fields if not handled.

**Prevention:**
- Escape or strip characters that break card JSON (`\n` in JSON strings must be `\\n`).
- Keep the card structure simple for v1: a single `textParagraph` widget inside one section is the most reliable format.
- Validate card payloads against a test space before shipping.
- Fallback: if the card call fails, retry with a plain text message.

**Phase:** Phase 1.

---

### Pitfall 12: Environment Variables Not Set Before First Deploy

**Confidence:** HIGH.

**What goes wrong:** Railway deploys succeed but the app crashes immediately because `ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, or `ALLOWED_SPACE_IDS` are not set. Node crashes with `Cannot read property of undefined` or similar.

**Prevention:**
- Validate all required env vars at startup and exit with a clear error message if any are missing.
- Set Railway env vars BEFORE the first deploy, not after.
- Never commit service account JSON or API keys to git. Use Railway's environment variable UI.

**Phase:** Phase 1.

---

### Pitfall 13: Service Account JSON in Env Var Needs Special Handling

**Confidence:** MEDIUM.

**What goes wrong:** The Google service account credentials are a JSON file. Storing the entire JSON as a Railway environment variable is the right approach, but `JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)` fails if the value has unescaped newlines (common when copy-pasting key files that contain `\n` in the private key field).

**Prevention:**
- When setting the env var in Railway, ensure the JSON is minified (single line) or that the private key newlines are `\n` literals not actual newlines.
- Use `JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.replace(/\\n/g, '\n'))` if Railway escapes them.
- Test parsing at startup and fail loudly if it breaks.

**Phase:** Phase 1 (deployment).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Webhook handler setup | Port binding mismatch (Railway) | `process.env.PORT`, logged at boot |
| Webhook handler setup | No JWT verification | Add as middleware before any handler logic |
| Webhook handler setup | Synchronous Anthropic call exceeds 30s | Async-first: respond 200, then call API |
| Webhook handler setup | Anthropic errors unhandled | try/catch with error card fallback |
| Space access control | Wrong space ID field from event | Verify against live event payload |
| Thread context fetch | 403 from Chat API | Use service account credentials, not DWD |
| Thread context fetch | Bot's own messages in context | Filter by `sender.type === 'BOT'` |
| Card formatting | Invalid card JSON | Simple TextParagraph widget, test early |
| GCP setup | Underestimated complexity | Dedicate 2–4 hours, document each step |
| Railway deployment | Cold starts near 30s limit | Always-on plan or uptime pinger |
| Railway deployment | Env vars missing at first boot | Validate at startup, set before deploy |

---

## Sources

All findings are from training knowledge (cutoff August 2025). The following official documentation URLs should be consulted to verify current behaviour:

- Google Chat HTTP bot documentation: `https://developers.google.com/workspace/chat/receive-message`
- Google Chat slash commands: `https://developers.google.com/workspace/chat/slash-commands`
- Google Chat card format (Card V2): `https://developers.google.com/workspace/chat/api/reference/rest/v1/cards`
- Anthropic SDK error handling: `https://github.com/anthropic-ai/anthropic-sdk-python` (note: check Node SDK equivalent)
- Railway environment variables: `https://docs.railway.app/guides/variables`

**Confidence by pitfall:**

| Pitfall | Confidence | Basis |
|---------|------------|-------|
| 30-second deadline | HIGH | Google-documented hard limit |
| JWT verification | HIGH | Google-documented security requirement |
| Service account / thread auth | HIGH | Google API permission model, well-documented |
| Railway cold starts | MEDIUM | Observed behaviour, plan-dependent |
| Railway port binding | HIGH | Railway-documented requirement |
| Anthropic rate limits | HIGH | Anthropic SDK documented error types |
| ALLOWED_SPACE_IDS check | HIGH | Event payload field names verified against Chat API v1 spec |
| Bot messages in context | MEDIUM | Deduced from API response structure |
| GCP setup complexity | HIGH | Widely reported developer experience |
| Anthropic timeout config | MEDIUM | SDK default observed, specific value needs verification |
| Card format strictness | MEDIUM | Observed from Chat API behaviour |
| Env var validation | HIGH | Node.js best practice, Railway behaviour |
| Service account JSON parsing | MEDIUM | Common Railway deployment issue |
