import { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { chatClient } from "../chat/chatClient";
import { callClaude } from "../claude/anthropicClient";
import type { ContextMessage } from "../claude/anthropicClient";
import {
  buildUsageHintCard,
  buildReplyCard,
  buildErrorCard,
  buildThinkingCard,
} from "../chat/cards";

// ---------------------------------------------------------------------------
// Command handler type
// ---------------------------------------------------------------------------

type CommandHandler = (req: Request, res: Response) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Individual command handlers
// ---------------------------------------------------------------------------

/** Command ID 1 — Claude AI assistant */
async function handleClaude(req: Request, res: Response): Promise<void> {
  const argumentText = (
    req.body?.chat?.appCommandPayload?.message?.argumentText ?? ""
  ).trim();

  // Empty prompt — return usage hint card synchronously
  if (!argumentText) {
    res.status(200).json(buildUsageHintCard());
    return;
  }

  // Acknowledge immediately, process async
  res.status(200).json({});

  setImmediate(() => {
    void (async () => {
      const startTime = Date.now();
      const requestId = randomUUID();

      const spaceName: string =
        req.body?.chat?.appCommandPayload?.message?.space?.name;
      const threadName: string =
        req.body?.chat?.appCommandPayload?.message?.thread?.name;
      const triggeringMsgName: string | undefined =
        req.body?.chat?.appCommandPayload?.message?.name;

      console.log(`[claude][${requestId}] START prompt="${argumentText}" space=${spaceName} thread=${threadName}`);

      // Step 0: Fetch thread context (best-effort — CONT-03)
      console.log(`[claude][${requestId}] Step 0: fetching thread context`);
      let contextMessages: ContextMessage[] = [];
      try {
        const listRes = await chatClient.spaces.messages.list({
          parent: spaceName,
          pageSize: 10,
          orderBy: "createTime DESC",
          filter: `thread.name = "${threadName}"`,
        });
        let rawMessages = (listRes.data.messages ?? []).reverse();
        console.log(`[claude][${requestId}] Step 0: primary filter returned ${rawMessages.length} messages`);

        // Fallback: if filter returned empty and thread exists, try client-side filter
        if (rawMessages.length === 0 && threadName) {
          console.log(`[claude][${requestId}] Step 0: primary empty, trying fallback fetch`);
          const fallbackRes = await chatClient.spaces.messages.list({
            parent: spaceName,
            pageSize: 50,
            orderBy: "createTime DESC",
          });
          rawMessages = (fallbackRes.data.messages ?? [])
            .filter((m: any) => m.thread?.name === threadName)
            .slice(0, 10)
            .reverse();
          console.log(`[claude][${requestId}] Step 0: fallback returned ${rawMessages.length} messages`);
        }

        // Filter: exclude bot messages and the triggering command message
        const filtered = rawMessages.filter(
          (m: any) =>
            m.sender?.type !== "BOT" &&
            (!triggeringMsgName || m.name !== triggeringMsgName),
        );

        // Map to ContextMessage format — only messages with text content
        contextMessages = filtered
          .filter((m: any) => m.text && m.text.trim() !== "")
          .map((m: any) => ({
            role: "user" as const,
            content: m.text as string,
          }));
        console.log(`[claude][${requestId}] Step 0: using ${contextMessages.length} context messages`);
      } catch (err) {
        // CONT-03: best-effort — proceed without context on any error (including 403)
        console.warn(`[claude][${requestId}] Step 0: context fetch failed (proceeding without context):`, err);
      }

      // Step 1: Post "Thinking..." placeholder card
      console.log(`[claude][${requestId}] Step 1: posting Thinking card`);
      let messageName: string;
      try {
        const placeholderRes = await chatClient.spaces.messages.create({
          parent: spaceName,
          messageReplyOption: "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD",
          requestBody: {
            thread: { name: threadName },
            ...buildThinkingCard(),
          },
        });
        messageName = placeholderRes.data.name!;
        console.log(`[claude][${requestId}] Step 1: Thinking card posted as ${messageName}`);
      } catch (err) {
        console.error(`[claude][${requestId}] Step 1: failed to post Thinking card:`, err);
        return; // No message to PATCH — exit early
      }

      // Step 2: Call Claude and build reply or error card body
      console.log(`[claude][${requestId}] Step 2: calling Claude`);
      let replyBody: object;
      let fallbackText: string;
      try {
        const replyText = await callClaude(argumentText, contextMessages);
        console.log(`[claude][${requestId}] Step 2: Claude responded (${replyText.length} chars)`);
        replyBody = buildReplyCard(replyText);
        fallbackText = replyText;
      } catch (err) {
        let errorMessage: string;
        if (err instanceof Anthropic.APIConnectionTimeoutError) {
          errorMessage =
            "Request timed out after 25 seconds. Please try again.";
          console.error(`[claude][${requestId}] Step 2: Claude timeout`);
        } else if (
          err instanceof Anthropic.RateLimitError ||
          (err instanceof Anthropic.InternalServerError &&
            (err as InstanceType<typeof Anthropic.InternalServerError>)
              .status === 529)
        ) {
          errorMessage =
            "Claude is currently rate-limited or overloaded. Please try again in a moment.";
          console.error(`[claude][${requestId}] Step 2: Claude rate-limited / overloaded`);
        } else {
          errorMessage = "An unexpected error occurred. Please try again.";
          console.error(`[claude][${requestId}] Step 2: unexpected Claude error:`, err);
        }
        replyBody = buildErrorCard(errorMessage);
        fallbackText = errorMessage;
      }

      // Step 3: PATCH placeholder with result (cardsV2 first, plain-text fallback per RESP-03)
      console.log(`[claude][${requestId}] Step 3: patching message ${messageName}`);
      try {
        await chatClient.spaces.messages.patch({
          name: messageName,
          updateMask: "cardsV2",
          requestBody: replyBody,
        });
        console.log(`[claude][${requestId}] Step 3: cardsV2 patch success`);
        console.log(
          JSON.stringify({
            requestId,
            spaceId: spaceName,
            command: argumentText,
            latencyMs: Date.now() - startTime,
            status: "ok",
          }),
        );
      } catch (err) {
        // RESP-03: card schema failed — fall back to plain text
        console.warn(`[claude][${requestId}] Step 3: cardsV2 patch failed, trying plain text:`, err);
        try {
          await chatClient.spaces.messages.patch({
            name: messageName,
            updateMask: "text",
            requestBody: { text: fallbackText },
          });
          console.log(`[claude][${requestId}] Step 3: plain-text patch success`);
          console.log(
            JSON.stringify({
              requestId,
              spaceId: spaceName,
              command: argumentText,
              latencyMs: Date.now() - startTime,
              status: "ok",
            }),
          );
        } catch (err2) {
          console.error(`[claude][${requestId}] Step 3: both patches failed:`, err2);
          console.log(
            JSON.stringify({
              requestId,
              spaceId: spaceName,
              command: argumentText,
              latencyMs: Date.now() - startTime,
              status: "error",
            }),
          );
        }
      }

      console.log(`[claude][${requestId}] DONE latencyMs=${Date.now() - startTime}`);
    })();
  });
}

/** Command ID 2 — Frappe integration */
function handleFrappe(req: Request, res: Response): void {
  const prompt = (
    req.body?.chat?.appCommandPayload?.message?.argumentText ?? ""
  ).trim();
  console.log("🔗 Frappe integration coming soon!");
  res.status(200).json({ text: `🔗 Frappe integration coming soon! You asked: ${prompt}` });
}

// ---------------------------------------------------------------------------
// Command registry — add new slash commands here
// ---------------------------------------------------------------------------

const COMMAND_HANDLERS: Record<number, CommandHandler> = {
  1: handleClaude,
  2: handleFrappe,
  // 3: handleSomethingElse,
};

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export async function handleChatEvent(
  req: Request,
  res: Response,
): Promise<void> {
  // Guard: only handle slash command events
  if (
    req.body?.chat?.appCommandPayload?.appCommandMetadata?.appCommandType !==
    "SLASH_COMMAND"
  ) {
    res.status(200).json({});
    return;
  }

  const appCommandId: number =
    req.body?.chat?.appCommandPayload?.appCommandMetadata?.appCommandId;

  const handler = COMMAND_HANDLERS[appCommandId];

  if (!handler) {
    // Unknown command ID — silently ignore
    res.status(200).json({});
    return;
  }

  await handler(req, res);
}
