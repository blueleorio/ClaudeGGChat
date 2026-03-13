---
phase: quick-1
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/handlers/chatEvent.ts
  - src/chat/chatClient.ts
  - src/claude/anthropicClient.ts
  - src/middleware/checkSpaceAllowlist.ts
  - src/__tests__/chatEvent.test.ts
  - src/__tests__/webhook.test.ts
autonomous: true
requirements: [CONSISTENCY-01]

must_haves:
  truths:
    - "All source files read request body from the same nested path: req.body.chat.appCommandPayload.*"
    - "Tests use a request body shape that matches the path the handler actually reads"
    - "No console.log debug statements remain in production source files"
    - "checkSpaceAllowlist.ts contains no dead reads (unused variables)"
    - "npm test passes with zero failures"
  artifacts:
    - path: "src/handlers/chatEvent.ts"
      provides: "chat event handler — no debug logs"
    - path: "src/middleware/checkSpaceAllowlist.ts"
      provides: "space allowlist middleware — consistent body path, no dead reads, no debug logs"
    - path: "src/__tests__/chatEvent.test.ts"
      provides: "unit tests using real nested body shape"
    - path: "src/__tests__/webhook.test.ts"
      provides: "integration tests using real nested body shape"
  key_links:
    - from: "src/__tests__/chatEvent.test.ts"
      to: "src/handlers/chatEvent.ts"
      via: "makeMockReq builds req.body.chat.appCommandPayload.*"
      pattern: "chat\\.appCommandPayload"
    - from: "src/__tests__/webhook.test.ts"
      to: "src/middleware/checkSpaceAllowlist.ts"
      via: "validBody builds req.body.chat.appCommandPayload.*"
      pattern: "chat\\.appCommandPayload"
---

<objective>
Consistency pass across all TypeScript source files after JSON nesting bug fixes. The
real Google Chat slash command event payload uses the nested path
`req.body.chat.appCommandPayload.*`, but the unit and integration test helpers still
build the old flat shape (`req.body.message.*`, `req.body.space.*`). This means the
async block in chatEvent.ts always sees undefined spaceName/threadName in tests, and
the allowlist middleware tests pass only by coincidence. Additionally, production files
contain leftover console.log debug calls and checkSpaceAllowlist.ts reads unused
variables.

Purpose: Make tests faithfully exercise the real code path; remove debug noise from
production.

Output: All tests green, no console.log calls in production code, no dead variable
reads.
</objective>

<execution_context>
@C:/Users/BeluKotu/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/BeluKotu/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md

Key confirmed decisions from STATE.md:
- req.body path for all event fields is req.body.chat.appCommandPayload.* (real Google
  Chat slash command shape confirmed live in production)
- setImmediate used for async stub to guarantee 200 flushes before async work
- chatClient singleton; tests mock entire module
</context>

<interfaces>
<!-- Real Google Chat slash command event shape (confirmed live) -->
req.body.chat.appCommandPayload.appCommandMetadata.appCommandType  → "SLASH_COMMAND"
req.body.chat.appCommandPayload.message.argumentText               → user prompt string
req.body.chat.appCommandPayload.message.space.name                 → e.g. "spaces/AAAA8WYwwy4"
req.body.chat.appCommandPayload.message.thread.name                → e.g. "spaces/X/threads/t1"

<!-- chatEvent.ts reads (current implementation) -->
const argumentText = req.body?.chat?.appCommandPayload?.message?.argumentText
const spaceName    = req.body?.chat?.appCommandPayload?.message?.space?.name
const threadName   = req.body?.chat?.appCommandPayload?.message?.thread?.name

<!-- checkSpaceAllowlist.ts reads (current implementation) -->
const spaceName  = req.body?.chat?.appCommandPayload?.message?.space?.name ?? ""
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Fix test helpers to use real nested body shape</name>
  <files>src/__tests__/chatEvent.test.ts, src/__tests__/webhook.test.ts</files>
  <action>
Update both test helpers so the mock request body matches the actual nested path the
production code reads.

In src/__tests__/chatEvent.test.ts, replace the makeMockReq function:

OLD:
  function makeMockReq(argumentText = ' hello'): Partial<Request> {
    return {
      body: {
        message: {
          slashCommand: {},
          argumentText,
          thread: { name: 'spaces/X/threads/t1' },
        },
        space: { name: 'spaces/X' },
      },
    };
  }

NEW:
  function makeMockReq(argumentText = ' hello'): Partial<Request> {
    return {
      body: {
        chat: {
          appCommandPayload: {
            appCommandMetadata: { appCommandType: 'SLASH_COMMAND' },
            message: {
              argumentText,
              space: { name: 'spaces/X' },
              thread: { name: 'spaces/X/threads/t1' },
            },
          },
        },
      },
    };
  }

In src/__tests__/webhook.test.ts, replace the validBody helper:

OLD:
  const validBody = (argumentText: string) => ({
    type: 'MESSAGE',
    message: {
      argumentText,
      slashCommand: { commandId: '1' },
      thread: { name: 'spaces/AAAA8WYwwy4/threads/t1' },
    },
    space: { name: 'spaces/AAAA8WYwwy4' },
  });

NEW:
  const validBody = (argumentText: string) => ({
    chat: {
      appCommandPayload: {
        appCommandMetadata: { appCommandType: 'SLASH_COMMAND' },
        message: {
          argumentText,
          space: { name: 'spaces/AAAA8WYwwy4' },
          thread: { name: 'spaces/AAAA8WYwwy4/threads/t1' },
        },
      },
    },
  });

Also update the inline body objects in webhook.test.ts that do NOT use validBody:

1. The "space is not in ALLOWED_SPACE_IDS" test (unlistedBody) — change to nested shape
   with space.name = 'spaces/UNLISTED999'.

2. The "no slashCommand field" test (nonSlashBody) — change to nested shape but with
   appCommandType set to something other than 'SLASH_COMMAND' (e.g. 'MESSAGE_TYPE') so
   the guard fires correctly. Or simply omit appCommandMetadata so the type check sees
   undefined and returns {}.

3. The "message field is absent" test (noMessageBody) — change to nested shape with
   appCommandPayload omitted entirely so the type check sees undefined.

Do NOT add new test cases — only update body shapes in existing tests.
  </action>
  <verify>
    <automated>cd D:/SEV/VSCODE/ClaudeGGChat && npx jest --testPathPattern="chatEvent|webhook" --no-coverage 2>&1 | tail -20</automated>
  </verify>
  <done>All chatEvent and webhook tests pass with the nested body shape. No test reads
from req.body.message.* or req.body.space.* anymore.</done>
</task>

<task type="auto">
  <name>Task 2: Remove debug console.log calls and dead variable reads from production files</name>
  <files>src/handlers/chatEvent.ts, src/chat/chatClient.ts, src/claude/anthropicClient.ts, src/middleware/checkSpaceAllowlist.ts</files>
  <action>
Remove every console.log debug statement from production source files. Do NOT remove
the console.error calls in chatEvent.ts (those are legitimate error reporting).

src/handlers/chatEvent.ts — remove these three lines entirely:
  - console.log("You somehow at chatEvent.ts");
  - console.log("You passed the SLASH_COMMAND check");
  - console.log("You passed the EMPTY_PROMT check");
  - console.log("You passed the SET_IMMEDIATE check");

src/chat/chatClient.ts — remove this line:
  - console.log("You somehow end up in the chatClient here!");

src/claude/anthropicClient.ts — remove this line:
  - console.log("You somehow end up in the ClaudeCode here!");

src/middleware/checkSpaceAllowlist.ts — remove ALL of the following:
  - The dead reads of threadName and prompt (these variables exist solely for the
    removed console.log calls and are not used in any logic)
  - console.log("Received spaceName:", spaceName);
  - console.log("Received threadName:", threadName);
  - console.log("Received promt:", prompt);
  - console.log("You stuck at checkSpaceAllowlist.ts:");
  - The commented-out line: // console.log("BODY:", JSON.stringify(req.body, null, 2));

After removing threadName and prompt reads, checkSpaceAllowlist.ts should contain only:
  - the allowedSpaces derivation
  - const spaceName = req.body?.chat?.appCommandPayload?.message?.space?.name ?? "";
  - the allowedSpaces.includes(spaceName) guard
  - next()

Also remove the dead comment block in src/index.ts:
  // // Test endpoint for Google Chat
  // app.post("/", (req, res) => {
  //   console.log("Received event:", JSON.stringify(req.body, null, 2));
  //   res.status(200).json({ text: "OK" });
  // });

(Add src/index.ts to files_modified if you touch it.)
  </action>
  <verify>
    <automated>cd D:/SEV/VSCODE/ClaudeGGChat && npx jest --no-coverage 2>&1 | tail -20</automated>
  </verify>
  <done>
- No console.log calls remain in any production .ts file under src/ (excluding test
  files and __tests__/).
- console.error in chatEvent.ts async block is preserved.
- checkSpaceAllowlist.ts has no unused variable declarations.
- Full test suite passes.
  </done>
</task>

</tasks>

<verification>
Run the full test suite:
  cd D:/SEV/VSCODE/ClaudeGGChat && npx jest --no-coverage

Confirm console.log absence in production files:
  grep -rn "console\.log" D:/SEV/VSCODE/ClaudeGGChat/src --include="*.ts" \
    --exclude-dir=__tests__

Expected: zero matches from production files.
</verification>

<success_criteria>
- npm test (all suites) exits 0 with no failures
- chatEvent.test.ts mock request body uses req.body.chat.appCommandPayload.* path
- webhook.test.ts validBody and all inline bodies use req.body.chat.appCommandPayload.* path
- Zero console.log calls in production source files (grep returns nothing outside __tests__)
- checkSpaceAllowlist.ts has no unused variable declarations (threadName, prompt removed)
- console.error calls in chatEvent.ts are preserved
</success_criteria>

<output>
After completion, create .planning/quick/1-review-code-for-consistency-after-json-n/1-SUMMARY.md
</output>
