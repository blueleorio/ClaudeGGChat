import Anthropic from '@anthropic-ai/sdk';
import { callClaude } from '../claude/anthropicClient';

jest.mock('@anthropic-ai/sdk');

const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

describe('callClaude', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    MockedAnthropic.prototype.messages = {
      create: mockCreate,
    } as unknown as Anthropic['messages'];
  });

  it('calls anthropic.messages.create with model claude-sonnet-4-6 (CLDE-01)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello' }],
    });
    await callClaude('test prompt');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
      expect.anything(),
    );
  });

  it('calls anthropic.messages.create with SEV_SYSTEM_PROMPT as system field (CLDE-01)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello' }],
    });
    await callClaude('test prompt');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ system: expect.any(String) }),
      expect.anything(),
    );
  });

  it('calls anthropic.messages.create with { timeout: 25000 } as per-request option (CLDE-05)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello' }],
    });
    await callClaude('test prompt');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 25_000 }),
    );
  });

  it('returns text from message.content[0].text (CLDE-01)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Reply text' }],
    });
    const result = await callClaude('test prompt');
    expect(result).toBe('Reply text');
  });

  it('rejects with RateLimitError when SDK throws RateLimitError (CLDE-04)', async () => {
    const error = new Anthropic.RateLimitError(
      429,
      { error: { type: 'rate_limit_error', message: 'Rate limited' } },
      'Rate limited',
      new Headers(),
    );
    mockCreate.mockRejectedValue(error);
    await expect(callClaude('test prompt')).rejects.toBeInstanceOf(Anthropic.RateLimitError);
  });

  it('rejects with InternalServerError (status 529) when SDK throws it (CLDE-04)', async () => {
    const error = new Anthropic.InternalServerError(
      529,
      { error: { type: 'overloaded_error', message: 'Overloaded' } },
      'Overloaded',
      new Headers(),
    );
    mockCreate.mockRejectedValue(error);
    await expect(callClaude('test prompt')).rejects.toBeInstanceOf(Anthropic.InternalServerError);
  });

  it('rejects with APIConnectionTimeoutError when SDK throws it (CLDE-05)', async () => {
    const error = new Anthropic.APIConnectionTimeoutError();
    mockCreate.mockRejectedValue(error);
    await expect(callClaude('test prompt')).rejects.toBeInstanceOf(
      Anthropic.APIConnectionTimeoutError,
    );
  });

  it('passes context messages before user prompt in messages array when context provided (CLDE-02)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Reply' }],
    });
    const context = [{ role: 'user' as const, content: 'prior message' }];
    // @ts-expect-error: callClaude does not accept context yet — RED test, Plan 02 adds the param
    await callClaude('prompt', context);
    const callArgs = mockCreate.mock.calls[0][0];
    const messages: { role: string; content: string }[] = callArgs.messages;
    const contextIndex = messages.findIndex(m => m.content === 'prior message');
    const promptIndex = messages.findIndex(m => m.content === 'prompt');
    expect(contextIndex).toBeGreaterThanOrEqual(0);
    expect(promptIndex).toBeGreaterThan(contextIndex);
  });

  it('calls anthropic.messages.create with only user prompt when no context provided (CLDE-02 backward compat)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Reply' }],
    });
    // No second arg — backward compat check; this assertion fails until Plan 02 tightens messages array
    await callClaude('test prompt');
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toEqual([{ role: 'user', content: 'test prompt' }]);
  });
});
