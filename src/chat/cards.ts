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
