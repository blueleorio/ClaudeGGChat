# Technology Stack

**Project:** ClaudeGGChat — Google Chat slash command bot powered by Anthropic API
**Researched:** 2026-03-12
**Confidence note:** Web search and WebFetch were unavailable during this session. Findings draw from training data (cutoff August 2025) cross-referenced against the project constraints in PROJECT.md. Version numbers are flagged with confidence levels. Verify pinned versions before first install.

---

## Recommended Stack

### Core Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 20 LTS | Runtime | LTS branch with active support through April 2026; Railway's nixpacks default picks up `engines.node` in package.json. Node 22 LTS is available but 20 is the safer choice until Railway nixpacks certifies it by default. |
| TypeScript | 5.x (latest 5.x) | Type safety | Catches Google Chat event shape mismatches at compile time. The Anthropic SDK ships first-class TypeScript types. Minimal overhead for a single-file bot. |

**Confidence:** MEDIUM — Node 20 LTS status verified from training data; Railway nixpacks Node 20 default confirmed from multiple sources prior to cutoff. Verify Railway's current default before deploying.

---

### HTTP Server

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Express | 4.x (^4.18) | Receive Google Chat webhook POSTs | Stable, zero-surprise HTTP server. Google Chat sends a single `POST /` with a JSON body; Express handles this in ~10 lines. Fastify or Hono would also work but add no value for a single-route bot. |
| `express` built-in JSON middleware | — | Parse webhook body | `express.json()` is sufficient. Do NOT use `body-parser` separately — it is bundled in Express 4.16+. |

**Confidence:** HIGH — Express 4.x is well-established; version confirmed stable through training cutoff.

**Why not Fastify/Hono:** Both are excellent but this bot has one route. The setup tax of learning a new framework's request lifecycle is not justified. Express wins on familiarity and copy-pasteable Google Chat examples.

---

### Google Chat Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `googleapis` | ^144.x | Google Chat REST API client (reading thread messages) | Official Google client library for Node.js. Required to call `chat.spaces.messages.list` to fetch the last 10 thread messages before calling Claude. |
| Google Application Default Credentials (ADC) via Service Account JSON | — | Authenticate to Google Chat API | Service account with Google Chat API scope is the standard machine-to-machine auth pattern for bots. Store the JSON key as a Railway env var (base64-encoded or raw JSON string). |

**Confidence:** MEDIUM — `googleapis` version 144.x is from training data; the package increments major versions frequently. Run `npm view googleapis version` to confirm before pinning.

**What you do NOT need:**

- `@google-cloud/chat` — This is a separate, newer client. It works but `googleapis` is more widely documented for slash command bots and has more community examples. Stick with `googleapis` to maximize searchable help.
- OAuth2 user flow — Not applicable. The bot acts as itself (service account), not on behalf of a user.

---

### Webhook Verification

Google Chat does NOT use HMAC request signing the way Slack does. Instead:

| Mechanism | Details |
|-----------|---------|
| Bearer token check | Google Chat sends an `Authorization: Bearer <token>` header. The token is a Google-signed OIDC JWT. Verify it using Google's public JWKS endpoint or the `google-auth-library` package. |
| `google-auth-library` | ^9.x | Verify the incoming OIDC JWT on every request before processing | Required for production security. The JWT's `aud` claim must match your Cloud project's client email or service account. |

**Confidence:** MEDIUM — This verification pattern is documented in Google's Chat bot quickstarts and was current as of training cutoff. Verify against current Google Workspace Chat docs before shipping.

**Implementation pattern:**

```typescript
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client();

async function verifyGoogleChatRequest(authHeader: string): Promise<boolean> {
  const token = authHeader.replace('Bearer ', '');
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CHAT_PROJECT_NUMBER, // your GCP project number
    });
    return !!ticket.getPayload();
  } catch {
    return false;
  }
}
```

---

### Anthropic API

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@anthropic-ai/sdk` | ^0.39.x | Call Claude API | Official SDK. Ships TypeScript types. Handles retries, streaming, and error classification. |
| Model | `claude-sonnet-4-6` | Response generation | Per PROJECT.md: best quality/speed/cost for a team assistant. Confirmed as available model in training data. |

**Confidence:** LOW for exact version (0.39.x) — the Anthropic SDK was at approximately 0.30–0.35 range at training cutoff and increments frequently. Run `npm view @anthropic-ai/sdk version` before pinning. The API interface (`client.messages.create`) is stable.

**Usage pattern for this bot:**

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: "You are a helpful assistant for the SEV team. Be concise and direct. You help with tasks related to our projects, sponsors, and operations.",
  messages: [
    // last 10 thread messages formatted as user/assistant turns
    ...threadContext,
    { role: 'user', content: slashCommandText },
  ],
});
```

**Why not streaming:** Google Chat slash command webhooks expect a synchronous JSON response or an immediate acknowledgement + follow-up message. Streaming complicates this for no UX benefit in a Chat card response. Use non-streaming `messages.create`.

---

### Google Chat Response Format

Google Chat slash commands can receive the response in two ways:

1. **Synchronous response** — Return a JSON body directly from the POST handler (max ~30 seconds before timeout).
2. **Asynchronous response** — Return HTTP 200 immediately, then call `chat.spaces.messages.create` separately.

**Recommended: Synchronous** for this bot. The Anthropic call typically completes in 2–8 seconds. A synchronous card response keeps the code simple. Add a timeout guard (25 seconds) to avoid Google Chat's 30-second hard timeout.

**Card format (Google Chat card v2):**

```typescript
function buildCardResponse(text: string) {
  return {
    cardsV2: [{
      cardId: 'claude-response',
      card: {
        header: { title: 'Claude', subtitle: 'via Anthropic API' },
        sections: [{
          widgets: [{ textParagraph: { text } }],
        }],
      },
    }],
  };
}
```

**Confidence:** HIGH — Cards v2 format is stable and widely documented.

---

### Environment & Configuration

| Tool | Purpose | Why |
|------|---------|-----|
| `dotenv` | Local `.env` loading | Standard pattern for local dev; Railway injects env vars natively in production so `dotenv` only runs in development. |
| Railway environment variables | Production secrets | `ANTHROPIC_API_KEY`, `ALLOWED_SPACE_IDS`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GOOGLE_CHAT_PROJECT_NUMBER`. Never commit secrets. |

**ALLOWED_SPACE_IDS pattern:**

```typescript
const allowedSpaces = new Set(
  (process.env.ALLOWED_SPACE_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
);

// In request handler:
const spaceId = event.space?.name; // e.g. "spaces/XXXXXXXXX"
if (!allowedSpaces.has(spaceId)) {
  return res.status(403).json({ text: 'This space is not authorized.' });
}
```

---

### Railway Deployment

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| Build method | Nixpacks (default) | Railway auto-detects Node.js from `package.json`. No Dockerfile needed for this simple bot. Nixpacks handles `npm ci && npm run build` for TypeScript. |
| Port binding | `process.env.PORT` | Railway injects `PORT` at runtime. Must use `app.listen(process.env.PORT \|\| 3000)`. Hard-coding port 3000 will break deployment. |
| Health check | `GET /` returning 200 | Railway's health check pings the root path. Add a simple handler to avoid false-positive restart loops. |
| Start command | `node dist/index.js` | After TypeScript compile. Set `"start": "node dist/index.js"` in package.json scripts. |
| Build command | `npm run build` | Set `"build": "tsc"` in package.json scripts. Railway nixpacks runs build before start. |
| Region | Default (us-west2) | No latency-sensitive requirement; default is fine. |

**Confidence:** HIGH for PORT binding (Railway requirement, well-documented). MEDIUM for nixpacks TypeScript handling — nixpacks TypeScript support was confirmed working as of training cutoff but verify with a test deploy.

**Railway-specific caveat:** Railway's nixpacks will detect TypeScript if `tsconfig.json` is present and run `npm run build` automatically. If it does not, add a `railway.toml`:

```toml
[build]
builder = "nixpacks"
buildCommand = "npm ci && npm run build"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/"
healthcheckTimeout = 10
```

---

### TypeScript Configuration

Minimal `tsconfig.json` for this project:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Why CommonJS, not ESM:** Express 4.x + `googleapis` work with both, but CommonJS avoids the `"type": "module"` footgun where Railway or nixpacks may not resolve `.js` extensions in compiled output correctly. ESM in Node.js+TypeScript+Railway adds friction with no benefit for a bot of this size.

---

## Full Dependency List

```bash
# Production
npm install express googleapis google-auth-library @anthropic-ai/sdk dotenv

# Dev
npm install -D typescript @types/node @types/express ts-node
```

No test framework listed — the project context does not mention tests in scope. Add `vitest` or `jest` if unit tests are needed later.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP server | Express 4.x | Fastify, Hono | Single route; complexity not justified |
| HTTP server | Express 4.x | Raw `http` module | Body parsing, middleware order become manual; error-prone |
| Google client | `googleapis` | `@google-cloud/chat` | Less community documentation for slash command bots; `googleapis` is the standard |
| Auth verification | `google-auth-library` JWT verify | No verification | Never skip — any public URL would accept spoofed POSTs |
| Deployment build | Nixpacks | Dockerfile | Dockerfile adds maintenance burden; nixpacks handles Node+TypeScript well |
| Anthropic calls | Synchronous | Streaming | Google Chat synchronous response model makes streaming add complexity with no UX benefit |
| Module system | CommonJS | ESM | ESM + TypeScript + Railway nixpacks has known edge cases in path resolution |

---

## What NOT to Use

| Technology | Why to Avoid |
|------------|--------------|
| LangChain / LlamaIndex | Massive overkill. This bot calls one model with a context window. No RAG, no chains, no agents needed. |
| Prisma / any ORM | No database in v1 per PROJECT.md. Adding a database dependency is premature. |
| `body-parser` (standalone) | Bundled in Express 4.16+. Using it separately adds a redundant dependency. |
| `node-fetch` / `axios` for Anthropic | The official SDK handles HTTP. Never re-implement API calls manually. |
| Webhook signature (HMAC) libraries | Google Chat uses OIDC JWT, not HMAC. Slack-style webhook signature libraries are wrong for this use case. |
| Google PubSub bot mode | Adds infra complexity (GCP PubSub topic). HTTP webhook is simpler and Railway-native. |

---

## Slash Command Setup (Google Cloud Console)

This is configuration, not code, but it blocks deployment — document here so it is not missed:

1. Create a GCP project and enable the Google Chat API.
2. In Google Chat API configuration, set the bot connection type to **HTTP endpoint URL** pointing to the Railway public URL.
3. Create a slash command (`/claude`) in the bot configuration. Note the command ID (e.g., `1`) — it appears in the webhook payload as `event.message.slashCommand.commandId`.
4. Create a service account with the **Google Chat API** scope (`https://www.googleapis.com/auth/chat.bot`).
5. Download the service account JSON key and store it as `GOOGLE_APPLICATION_CREDENTIALS_JSON` in Railway (base64 the JSON to avoid multiline env var issues).
6. The bot's GCP project number is needed for JWT audience verification.

**Confidence:** MEDIUM — This flow was current as of training cutoff. Google Cloud Console UI changes frequently; verify step-by-step against current Workspace docs when setting up.

---

## Sources

- Training data (knowledge cutoff August 2025) — flagged as MEDIUM/LOW where versions are involved
- Project constraints from `.planning/PROJECT.md`
- Google Chat API documented patterns (HTTP endpoint bot, slash commands, OIDC JWT verification)
- Railway nixpacks documentation patterns (PORT env var, nixpacks Node.js detection)
- Anthropic SDK documented API shape (`messages.create`, non-streaming)

**Verification actions needed before first install:**
- [ ] `npm view @anthropic-ai/sdk version` — confirm latest before pinning
- [ ] `npm view googleapis version` — confirm latest before pinning
- [ ] Check Railway docs for current nixpacks Node.js LTS default
- [ ] Check Google Chat API docs for any JWT verification changes
