# ClaudeGGChat

## What This Is

A Google Chat bot for the SEV team that responds to `/claude [prompt]` slash commands in authorized spaces and DMs. When a teammate invokes the command, the bot reads recent thread context, calls the Anthropic API (claude-sonnet-4-6), and posts Claude's reply as a Google Chat card inline in the thread. Deployed on Railway.

## Core Value

Any SEV teammate can query Claude directly from Google Chat, in context, without leaving their workflow.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Bot responds to `/claude [prompt]` slash command in Google Chat
- [ ] Bot reads the last ~10 messages from the thread as context before calling Claude
- [ ] Claude is called with a SEV-specific system prompt identifying it as a team assistant
- [ ] Claude's reply is posted as a Google Chat card with a "Claude" header
- [ ] Only authorized Google Chat spaces (configured via ALLOWED_SPACE_IDS env var) can invoke the bot
- [ ] Bot deployed on Railway and accessible via public HTTPS webhook

### Out of Scope

- DM support (not in initial scope — spaces only) — keep it simple for v1
- Per-user allowlisting — space-level access control is sufficient
- Configurable model per-space — single model (claude-sonnet-4-6) for consistency
- Storing conversation history beyond the current thread — no persistence layer in v1

## Context

- Team: SEV (esports organization)
- Google Chat slash commands require a publicly accessible HTTPS endpoint to receive webhook events
- Anthropic API key and ALLOWED_SPACE_IDS will be stored as Railway environment variables
- System prompt: "You are a helpful assistant for the SEV team. Be concise and direct. You help with tasks related to our projects, sponsors, and operations."
- Thread context: last 10 messages from the thread passed as context to Claude

## Constraints

- **Runtime**: Node.js (natural fit for Google Chat webhooks + Anthropic SDK)
- **Deployment**: Railway — must expose a public HTTPS URL for Google Chat to POST to
- **API**: Anthropic API (claude-sonnet-4-6) via `@anthropic-ai/sdk`
- **Auth**: Google Chat webhook verification (request signing or token check)
- **Access control**: ALLOWED_SPACE_IDS env var — bot ignores commands from non-listed spaces

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Response as Google Chat card | Visually distinct from human messages; makes Claude's replies easy to scan | — Pending |
| Last 10 messages as thread context | Enough context for most queries without bloating token usage | — Pending |
| Space-level access via env var | Simple, no database required; Railway env vars are easy to update | — Pending |
| claude-sonnet-4-6 | Best quality/speed/cost balance for a team assistant use case | — Pending |

---
*Last updated: 2026-03-12 after initialization*
