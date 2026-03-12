import { Request, Response } from 'express';

function buildUsageHintCard() {
  return {
    cardsV2: [
      {
        cardId: 'usage-hint',
        card: {
          header: {
            title: 'Claude',
            subtitle: 'Usage hint',
          },
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: 'To ask Claude a question, type:<br><b>/claude [your question]</b><br><br>Example: <i>/claude Summarize the last SEV incident</i>',
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

export async function handleChatEvent(req: Request, res: Response): Promise<void> {
  const argumentText = (req.body.message?.argumentText ?? '').trim();

  // HOOK-03: Empty prompt — respond synchronously with usage hint card
  if (!argumentText) {
    res.status(200).json(buildUsageHintCard());
    return;
  }

  // HOOK-02: Non-empty prompt — acknowledge immediately, process async
  res.status(200).json({});

  // Async stub: Phase 3 will replace this with real Anthropic + Chat API call
  setImmediate(async () => {
    const spaceName: string = req.body.space?.name ?? '';
    const threadName: string = req.body.message?.thread?.name ?? '';
    console.log(`[async] Space: ${spaceName}, Thread: ${threadName}, Prompt: "${argumentText}"`);
    // Phase 3: call Anthropic API and post card via googleapis
  });
}
