import { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatClient } from "../chat/chatClient";
import { callClaude } from "../claude/anthropicClient";
import {
  buildUsageHintCard,
  buildReplyCard,
  buildErrorCard,
  buildThinkingCard,
} from "../chat/cards";

export async function handleChatEvent(
  req: Request,
  res: Response,
): Promise<void> {
  // Guard: only handle slash command events
  if (!req.body?.message?.slashCommand) {
    res.status(200).json({});
    return;
  }

  const argumentText = (req.body.message?.argumentText ?? "").trim();

  // HOOK-03: Empty prompt — return usage hint card synchronously
  if (!argumentText) {
    res.status(200).json(buildUsageHintCard());
    return;
  }

  // HOOK-02: Non-empty prompt — acknowledge immediately, process async
  res.status(200).json({});

  setImmediate(() => {
    void (async () => {
      const spaceName: string = req.body.space.name;
      const threadName: string = req.body.message.thread.name;

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
        const replyText = await callClaude(argumentText);
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
      } catch {
        // RESP-03: card schema failed — fall back to plain text
        try {
          await chatClient.spaces.messages.patch({
            name: messageName,
            updateMask: "text",
            requestBody: { text: fallbackText },
          });
        } catch {
          console.error(
            "[async] Failed to post both card and plain-text reply for message:",
            messageName,
          );
        }
      }
    })();
  });
}
