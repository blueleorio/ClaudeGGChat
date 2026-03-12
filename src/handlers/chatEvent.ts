import { Request, Response } from 'express';
import { buildUsageHintCard } from '../chat/cards';

export async function handleChatEvent(req: Request, res: Response): Promise<void> {
  // Guard: only handle slash command events
  if (!req.body?.message?.slashCommand) {
    res.status(200).json({});
    return;
  }

  const argumentText = (req.body.message?.argumentText ?? '').trim();

  // HOOK-03: Empty prompt — return usage hint card synchronously
  if (!argumentText) {
    res.status(200).json(buildUsageHintCard());
    return;
  }

  // HOOK-02: Non-empty prompt — acknowledge immediately, process async
  res.status(200).json({});

  // Async stub — Phase 3 replaces this with Anthropic API call + Chat card post
  setImmediate(() => {
    void (async () => {
      const spaceName: string = req.body.space.name;
      const threadName: string = req.body.message.thread.name;
      console.log(`[async] Space: ${spaceName}, Thread: ${threadName}, Prompt: "${argumentText}"`);
      // Phase 3: call Anthropic API and post reply card via googleapis
    })();
  });
}
