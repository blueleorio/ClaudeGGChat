# Phase 1: GCP & Railway Setup - Research

**Researched:** 2026-03-12
**Domain:** Railway (PaaS deployment) + Google Cloud Platform (Chat API, service accounts)
**Confidence:** HIGH

---

## Summary

Phase 1 is a pure infrastructure phase: no application logic is written. The goal is to have a public HTTPS endpoint live on Railway returning HTTP 200, a Google Cloud project with the Chat API enabled and a service account key downloaded, and the `/claude` slash command registered in the GCP Console pointing at that Railway URL. Success is validated by sending `/claude test` in the authorized space and seeing a POST event arrive at the Railway service log.

Railway auto-detects Node.js projects from `package.json`, injects a `PORT` env var, and provides a generated `*.up.railway.app` HTTPS domain. Health checks are configured either via the UI (Settings > Deploy > Healthcheck Path) or declaratively in `railway.json`. Google Chat slash commands for HTTP bots are registered under APIs & Services > Google Chat API > Configuration in GCP Console. Incoming webhook requests are authenticated via a JWT bearer token (issued by `chat@system.gserviceaccount.com`) that the bot must verify against Google's JWKS endpoint — this is the Phase 2 concern, but the GCP project number needed for verification must be noted in Phase 1.

**Primary recommendation:** Create a minimal Express server that responds to `GET /health` and binds to `process.env.PORT`, deploy to Railway, generate a domain, then complete all GCP Console steps in order: enable Chat API, configure the app with the Railway URL, register the `/claude` slash command. No application logic should be in this phase.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Server binds to `process.env.PORT` for Railway compatibility | Railway automatically injects `PORT`; Express must read it via `process.env.PORT` with a fallback default |
| INFRA-02 | `GET /health` endpoint returns HTTP 200 for Railway health checks | Railway health check pings `/health` before making a new deployment live; endpoint must return 200 |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ^4.21 | HTTP server for Railway | Lightest-weight option; official Railway Node.js guides use Express; no framework overhead |
| typescript | ^5.x | Type safety | Project constraints specify Node.js; TypeScript is the default for new Node projects in 2025 |
| ts-node / tsx | latest | Dev-time execution | Allows running `.ts` files without pre-compile step during development |

### Supporting (Phase 1 scope only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/express | ^4 | TypeScript types for Express | Required with TypeScript setup |
| @types/node | ^20 | Node.js type definitions | Required for `process.env`, `Buffer`, etc. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Express | Fastify | Fastify is faster, but Express has broader Railway/GCP documentation coverage and lower setup friction |
| Express | raw `http` module | Saves a dependency but adds boilerplate for routing and JSON parsing needed in later phases |

**Installation:**
```bash
npm install express
npm install -D typescript ts-node @types/express @types/node
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 1 only)

```
/
├── src/
│   └── index.ts          # Express app entry point (health endpoint only)
├── package.json          # "start": "node dist/index.js", "build": "tsc"
├── tsconfig.json
└── railway.json          # Declares healthcheckPath and startCommand
```

### Pattern 1: PORT Binding from Environment

**What:** Read `PORT` from `process.env` with a sensible local fallback.
**When to use:** Always — Railway injects `PORT` at runtime; hardcoding 3000 or 8080 will cause deployment failures.

```typescript
// Source: https://docs.railway.com/guides/deploy-node-express-api-with-auto-scaling-secrets-and-zero-downtime
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Pattern 2: Health Check Endpoint

**What:** A `GET /health` route returning HTTP 200.
**When to use:** Required for Railway zero-downtime deployments. Railway does not route traffic to a new deployment until this endpoint returns 200.

```typescript
// Source: https://docs.railway.com/guides/deploy-node-express-api-with-auto-scaling-secrets-and-zero-downtime
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### Pattern 3: railway.json Config-as-Code

**What:** Declare health check and start command in a committed config file.
**When to use:** Preferred over dashboard-only config — ensures reproducibility if the service is re-created.

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "startCommand": "node dist/index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300
  }
}
```

Source: https://docs.railway.com/reference/config-as-code

### Pattern 4: Environment Variable Storage (Railway)

**What:** All secrets (API keys, JSON key file content) stored as Railway service variables.
**When to use:** Never commit secrets to the repo. The JSON service account key is a multi-line value.

Multi-line JSON (like a service account key) can be pasted into Railway's Raw Editor directly. Access in Node.js:
```typescript
// The entire JSON key as an env var string
const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
```

Source: https://docs.railway.com/variables

### Anti-Patterns to Avoid

- **Hardcoding the port:** `app.listen(8080)` will conflict with Railway's injected `PORT`.
- **Skipping health check configuration:** Without it, Railway has no signal that the app is ready and will use a timeout-based fallback which delays deployment.
- **Storing the service account JSON key as a file in the repo:** This is a credential leak. Store it as an env var string and `JSON.parse()` at startup.
- **Setting Authentication Audience to "HTTP endpoint URL" in GCP Chat config:** Use "Project Number" instead. The project number is stable and does not change if the Railway URL changes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT bearer token verification | Custom JWT parser | `google-auth-library` or `jsonwebtoken` + `jwks-rsa` | JWKS key rotation, RS256 algorithm handling, audience/issuer validation — all non-trivial |
| Service account OAuth token generation | Custom HTTP flow | `google-auth-library` (GoogleAuth with JWT client) | Token expiry, refresh, and scope handling; Google rotates keys |
| Multi-line env var handling | Base64 encode/decode manually | Railway Raw Editor | Railway natively supports multi-line values in the variable editor |

**Key insight:** JWT verification for Google Chat uses RS256 with rotating public keys from a JWKS endpoint. Hand-rolling this is a security anti-pattern — use the official client libraries.

---

## Common Pitfalls

### Pitfall 1: Railway Domain Not Generated Before GCP Registration

**What goes wrong:** Developer configures the Google Chat slash command URL in GCP Console before the Railway domain exists, then forgets to update it.
**Why it happens:** GCP Console accepts any HTTPS URL, including non-existent ones.
**How to avoid:** Generate the Railway domain first (Settings > Networking > Generate Domain), verify `GET /health` returns 200, then go to GCP Console to register the URL.
**Warning signs:** Slash command events not arriving in Railway logs despite bot being registered.

### Pitfall 2: Wrong Authentication Audience in GCP Chat Config

**What goes wrong:** Bot configured with "HTTP endpoint URL" as the authentication audience. When the Railway URL changes (or is regenerated), the JWT audience changes, breaking verification in Phase 2.
**Why it happens:** GCP Chat config offers two audience options; "HTTP endpoint URL" seems intuitive.
**How to avoid:** Set Authentication Audience to "Project Number". The project number never changes.
**Warning signs:** 401 errors in Phase 2 when implementing JWT verification.

### Pitfall 3: Chat API Not Properly Configured (App vs. API)

**What goes wrong:** Developer enables the "Google Chat API" but skips the Configuration tab, so the app is never published to the test space and slash commands do not appear.
**Why it happens:** Enabling an API in GCP is separate from configuring the Chat app within that API.
**How to avoid:** After enabling the Chat API, navigate to APIs & Services > Google Chat API > Configuration and fill in all required fields (app name, avatar URL, HTTP endpoint URL, slash command).
**Warning signs:** `/claude` slash command does not appear when typing in Google Chat.

### Pitfall 4: Service Account Key Downloaded Once, Lost

**What goes wrong:** The JSON key file is downloaded once but not saved to Railway env vars before the laptop is reformatted or the file is deleted.
**Why it happens:** GCP only allows one download of each key at creation time.
**How to avoid:** Immediately after downloading, paste the entire JSON content into Railway as `GOOGLE_SERVICE_ACCOUNT_KEY`. Do not rely on local file storage.
**Warning signs:** Missing credential errors in later phases; inability to re-download the same key.

### Pitfall 5: Railway Cold Starts Causing Health Check Timeout

**What goes wrong:** Node.js app takes too long to start (e.g., performs heavy startup I/O) and Railway marks the deployment as failed.
**Why it happens:** The default health check timeout is 300 seconds, but cold starts on free/hobby Railway plans can be slow.
**How to avoid:** Keep Phase 1 server minimal — no heavy startup logic. The health endpoint should be the first route registered.
**Warning signs:** Railway dashboard shows "Deploy failed" with a health check timeout error.

---

## Code Examples

### Minimal Phase 1 Server (src/index.ts)

```typescript
// Verified pattern per Railway Node.js docs
// Source: https://docs.railway.com/guides/deploy-node-express-api-with-auto-scaling-secrets-and-zero-downtime
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Placeholder route — will receive Google Chat POST events in Phase 2
app.post('/', (req, res) => {
  console.log('Received event:', JSON.stringify(req.body, null, 2));
  res.status(200).json({ text: 'OK' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
```

### package.json scripts

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  }
}
```

### JWT Verification (for Phase 2 reference — do NOT implement in Phase 1)

```typescript
// Source: https://dev.to/foga/verifying-google-chat-request-in-nodejs-36i
// Source: https://developers.google.com/workspace/chat/verify-requests-from-chat
import jwksRsa from 'jwks-rsa';
import jwt from 'jsonwebtoken';

const jwksClient = new jwksRsa.JwksClient({
  jwksUri: 'https://www.googleapis.com/service_accounts/v1/jwk/chat@system.gserviceaccount.com',
  cache: true,
});

async function verifyGoogleChatRequest(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);

  return new Promise((resolve) => {
    jwt.verify(
      token,
      (header, callback) => {
        jwksClient.getSigningKey(header.kid, (err, key) => {
          callback(err, key?.getPublicKey());
        });
      },
      {
        audience: process.env.GOOGLE_CLOUD_PROJECT_NUMBER, // numeric string
        issuer: 'chat@system.gserviceaccount.com',
        algorithms: ['RS256'],
      },
      (err) => resolve(!err)
    );
  });
}
```

Note: `GOOGLE_CLOUD_PROJECT_NUMBER` must be captured during Phase 1 GCP setup and stored as a Railway env var.

---

## GCP Console Step Sequence

The following is the correct order for GCP setup (sequence matters — each step depends on the previous):

1. Create or select a GCP project in console.cloud.google.com
2. Enable the Google Chat API: APIs & Services > Library > "Google Chat API" > Enable
3. Create a service account: IAM & Admin > Service Accounts > Create Service Account
4. Download JSON key: Service Account > Keys > Add Key > Create new key > JSON > Download immediately
5. Store key in Railway: paste full JSON content as `GOOGLE_SERVICE_ACCOUNT_KEY` env var
6. Configure Chat app: APIs & Services > Google Chat API > Configuration:
   - App name: "ClaudeGGChat" (or similar)
   - Avatar URL: any publicly accessible image URL
   - Description: "Claude assistant for SEV team"
   - Connection settings: HTTP endpoint URL = Railway HTTPS URL (e.g., `https://your-app.up.railway.app`)
   - Authentication audience: **Project Number** (not HTTP endpoint URL)
   - Slash command: Add command, name `/claude`, ID `1`, description "Ask Claude a question"
   - Visibility: Specific people/groups — add authorized test space members
7. Note GCP project number: visible in GCP Console > Home > Project info panel — store as `GOOGLE_CLOUD_PROJECT_NUMBER` Railway env var (needed for Phase 2 JWT verification)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nixpacks (Railway build system) | Railpack (new default for new services) | 2024-2025 | Nixpacks still works for existing services; new deployments use Railpack automatically |
| Hangouts Chat API | Google Chat API | 2023 | Same API, renamed. Old docs referring to "Hangouts Chat" are still valid but use legacy naming |
| Credentials file on disk (`GOOGLE_APPLICATION_CREDENTIALS`) | JSON content as env var string | Ongoing best practice | PaaS deployments cannot use file-based credentials; inline env var is the standard |

**Deprecated/outdated:**
- `GOOGLE_APPLICATION_CREDENTIALS` pointing to a file path: Not usable in Railway (no filesystem access for secrets). Use inline JSON env var instead.
- Nixpacks `railway.json`: `railway.toml` and `railway.json` are both current; TOML is documented first in Railway docs but JSON is equivalent.

---

## Open Questions

1. **GCP project number format for JWT audience**
   - What we know: The audience field must be the project number (numeric), not the project ID (string like "my-project-123")
   - What's unclear: Whether Railway preserves numeric env var values as strings or coerces them
   - Recommendation: Store as a string, parse carefully in Phase 2

2. **Google Chat app approval for `chat.bot` scope**
   - What we know: The `chat.bot` scope does not require admin approval; `chat.app.*` does
   - What's unclear: Whether the SEV Google Workspace admin needs to approve the app before it appears in the space
   - Recommendation: Use `chat.bot` scope to avoid admin approval; test with a personal test space first

3. **Railway free tier cold starts**
   - What we know: Free/hobby Railway plans may sleep idle services
   - What's unclear: Current Railway plan tier for this project
   - Recommendation: Phase 1 success criteria include receiving a live event, which requires the service to be awake. If on a free plan, budget for first-request cold start delay and test accordingly.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — Wave 0 must install |
| Config file | None — see Wave 0 |
| Quick run command | `npm test` (after Wave 0 setup) |
| Full suite command | `npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Server binds to `process.env.PORT` | unit | `npm test -- --testPathPattern=health` | Wave 0 |
| INFRA-02 | `GET /health` returns HTTP 200 | unit/smoke | `npm test -- --testPathPattern=health` | Wave 0 |

Note: Phase 1 success criteria items 3, 4, and 5 (GCP Console registration, slash command event delivery, env var setup) are **manual-only** — they require a live GCP project, a real Google Chat space, and actual Railway deployment. These cannot be automated.

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Manual smoke test (send `/claude test` in authorized space, verify POST event in Railway logs)

### Wave 0 Gaps

- [ ] `src/index.test.ts` (or `__tests__/health.test.ts`) — covers INFRA-01, INFRA-02
- [ ] `jest.config.js` or `vitest.config.ts` — test framework config
- [ ] Framework install: `npm install -D jest ts-jest @types/jest` or `npm install -D vitest`
- [ ] `tsconfig.json` — required for TypeScript compilation

---

## Sources

### Primary (HIGH confidence)

- https://docs.railway.com/guides/deploy-node-express-api-with-auto-scaling-secrets-and-zero-downtime — PORT binding, health check endpoint pattern
- https://docs.railway.com/reference/config-as-code — `railway.json` format with `healthcheckPath` and `startCommand`
- https://docs.railway.com/variables — multi-line env var support (Raw Editor), sealed variables
- https://docs.railway.com/deployments/healthchecks — health check behavior, timeout, hostname
- https://developers.google.com/workspace/chat/verify-requests-from-chat — JWT bearer token verification for HTTP bots
- https://developers.google.com/workspace/chat/authenticate-authorize-chat-app — service account scopes and `chat.bot` scope
- https://developers.google.com/workspace/add-ons/chat/commands — slash command registration in GCP Console

### Secondary (MEDIUM confidence)

- https://dev.to/foga/verifying-google-chat-request-in-nodejs-36i — `jsonwebtoken` + `jwks-rsa` pattern for Chat JWT verification (multiple sources consistent with official docs)
- https://docs.cloud.google.com/iam/docs/keys-create-delete — service account key creation and download steps

### Tertiary (LOW confidence)

- Railway Railpack vs Nixpacks deprecation: mentioned in search results but not directly verified from Railpack official docs — treat as directionally correct but verify if build issues arise

---

## Metadata

**Confidence breakdown:**
- Standard stack (Express + Railway): HIGH — official Railway docs verified
- Railway config (railway.json, health check, PORT): HIGH — official Railway docs directly fetched
- GCP Chat API setup sequence: HIGH — official Google developers docs fetched
- JWT verification approach: HIGH — verified against both official Google docs and Node.js implementation example consistent with those docs
- Test framework choice: LOW — no existing test infrastructure detected; Wave 0 must decide jest vs vitest

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (Railway and GCP Console UI changes infrequently; JWT verification pattern is stable)
