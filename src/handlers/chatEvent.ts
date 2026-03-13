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

function handleFrappe(prompt: string): string {
  return `🔗 Frappe integration coming soon! You asked: ${prompt}`;
}

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

  const appCommandId =
    req.body?.chat?.appCommandPayload?.appCommandMetadata?.appCommandId;

  // Route /frappe (command ID 2)
  if (appCommandId === 2) {
    const prompt = (
      req.body?.chat?.appCommandPayload?.message?.argumentText ?? ""
    ).trim();
    res.status(200).json({ text: handleFrappe(prompt) });
    return;
  }

  const argumentText = (
    req.body?.chat?.appCommandPayload?.message?.argumentText ?? ""
  ).trim();

  // HOOK-03: Empty prompt — return usage hint card synchronously
  if (!argumentText) {
    res.status(200).json(buildUsageHintCard());
    return;
  }

  // HOOK-02: Non-empty prompt — acknowledge immediately, process async
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

      // Step 0: Fetch thread context (best-effort — CONT-03)
      let contextMessages: ContextMessage[] = [];
      try {
        const listRes = await chatClient.spaces.messages.list({
          parent: spaceName,
          pageSize: 10,
          orderBy: "createTime DESC",
          filter: `thread.name = "${threadName}"`,
        });
        let rawMessages = (listRes.data.messages ?? []).reverse();

        // Fallback: if filter returned empty and thread exists, try client-side filter
        if (rawMessages.length === 0 && threadName) {
          const fallbackRes = await chatClient.spaces.messages.list({
            parent: spaceName,
            pageSize: 50,
            orderBy: "createTime DESC",
          });
          rawMessages = (fallbackRes.data.messages ?? [])
            .filter((m: any) => m.thread?.name === threadName)
            .slice(0, 10)
            .reverse();
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
          .map((m: any) => ({ role: "user" as const, content: m.text as string }));
      } catch {
        // CONT-03: best-effort — proceed without context on any error (including 403)
      }

      // Step 1: Post "Thinking..." placeholder card
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
      } catch (err) {
        console.error("[async] Failed to post Thinking card:", err);
        return; // No message to PATCH — exit early
      }

      // Step 2: Call Claude and build reply or error card body
      let replyBody: object;
      let fallbackText: string;
      try {
        const replyText = await callClaude(argumentText, contextMessages);
        replyBody = buildReplyCard(replyText);
        fallbackText = replyText;
      } catch (err) {
        let errorMessage: string;
        if (err instanceof Anthropic.APIConnectionTimeoutError) {
          errorMessage =
            "Request timed out after 25 seconds. Please try again.";
        } else if (
          err instanceof Anthropic.RateLimitError ||
          (err instanceof Anthropic.InternalServerError &&
            (err as InstanceType<typeof Anthropic.InternalServerError>)
              .status === 529)
        ) {
          errorMessage =
            "Claude is currently rate-limited or overloaded. Please try again in a moment.";
        } else {
          errorMessage = "An unexpected error occurred. Please try again.";
        }
        replyBody = buildErrorCard(errorMessage);
        fallbackText = errorMessage;
      }

      // Step 3: PATCH placeholder with result (cardsV2 first, plain-text fallback per RESP-03)
      try {
        await chatClient.spaces.messages.patch({
          name: messageName,
          updateMask: "cardsV2",
          requestBody: replyBody,
        });
        // Log after successful PATCH (INFRA-04)
        console.log(
          JSON.stringify({
            requestId,
            spaceId: spaceName,
            command: argumentText,
            latencyMs: Date.now() - startTime,
            status: "ok",
          }),
        );
      } catch {
        // RESP-03: card schema failed — fall back to plain text
        try {
          await chatClient.spaces.messages.patch({
            name: messageName,
            updateMask: "text",
            requestBody: { text: fallbackText },
          });
          // Log after successful text fallback PATCH (INFRA-04)
          console.log(
            JSON.stringify({
              requestId,
              spaceId: spaceName,
              command: argumentText,
              latencyMs: Date.now() - startTime,
              status: "ok",
            }),
          );
        } catch {
          console.error(
            "[async] Failed to post both card and plain-text reply for message:",
            messageName,
          );
          // Log on full PATCH failure (INFRA-04)
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
    })();
  });
}
