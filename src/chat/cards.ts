export function buildUsageHintCard(): object {
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

export function buildReplyCard(replyText: string): object {
  return {
    cardsV2: [
      {
        cardId: 'claude-reply',
        card: {
          header: { title: 'Claude' },
          sections: [
            {
              widgets: [
                { textParagraph: { text: replyText } },
              ],
            },
          ],
        },
      },
    ],
  };
}

export function buildErrorCard(errorMessage: string): object {
  return {
    cardsV2: [
      {
        cardId: 'claude-error',
        card: {
          header: { title: 'Claude', subtitle: 'Error' },
          sections: [
            {
              widgets: [
                { textParagraph: { text: errorMessage } },
              ],
            },
          ],
        },
      },
    ],
  };
}

export function buildThinkingCard(): object {
  return {
    cardsV2: [
      {
        cardId: 'thinking',
        card: {
          header: { title: 'Claude', subtitle: 'Thinking...' },
          sections: [],
        },
      },
    ],
  };
}
