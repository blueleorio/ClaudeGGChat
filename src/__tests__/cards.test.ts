import { buildUsageHintCard } from '../chat/cards';

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
