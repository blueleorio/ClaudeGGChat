import { buildUsageHintCard, buildReplyCard, buildErrorCard } from '../chat/cards';

describe('buildUsageHintCard', () => {
  it('returns a cardsV2 array with one card', () => {
    const result = buildUsageHintCard() as { cardsV2: unknown[] };
    expect(result).toHaveProperty('cardsV2');
    expect(Array.isArray(result.cardsV2)).toBe(true);
    expect(result.cardsV2).toHaveLength(1);
  });

  it('card has cardId "usage-hint"', () => {
    const result = buildUsageHintCard() as { cardsV2: Array<{ cardId: string }> };
    expect(result.cardsV2[0].cardId).toBe('usage-hint');
  });

  it('card header title is "Claude"', () => {
    const result = buildUsageHintCard() as {
      cardsV2: Array<{ card: { header: { title: string; subtitle: string } } }>;
    };
    expect(result.cardsV2[0].card.header.title).toBe('Claude');
  });

  it('card header subtitle is "Usage hint"', () => {
    const result = buildUsageHintCard() as {
      cardsV2: Array<{ card: { header: { title: string; subtitle: string } } }>;
    };
    expect(result.cardsV2[0].card.header.subtitle).toBe('Usage hint');
  });

  it('card has at least one section with widgets', () => {
    const result = buildUsageHintCard() as {
      cardsV2: Array<{ card: { sections: Array<{ widgets: unknown[] }> } }>;
    };
    expect(result.cardsV2[0].card.sections).toHaveLength(1);
    expect(result.cardsV2[0].card.sections[0].widgets.length).toBeGreaterThan(0);
  });
});

describe('buildReplyCard', () => {
  it('returns object with cardsV2 array (RESP-01)', () => {
    const result = buildReplyCard('Hello from Claude') as { cardsV2: unknown[] };
    expect(result).toHaveProperty('cardsV2');
    expect(Array.isArray(result.cardsV2)).toBe(true);
  });

  it('card header title is "Claude" (RESP-01)', () => {
    const result = buildReplyCard('Hello from Claude') as {
      cardsV2: Array<{ card: { header: { title: string } } }>;
    };
    expect(result.cardsV2[0].card.header.title).toBe('Claude');
  });

  it('card has at least one section widget containing the reply text (RESP-01)', () => {
    const text = 'Reply text content';
    const result = buildReplyCard(text) as {
      cardsV2: Array<{ card: { sections: Array<{ widgets: Array<{ textParagraph: { text: string } }> }> } }>;
    };
    const widgets = result.cardsV2[0].card.sections[0].widgets;
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].textParagraph.text).toContain(text);
  });
});

describe('buildErrorCard', () => {
  it('returns object with cardsV2 array (RESP-02)', () => {
    const result = buildErrorCard('some error') as { cardsV2: unknown[] };
    expect(result).toHaveProperty('cardsV2');
    expect(Array.isArray(result.cardsV2)).toBe(true);
  });

  it('card header title is "Claude" (RESP-02)', () => {
    const result = buildErrorCard('some error') as {
      cardsV2: Array<{ card: { header: { title: string } } }>;
    };
    expect(result.cardsV2[0].card.header.title).toBe('Claude');
  });

  it('card widget text contains the error message (RESP-02)', () => {
    const errorMsg = 'some error';
    const result = buildErrorCard(errorMsg) as {
      cardsV2: Array<{ card: { sections: Array<{ widgets: Array<{ textParagraph: { text: string } }> }> } }>;
    };
    const widgets = result.cardsV2[0].card.sections[0].widgets;
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].textParagraph.text).toContain(errorMsg);
  });
});
