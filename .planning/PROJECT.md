# ClaudeGGChat

## What This Is

A Google Chat bot for the SEV team that responds to `/claude [prompt]` slash commands in authorized spaces. The bot reads recent thread context, calls the Anthropic API (claude-sonnet-4-6), and posts Claude's reply as a Google Chat card inline in the thread. Deployed on Railway with JWT auth, structured logging, and startup validation.

## Core Value

Any SEV teammate can query Claude directly from Google Chat, in context, without leaving their workflow.

## Requirements

### Validated

- ✓ Bot responds to `/claude [prompt]` slash command in Google Chat — v1.0
- ✓ Bot reads the last ~10 messages from the thread as context before calling Claude — v1.0
- ✓ Claude is called with a SEV-specific system prompt identifying it as a team assistant — v1.0
- ✓ Claude's reply is posted as a Google Chat card with a "Claude" header — v1.0
- ✓ Only authorized Google Chat spaces (configured via ALLOWED_SPACE_IDS env var) can invoke the bot — v1.0
- ✓ Bot deployed on Railway and accessible via public HTTPS webhook — v1.0

### Active

(None — all v1.0 requirements validated. Add v1.1 requirements here.)

### Out of Scope

- DM support — spaces-only for v1; simplifies access control
- Per-user allowlisting — space-level access control is sufficient
- Configurable model per-space — single model (claude-sonnet-4-6) for consistency
- Storing conversation history beyond the current thread — no persistence layer in v1
- Streaming responses — incompatible with synchronous webhook model

## Context

- Team: SEV (esports organization)
- **v1.0 shipped 2026-03-13** — live at https://claudeggchat-production.up.railway.app
- 413 LOC production TypeScript, 1,178 total with tests, 48 automated tests passing
- Tech stack: Node.js, Express, TypeScript, @anthropic-ai/sdk, googleapis, google-auth-library
- Thread context: last 10 messages via `spaces.messages.list` AIP-160 filter with client-side fallback
- System prompt: "You are a helpful assistant for the SEV team. Be concise and direct. You help with tasks related to our projects, sponsors, and operations."

## Constraints

- **Runtime**: Node.js (natural fit for Google Chat webhooks + Anthropic SDK)
- **Deployment**: Railway — must expose a public HTTPS URL for Google Chat to POST to
- **API**: Anthropic API (claude-sonnet-4-6) via `@anthropic-ai/sdk`
- **Auth**: Google Chat OIDC JWT verification (audience = BOT_ENDPOINT Railway URL)
- **Access control**: ALLOWED_SPACE_IDS env var — bot ignores commands from non-listed spaces

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Response as Google Chat card | Visually distinct from human messages; makes Claude's replies easy to scan | ✓ Good — cardsV2 with RESP-03 plain-text fallback |
| Last 10 messages as thread context | Enough context for most queries without bloating token usage | ✓ Good — AIP-160 filter + client-side fallback covers API uncertainty |
| Space-level access via env var | Simple, no database required; Railway env vars are easy to update | ✓ Good — works well for small team |
| claude-sonnet-4-6 | Best quality/speed/cost balance for a team assistant use case | ✓ Good — fast, accurate replies |
| setImmediate async pattern | Guarantees 200 flushes before any async work; prevents Google Chat 3s timeout | ✓ Good — essential architectural decision |
| JWT audience = BOT_ENDPOINT (Railway URL) | App is a Workspace Add-on, not native Chat App — audience is the webhook URL | ✓ Good — corrected from initial assumption (project number) |
| google-auth-library for JWT | Handles JWKS caching and cert rotation automatically | ✓ Good — no manual JWKS management |
| Conversation history format for context | Prior messages as user/assistant turns in messages array (not system prompt) | ✓ Good — Claude understands thread as real conversation |
| validateEnv() in index.ts | Centralized startup check; extracted to util for Jest testability | ✓ Good — process.exit tested via jest.spyOn |
| Plain JSON console.log for logging | Zero dependencies; Railway streams stdout; parseable by log aggregators | ✓ Good — simple and effective |

---
*Last updated: 2026-03-13 after v1.0 milestone*
